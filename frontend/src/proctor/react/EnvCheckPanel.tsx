// 시험 전 환경 점검 (PC): 장치·모니터·조명·자세·귀·손목 → 휴대폰 영상으로 조명·책상 스캔 (분석은 PC 가 한다).
// 통과하면 결과 JSON(휴대폰 결과 포함)을 onPassed 로 넘긴다. 호출하는 쪽이 동의 API 로 저장한다.
import { useEffect, useRef, useState } from 'react'
import type { FaceLandmarkerResult, HandLandmarkerResult, PoseLandmarkerResult } from '@mediapipe/tasks-vision'
import { RefreshCw, ScanFace } from 'lucide-react'
import { Button } from '../../components/ui'
import { camHub } from '../camHub.ts'
import {
  audioVerdict,
  cameraVerdict,
  HeadTurnTracker,
  lightingVerdict,
  lumaStats,
  makeReport,
  placementVerdict,
  rendererVerdict,
  screensVerdict,
  type CheckItem,
  type CheckReport,
  type Verdict,
  updateItem,
} from '../check/envChecks.ts'
import { audioProbe, grabPixels, isAutomated, isChromium, screenInfo, webglRenderer } from '../check/probes.ts'
import type { Box } from '../core/phoneRules.ts'
import type { ScanStage } from '../relay/protocol.ts'
import { attachHiddenVideo, captureSnapshot, frameLoop } from '../vision/camera.ts'
import { headPoseFromMatrix, shouldersFromPose } from '../vision/features.ts'
import { CamPreview } from './CamPreview.tsx'
import { CheckList } from './CheckList.tsx'
import { PhonePairCard } from './PhonePairCard.tsx'
import { useCamHub } from './useCamHub.ts'
import { SCAN_MAX_RESUMES, runDeskScan, waitForNewStream, waitForScanResolution } from '../check/deskScan.ts'
import { CAN_SKIP_CHECKS, clearChecksSkipped, markChecksSkipped } from '../testSkip.ts'

export type EnvCheckResult = { pc: CheckReport; phone: CheckReport | null }

const INITIAL: CheckItem[] = [
  { id: 'browser', label: '브라우저', status: 'pending', detail: '' },
  { id: 'graphics', label: '원격 접속·가상 머신', status: 'pending', detail: '' },
  { id: 'screens', label: '모니터', status: 'pending', detail: '' },
  { id: 'camera', label: '카메라 (가상 카메라 여부)', status: 'pending', detail: '' },
  { id: 'audio', label: '이어폰·헤드셋 연결 / 주변 소음', status: 'pending', detail: '' },
  { id: 'lighting', label: '조명', status: 'pending', detail: '' },
  { id: 'placement', label: '얼굴 위치 · 혼자 있는지', status: 'pending', detail: '' },
  { id: 'ears', label: '양쪽 귀 (이어폰 착용 여부)', status: 'pending', detail: '' },
  { id: 'wrist', label: '양 손목 (스마트워치 · 손에 쓴 글씨)', status: 'pending', detail: '' },
  { id: 'phone', label: '휴대폰 캠: 조명·책상 위 스캔', status: 'pending', detail: '' },
]

const HOLD_MS = 1500
const POSE_TIMEOUT_MS = 25000
/** 점검 중 분석 간격(약 15fps). 얼굴·포즈·손 모델이 메인 스레드에서 동기로 돌아 매 프레임(30fps) 돌리면 화면이 버벅인다 */
const MIN_ANALYSIS_GAP_MS = 66

type Needs = { face?: boolean; pose?: boolean; hand?: boolean }
const EMPTY_FACE = { faceLandmarks: [], facialTransformationMatrixes: undefined } as unknown as FaceLandmarkerResult
const EMPTY_HANDS = { landmarks: [] } as unknown as HandLandmarkerResult
type FrameInfo = { faceCount: number; box?: Box; yaw?: number; shouldersVisible: boolean; handCount: number }

/** 카메라 미리보기 + 휴대폰 연결 (EnvCheckPanel 옆이나, 입장 화면의 왼쪽 스포트라이트에 둔다) */
export function EnvAside() {
  return (
    <div className="flex flex-col gap-3">
      <div className="aspect-[4/3] overflow-hidden rounded-xl border border-line bg-panel-raised">
        <CamPreview />
      </div>
      <PhonePairCard />
    </div>
  )
}

/** withAside=false 면 점검 목록만 그린다 (미리보기·QR 은 EnvAside 로 따로 둔다) */
export default function EnvCheckPanel({ onPassed, withAside = true }: { onPassed: (r: EnvCheckResult) => void; withAside?: boolean }) {
  const hub = useCamHub()
  const [items, setItems] = useState(INITIAL)
  const [prompt, setPrompt] = useState('')
  const [result, setResult] = useState<EnvCheckResult | null>(null)
  const [run, setRun] = useState(0)
  const [skipPhone, setSkipPhone] = useState(false)
  /** 휴대폰으로 감지된 장면: 응시자가 맞는지 확인할 때까지 스캔이 기다린다 */
  const [found, setFound] = useState<string[]>([])

  // 진행 중인 비동기 작업이 최신 허브 상태(폰 결과·사진)를 읽기 위한 ref
  const live = useRef(hub)
  const skipPhoneRef = useRef(skipPhone)
  // 다시 점검할 때 통과한 항목을 건너뛰기 위해 직전 점검 상태를 들고 있는다
  const itemsRef = useRef(items)
  const phoneReportRef = useRef<CheckReport | null>(null)
  const fullRerunRef = useRef(false)
  useEffect(() => {
    live.current = hub
    skipPhoneRef.current = skipPhone
    itemsRef.current = items
  })

  useEffect(() => {
    let cancelled = false
    let stopLoop: (() => void) | null = null
    // 통과한 항목은 그대로 두고 나머지(실패·주의·미완료)만 다시 한다. 처음이거나 "처음부터"를 눌렀으면 전부 한다
    const keep = new Set(fullRerunRef.current ? [] : itemsRef.current.filter((i) => i.status === 'pass').map((i) => i.id))
    fullRerunRef.current = false
    if (keep.size === 0) phoneReportRef.current = null
    const todo = (id: string) => !keep.has(id)
    let current = INITIAL.map((i) => (keep.has(i.id) ? { ...(itemsRef.current.find((p) => p.id === i.id) ?? i) } : { ...i }))
    const set = (id: string, patch: Partial<CheckItem>) => {
      // 매 프레임 같은 문구로 다시 그리지 않는다 (화면 갱신 폭주 방지)
      const prev = current.find((i) => i.id === id)
      if (prev && (Object.keys(patch) as (keyof CheckItem)[]).every((k) => prev[k] === patch[k])) return
      current = updateItem(current, id, patch)
      if (!cancelled) setItems(current)
    }
    const apply = (id: string, v: Verdict) => set(id, { status: v.status, detail: v.detail })

    async function main() {
      setItems(current)
      setResult(null)
      const redoStages: ScanStage[] = []
      if (todo('ears')) redoStages.push('ear-left', 'ear-right')
      if (todo('wrist')) redoStages.push('wrist')
      if (todo('phone')) redoStages.push('desk')
      camHub.resetCheck(redoStages)
      setPrompt('카메라와 분석 모델을 준비하는 중입니다 (처음 한 번은 조금 걸립니다)')
      try {
        await camHub.openCamera()
      } catch {
        setPrompt('')
        return // 오류 문구는 허브 상태로 보여 준다
      }
      if (cancelled) return
      const video = camHub.video()
      const stream = camHub.stream()!
      const models = camHub.models()!

      /** 매 프레임 분석하면서 check 가 true 를 돌려줄 때까지 기다린다 */
      const waitFrames = (check: (f: FrameInfo, now: number) => boolean, timeoutMs = Infinity, needs: Needs = { face: true, pose: true }) =>
        new Promise<boolean>((resolve) => {
          let lastPose: PoseLandmarkerResult | undefined
          let frame = 0
          let lastRun = -Infinity
          const begin = performance.now()
          stopLoop = frameLoop(video, (now) => {
            if (cancelled) return
            if (now - lastRun < MIN_ANALYSIS_GAP_MS) return
            lastRun = now
            // 이 단계에 필요한 모델만 돌린다 (조명·위치: 얼굴+포즈, 귀: 얼굴, 손목: 손)
            const face = needs.face ? models.face.detectForVideo(video, now) : EMPTY_FACE
            if (needs.pose && frame++ % 2 === 0) lastPose = models.pose.detectForVideo(video, now)
            const hands = needs.hand ? models.hand.detectForVideo(video, now) : EMPTY_HANDS
            const lm = face.faceLandmarks[0]
            let box: Box | undefined
            if (lm) {
              const xs = lm.map((p) => p.x)
              const ys = lm.map((p) => p.y)
              const x = Math.min(...xs)
              const y = Math.min(...ys)
              box = { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
            }
            const m = face.facialTransformationMatrixes?.[0]
            const ok = check(
              {
                faceCount: face.faceLandmarks.length,
                box,
                yaw: m ? headPoseFromMatrix(m.data).yaw : undefined,
                shouldersVisible: !!shouldersFromPose(lastPose),
                handCount: hands.landmarks.length,
              },
              now,
            )
            if (ok || now - begin > timeoutMs) {
              stopLoop?.()
              resolve(ok)
            }
          })
        })

      const snap = (stage: ScanStage) => {
        const image = captureSnapshot(video, 640, 0.8)
        if (image) camHub.addPcFrame(stage, image)
      }

      /** 고개를 한쪽으로 끝까지 돌린 순간 (얼굴 모델이 옆모습에서 얼굴을 놓쳐도 인정). avoidSign 쪽은 제외 */
      const waitHeadTurn = (avoidSign: number) => {
        const tracker = new HeadTurnTracker(avoidSign)
        let turned = 0
        return waitFrames(
          (f, now) => {
            turned = tracker.update(f.yaw, f.faceCount, now)
            return turned !== 0
          },
          POSE_TIMEOUT_MS,
          { face: true },
        ).then((ok) => (ok ? turned : 0))
      }

      /** 휴대폰 영상을 고화질로 바꿔 받아 조명·책상을 스캔한다. 끝나면 화질을 되돌리고 스캔 모델을 닫는다. 건너뛰기를 누르면 null */
      let phoneLost = false
      const scanStopped = (phoneStream: MediaStream) => {
        // 스캔 도중 휴대폰 영상이 끊기거나 다른 영상으로 바뀌면 프레임이 멈춰 스캔이 끝나지 않는다
        if (live.current.phoneStream !== phoneStream) phoneLost = true
        return cancelled || skipPhoneRef.current || phoneLost
      }
      /** 영상이 끊기면 새 영상이 오기를 기다렸다가 스캔을 처음부터 다시 한다 (순간 끊김·재연결로 곧바로 실패하지 않게) */
      const scanDeskWithPhone = async (first: MediaStream): Promise<CheckReport | null> => {
        let stream = first
        for (let resume = 0; ; resume++) {
          phoneLost = false
          const report = await scanOnce(stream)
          if (report || !phoneLost || cancelled || skipPhoneRef.current || resume >= SCAN_MAX_RESUMES) return report
          set('phone', { status: 'running', detail: '휴대폰 영상이 끊겨 다시 연결되기를 기다리는 중 (최대 60초)' })
          setPrompt('휴대폰 영상이 끊겼습니다. 휴대폰 화면을 켜고 "보조 캠 시작"을 다시 눌러 주세요. 영상이 오면 스캔을 이어서 합니다')
          const next = await waitForNewStream(() => live.current.phoneStream, stream, () => cancelled || skipPhoneRef.current)
          if (!next) {
            phoneLost = true
            return null
          }
          stream = next
        }
      }
      const scanOnce = async (phoneStream: MediaStream): Promise<CheckReport | null> => {
        setPrompt('휴대폰 영상을 고화질로 바꾸는 중입니다')
        set('phone', { detail: '스캔 모델을 준비하는 중 (처음 한 번은 조금 걸립니다)' })
        const { video: phoneVideo, release } = await attachHiddenVideo(phoneStream)
        try {
          camHub.setPhoneQuality('scan')
          const models = await import('../vision/models.ts')
          const detector = await models.createScanDetector()
          await waitForScanResolution(phoneVideo, () => scanStopped(phoneStream))
          if (scanStopped(phoneStream)) return null
          const report = await runDeskScan({
            video: phoneVideo,
            detector,
            onItems: (items) => {
              const worst = items.find((i) => i.status === 'running') ?? items[items.length - 1]
              set('phone', { status: 'running', detail: `${worst.label}: ${worst.detail || '확인 중'}` })
            },
            onPrompt: setPrompt,
            onFound: setFound,
            onFrame: (_stage, image, objects) => camHub.recordDeskPhoto(image, objects),
            onTorch: (on) => camHub.setPhoneTorch(on),
            isCancelled: () => scanStopped(phoneStream),
          })
          return scanStopped(phoneStream) ? null : report
        } finally {
          camHub.setPhoneQuality('watch')
          release()
          setFound([])
        }
      }

      // 1) 브라우저·장치 (즉시)
      setPrompt('')
      if (todo('browser')) {
        if (isAutomated()) apply('browser', { status: 'fail', detail: '자동화 도구로 제어되는 브라우저입니다.' })
        else apply('browser', isChromium() ? { status: 'pass', detail: 'Chromium 계열' } : { status: 'warn', detail: 'Chrome·Edge 를 권장합니다 (모니터 확인 기능).' })
      }
      if (todo('graphics')) apply('graphics', rendererVerdict(webglRenderer()))
      if (todo('screens')) {
        set('screens', { status: 'running', detail: '확인 중 (권한 창이 뜨면 허용해 주세요)' })
        const sc = await screenInfo()
        apply('screens', screensVerdict(sc.count, sc.isExtended))
      }
      if (todo('camera')) apply('camera', cameraVerdict(stream.getVideoTracks()[0]?.label ?? ''))
      if (todo('audio')) {
        set('audio', { status: 'running', detail: '마이크로 2초간 확인 중 (조용히 해 주세요)' })
        const audio = await audioProbe()
        const av = audioVerdict(audio.labels)
        const noisy = audio.noiseDb !== null && audio.noiseDb > -35
        const noise = audio.noiseDb === null ? '' : ` · 소음 ${audio.noiseDb.toFixed(0)} dBFS${noisy ? ' (시끄러움)' : ''}`
        apply('audio', { status: av.status === 'pass' && noisy ? 'warn' : av.status, detail: av.detail + noise })
      }
      if (cancelled) return

      // 2) 조명·자세: 좋은 상태가 1.5초 이어지면 통과 (둘 중 통과하지 못한 것만 다시 본다)
      const needLight = todo('lighting')
      const needPlace = todo('placement')
      if (needLight || needPlace) {
        if (needLight) set('lighting', { status: 'running' })
        if (needPlace) set('placement', { status: 'running' })
        setPrompt('화면을 정면으로 보고 바르게 앉아 주세요')
        let goodSince: number | null = null
        let lastLight: Verdict = { status: 'fail', detail: '' }
        let lastPlace: Verdict = { status: 'fail', detail: '' }
        await waitFrames((f, now) => {
          const px = grabPixels(video)
          if (!px) return false
          lastLight = lightingVerdict(lumaStats(px.data, px.width, px.height), f.box ? lumaStats(px.data, px.width, px.height, f.box) : undefined)
          lastPlace = placementVerdict({ faceCount: f.faceCount, box: f.box, shouldersVisible: f.shouldersVisible })
          if (needLight) set('lighting', { detail: lastLight.detail })
          if (needPlace) set('placement', { detail: lastPlace.detail })
          if ((needLight && lastLight.status === 'fail') || (needPlace && lastPlace.status === 'fail')) {
            goodSince = null
            return false
          }
          goodSince ??= now
          return now - goodSince >= HOLD_MS
        })
        if (needLight) apply('lighting', lastLight)
        if (needPlace) apply('placement', lastPlace)
      }
      if (cancelled) return

      // 3) 귀: 한쪽 → 반대쪽으로 고개를 돌린 순간을 찍는다
      if (todo('ears')) {
        set('ears', { status: 'running' })
        setPrompt('고개를 천천히 왼쪽(또는 오른쪽)으로 끝까지 돌려 귀를 보여 주세요')
        const first = await waitHeadTurn(0)
        if (first) snap('ear-left')
        setPrompt('이번에는 반대쪽으로 끝까지 돌려 주세요')
        const second = first ? await waitHeadTurn(first) : 0
        if (second) snap('ear-right')
        apply('ears', second ? { status: 'pass', detail: '양쪽 귀 사진 확보 (감독 기록에 남습니다)' } : { status: 'warn', detail: '귀를 충분히 보여 주지 않았습니다.' })
      }
      if (cancelled) return

      // 4) 손목: 두 손을 1초 보여 주기
      if (todo('wrist')) {
        set('wrist', { status: 'running' })
        setPrompt('양 손목과 손바닥을 카메라 앞에 1초간 보여 주세요 (소매를 걷어 주세요)')
        let handsSince: number | null = null
        const wristOk = await waitFrames(
          (f, now) => {
            if (f.handCount < 2) {
              handsSince = null
              return false
            }
            handsSince ??= now
            return now - handsSince > 1000
          },
          POSE_TIMEOUT_MS,
          { hand: true },
        )
        if (wristOk) snap('wrist')
        apply('wrist', wristOk ? { status: 'pass', detail: '손목 사진 확보 (감독 기록에 남습니다)' } : { status: 'warn', detail: '두 손이 함께 보이지 않았습니다.' })
      }
      if (cancelled) return

      // 5) 휴대폰 영상으로 조명·책상 스캔 (휴대폰이 연결돼 영상이 올 때까지 기다린다)
      if (todo('phone')) {
        setPrompt('휴대폰을 연결해 주세요. 연결되면 이 화면의 안내에 따라 책상을 스캔합니다')
        set('phone', { status: 'running', detail: '휴대폰 연결을 기다리는 중' })
        while (!cancelled && !live.current.phoneStream && !skipPhoneRef.current) {
          set('phone', { detail: live.current.phone === 'connected' ? '휴대폰 영상을 받는 중' : '휴대폰이 연결되지 않았습니다. 오른쪽 QR 로 연결해 주세요.' })
          await new Promise((r) => setTimeout(r, 300))
        }
        if (cancelled) return
        const phoneStream = live.current.phoneStream
        let phoneReport: CheckReport | null = null
        if (phoneStream && !skipPhoneRef.current) phoneReport = await scanDeskWithPhone(phoneStream)
        if (cancelled) return
        phoneReportRef.current = phoneReport
        if (phoneReport) {
          const bad = phoneReport.items.filter((i) => i.status === 'fail' || i.status === 'warn')
          set('phone', {
            status: phoneReport.passed ? (bad.length ? 'warn' : 'pass') : 'fail',
            detail: bad.length ? bad.map((i) => `${i.label}: ${i.detail}`).join(' / ') : '이상 없음',
          })
        } else if (phoneLost) {
          apply('phone', { status: 'fail', detail: '스캔 도중 휴대폰 영상이 끊겼고 60초 안에 다시 연결되지 않았습니다. 휴대폰에서 "보조 캠 시작"이 "영상 송신 중"인지 확인한 뒤 "통과하지 못한 항목만 다시"를 눌러 주세요.' })
        } else {
          apply('phone', { status: 'warn', detail: '휴대폰 점검을 건너뛰었습니다 (감독 기록에 남습니다).' })
        }
      }

      setPrompt('')
      if (cancelled) return
      setResult({ pc: makeReport(current), phone: phoneReportRef.current })
    }

    void main()
    return () => {
      cancelled = true
      stopLoop?.()
    }
  }, [run])

  const passed = result?.pc.passed && (result.phone?.passed ?? true)
  // 테스트용: 모든 점검을 통과한 것으로 보고 넘어간다. 개발 서버이거나 VITE_ALLOW_CHECK_SKIP=true 로 빌드했을 때만 보인다
  const canSkipChecks = CAN_SKIP_CHECKS
  const skipAllChecks = () => {
    const skipped = items.map((i) => ({ ...i, status: 'pass' as const, detail: '테스트용으로 건너뜀' }))
    markChecksSkipped()
    onPassed({ pc: makeReport(skipped), phone: null })
  }
  /** 통과(pass)가 아닌 항목 수. 실패·주의·미완료 모두 다시 본다 */
  const redoCount = items.filter((i) => i.status !== 'pass').length
  const rerun = (all: boolean) => {
    fullRerunRef.current = all
    setSkipPhone(false)
    setRun((n) => n + 1)
  }
  const phoneRunning = items.find((i) => i.id === 'phone')?.status === 'running'

  return (
    <div className={withAside ? 'grid grid-cols-[minmax(0,1fr)_320px] gap-5' : 'flex flex-col'}>
      <div className="flex min-w-0 flex-col gap-3">
        {prompt && (
          <p className="flex items-center gap-2 rounded-lg bg-brand-dim px-3 py-2 text-[14px] font-semibold text-brand" role="status">
            <ScanFace size={18} aria-hidden /> {prompt}
          </p>
        )}
        {hub.camera === 'error' && (
          <div role="alert" className="flex items-center gap-3 rounded-lg border border-alert/40 bg-alert/10 px-3 py-2 text-[14px] text-alert">
            <span className="min-w-0 flex-1 break-keep">{hub.error}</span>
            <Button size="sm" variant="secondary" onClick={() => setRun((n) => n + 1)}>
              <RefreshCw size={16} aria-hidden /> 다시 시도
            </Button>
          </div>
        )}
        {found.length > 0 && !result && <p className="text-[13px] text-text-muted">방금 찾은 것: {found.join(', ')}</p>}
        <CheckList items={items} />
        {canSkipChecks && (
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-line-strong px-3 py-2">
            <span className="text-[13px] text-text-muted">테스트용: 모든 점검을 통과한 것으로 처리합니다. 감독 기록에는 건너뜀으로 남습니다.</span>
            <Button variant="secondary" size="sm" className="ml-auto shrink-0" onClick={skipAllChecks}>
              점검 건너뛰기
            </Button>
          </div>
        )}
        {phoneRunning && !skipPhone && (
          <Button variant="ghost" size="sm" className="self-start" onClick={() => setSkipPhone(true)}>
            휴대폰 없이 진행
          </Button>
        )}
        {result && (
          <div className="flex items-center gap-3 border-t border-line pt-3">
            {passed ? (
              <>
                <p className="text-[14px] text-text">
                  점검을 통과했습니다{[...result.pc.items, ...(result.phone?.items ?? [])].some((i) => i.status === 'warn') ? ' (주의 항목은 감독 기록에 남습니다)' : ''}.
                </p>
                <Button variant="primary" className="ml-auto" onClick={() => {
                    clearChecksSkipped()
                    onPassed(result)
                  }}>
                  점검 결과 저장
                </Button>
              </>
            ) : (
              <p role="alert" className="text-[14px] text-alert">
                통과하지 못한 항목이 있습니다. 조치한 뒤 다시 점검해 주세요.
              </p>
            )}
            {redoCount > 0 && (
              <Button variant="ghost" size="sm" className={passed ? undefined : 'ml-auto'} onClick={() => rerun(false)}>
                <RefreshCw size={16} aria-hidden /> 통과하지 못한 항목만 다시 ({redoCount})
              </Button>
            )}
            <Button variant="ghost" size="sm" className={passed || redoCount > 0 ? undefined : 'ml-auto'} onClick={() => rerun(true)}>
              <RefreshCw size={16} aria-hidden /> 처음부터 다시
            </Button>
          </div>
        )}
      </div>
      {withAside && (
        <aside>
          <EnvAside />
        </aside>
      )}
    </div>
  )
}
