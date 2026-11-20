// 시험 전 환경 점검 (PC): 장치·모니터·조명·자세·귀·손목 → 휴대폰 방·책상 스캔 → 정밀 분석.
// 통과하면 결과 JSON(휴대폰 결과 포함)을 onPassed 로 넘긴다. 호출하는 쪽이 동의 API 로 저장한다.
import { useEffect, useRef, useState } from 'react'
import type { PoseLandmarkerResult } from '@mediapipe/tasks-vision'
import { RefreshCw, ScanFace } from 'lucide-react'
import { Button } from '../../components/ui'
import { camHub, type ScanFrame } from '../camHub.ts'
import type { DeepFinding } from '../check/deepScan.ts'
import {
  audioVerdict,
  cameraVerdict,
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
import { captureSnapshot, frameLoop } from '../vision/camera.ts'
import { headPoseFromMatrix, shouldersFromPose } from '../vision/features.ts'
import { CamPreview } from './CamPreview.tsx'
import { CheckList } from './CheckList.tsx'
import { PhonePairCard } from './PhonePairCard.tsx'
import { useCamHub } from './useCamHub.ts'
import { CAN_SKIP_CHECKS, clearChecksSkipped, markChecksSkipped } from '../testSkip.ts'

export type EnvCheckResult = { pc: CheckReport; phone: CheckReport | null; flagged: { stage: ScanStage; source: string; labels: string[] }[] }

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
  { id: 'phone', label: '휴대폰 캠: 방 360도 · 책상 위 스캔', status: 'pending', detail: '' },
  { id: 'deep', label: '정밀 분석 (메모지·이어폰·스마트워치 등)', status: 'pending', detail: '' },
]

const HOLD_MS = 1500
const POSE_TIMEOUT_MS = 25000
const HEAD_TURN_DEG = 45

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
  const [findings, setFindings] = useState<{ frame: ScanFrame; found: DeepFinding[] }[]>([])
  const [result, setResult] = useState<EnvCheckResult | null>(null)
  const [run, setRun] = useState(0)
  const [skipPhone, setSkipPhone] = useState(false)

  // 진행 중인 비동기 작업이 최신 허브 상태(폰 결과·사진)를 읽기 위한 ref
  const live = useRef(hub)
  const skipPhoneRef = useRef(skipPhone)
  useEffect(() => {
    live.current = hub
    skipPhoneRef.current = skipPhone
  })

  useEffect(() => {
    let cancelled = false
    let stopLoop: (() => void) | null = null
    let current = INITIAL.map((i) => ({ ...i }))
    const set = (id: string, patch: Partial<CheckItem>) => {
      current = updateItem(current, id, patch)
      if (!cancelled) setItems(current)
    }
    const apply = (id: string, v: Verdict) => set(id, { status: v.status, detail: v.detail })

    async function main() {
      setItems(current)
      setFindings([])
      setResult(null)
      camHub.resetCheck()
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
      const waitFrames = (check: (f: FrameInfo, now: number) => boolean, timeoutMs = Infinity) =>
        new Promise<boolean>((resolve) => {
          let lastPose: PoseLandmarkerResult | undefined
          let frame = 0
          const begin = performance.now()
          stopLoop = frameLoop(video, (now) => {
            if (cancelled) return
            const face = models.face.detectForVideo(video, now)
            if (frame++ % 2 === 0) lastPose = models.pose.detectForVideo(video, now)
            const hands = models.hand.detectForVideo(video, now)
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

      /** 고개를 한쪽으로 HEAD_TURN_DEG 이상 0.4초 돌린 순간. avoidSign 쪽은 제외 */
      const waitHeadTurn = (avoidSign: number) => {
        let held: number | null = null
        let sign = 0
        return waitFrames((f, now) => {
          if (f.yaw === undefined || Math.abs(f.yaw) < HEAD_TURN_DEG || Math.sign(f.yaw) === avoidSign) {
            held = null
            return false
          }
          held ??= now
          sign = Math.sign(f.yaw)
          return now - held > 400
        }, POSE_TIMEOUT_MS).then((ok) => (ok ? sign : 0))
      }

      // 1) 브라우저·장치 (즉시)
      setPrompt('')
      if (isAutomated()) apply('browser', { status: 'fail', detail: '자동화 도구로 제어되는 브라우저입니다.' })
      else apply('browser', isChromium() ? { status: 'pass', detail: 'Chromium 계열' } : { status: 'warn', detail: 'Chrome·Edge 를 권장합니다 (모니터 확인 기능).' })
      apply('graphics', rendererVerdict(webglRenderer()))
      set('screens', { status: 'running', detail: '확인 중 (권한 창이 뜨면 허용해 주세요)' })
      const sc = await screenInfo()
      apply('screens', screensVerdict(sc.count, sc.isExtended))
      apply('camera', cameraVerdict(stream.getVideoTracks()[0]?.label ?? ''))
      set('audio', { status: 'running', detail: '마이크로 2초간 확인 중 (조용히 해 주세요)' })
      const audio = await audioProbe()
      const av = audioVerdict(audio.labels)
      const noisy = audio.noiseDb !== null && audio.noiseDb > -35
      const noise = audio.noiseDb === null ? '' : ` · 소음 ${audio.noiseDb.toFixed(0)} dBFS${noisy ? ' (시끄러움)' : ''}`
      apply('audio', { status: av.status === 'pass' && noisy ? 'warn' : av.status, detail: av.detail + noise })
      if (cancelled) return

      // 2) 조명·자세: 좋은 상태가 1.5초 이어지면 통과
      set('lighting', { status: 'running' })
      set('placement', { status: 'running' })
      setPrompt('화면을 정면으로 보고 바르게 앉아 주세요')
      let goodSince: number | null = null
      let lastLight: Verdict = { status: 'fail', detail: '' }
      let lastPlace: Verdict = { status: 'fail', detail: '' }
      await waitFrames((f, now) => {
        const px = grabPixels(video)
        if (!px) return false
        lastLight = lightingVerdict(lumaStats(px.data, px.width, px.height), f.box ? lumaStats(px.data, px.width, px.height, f.box) : undefined)
        lastPlace = placementVerdict({ faceCount: f.faceCount, box: f.box, shouldersVisible: f.shouldersVisible })
        set('lighting', { detail: lastLight.detail })
        set('placement', { detail: lastPlace.detail })
        if (lastLight.status === 'fail' || lastPlace.status === 'fail') {
          goodSince = null
          return false
        }
        goodSince ??= now
        return now - goodSince >= HOLD_MS
      })
      apply('lighting', lastLight)
      apply('placement', lastPlace)
      if (cancelled) return

      // 3) 귀: 한쪽 → 반대쪽으로 고개를 돌린 순간을 찍는다
      set('ears', { status: 'running' })
      setPrompt('고개를 천천히 왼쪽(또는 오른쪽)으로 끝까지 돌려 귀를 보여 주세요')
      const first = await waitHeadTurn(0)
      if (first) snap('ear-left')
      setPrompt('이번에는 반대쪽으로 끝까지 돌려 주세요')
      const second = first ? await waitHeadTurn(first) : 0
      if (second) snap('ear-right')
      apply('ears', second ? { status: 'pass', detail: '양쪽 귀 사진 확보 (정밀 분석에서 이어폰 확인)' } : { status: 'warn', detail: '귀를 충분히 보여 주지 않았습니다.' })
      if (cancelled) return

      // 4) 손목: 두 손을 1초 보여 주기
      set('wrist', { status: 'running' })
      setPrompt('양 손목과 손바닥을 카메라 앞에 1초간 보여 주세요 (소매를 걷어 주세요)')
      let handsSince: number | null = null
      const wristOk = await waitFrames((f, now) => {
        if (f.handCount < 2) {
          handsSince = null
          return false
        }
        handsSince ??= now
        return now - handsSince > 1000
      }, POSE_TIMEOUT_MS)
      if (wristOk) snap('wrist')
      apply('wrist', wristOk ? { status: 'pass', detail: '손목 사진 확보 (정밀 분석에서 확인)' } : { status: 'warn', detail: '두 손이 함께 보이지 않았습니다.' })
      if (cancelled) return

      // 5) 휴대폰 스캔 결과 기다리기
      setPrompt('휴대폰 화면의 안내에 따라 방과 책상을 스캔해 주세요')
      set('phone', { status: 'running', detail: '휴대폰에서 점검을 진행해 주세요' })
      while (!cancelled && !live.current.phoneReport && !skipPhoneRef.current) {
        set('phone', { detail: live.current.phone === 'connected' ? '휴대폰에서 스캔 진행 중' : '휴대폰이 연결되지 않았습니다. 오른쪽 QR 로 연결해 주세요.' })
        await new Promise((r) => setTimeout(r, 300))
      }
      if (cancelled) return
      const pr = live.current.phoneReport
      if (pr) {
        const bad = pr.items.filter((i) => i.status === 'fail' || i.status === 'warn')
        set('phone', {
          status: pr.passed ? (bad.length ? 'warn' : 'pass') : 'fail',
          detail: bad.length ? bad.map((i) => `${i.label}: ${i.detail}`).join(' / ') : '이상 없음',
        })
      } else {
        apply('phone', { status: 'warn', detail: '휴대폰 점검을 건너뛰었습니다 (감독 기록에 남습니다).' })
      }

      // 6) 정밀 분석: 점검 사진 전부를 글로 찾는 모델(OWL-ViT)로 다시 본다. 자동 판정이 아니라 검토 표시
      setPrompt('')
      set('deep', { status: 'running', detail: '분석 모델 내려받는 중 (처음 한 번, 약 150MB)' })
      const flagged: EnvCheckResult['flagged'] = []
      try {
        const { deepScan, loadDeepDetector } = await import('../check/deepScan.ts')
        await loadDeepDetector((r) => set('deep', { detail: `분석 모델 내려받는 중 ${(r * 100).toFixed(0)}%` }))
        const frames = live.current.scanFrames
        const results: { frame: ScanFrame; found: DeepFinding[] }[] = []
        for (let i = 0; i < frames.length && !cancelled; i++) {
          set('deep', { detail: `사진 분석 중 ${i + 1}/${frames.length}` })
          results.push({ frame: frames[i], found: await deepScan(frames[i].image, frames[i].stage) })
          setFindings([...results])
        }
        for (const r of results) if (r.found.length) flagged.push({ stage: r.frame.stage, source: r.frame.source, labels: r.found.map((f) => f.label) })
        const labels = [...new Set(flagged.flatMap((f) => f.labels))]
        apply(
          'deep',
          frames.length === 0
            ? { status: 'warn', detail: '분석할 점검 사진이 없습니다.' }
            : flagged.length
              ? { status: 'warn', detail: `사진 ${flagged.length}/${frames.length}장 검토 필요: ${labels.join(', ')}` }
              : { status: 'pass', detail: `사진 ${frames.length}장 이상 없음` },
        )
      } catch (e) {
        apply('deep', { status: 'warn', detail: `정밀 분석 실패: ${e instanceof Error ? e.message : String(e)}` })
      }
      if (cancelled) return
      setResult({ pc: makeReport(current), phone: live.current.phoneReport, flagged })
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
    onPassed({ pc: makeReport(skipped), phone: null, flagged: [] })
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
        {findings.some((f) => f.found.length) && (
          <p className="text-[13px] text-text-muted">검토 필요로 표시된 사진은 자동 판정이 아니라 감독관 확인용입니다.</p>
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
            <Button
              variant="ghost"
              size="sm"
              className={passed ? undefined : 'ml-auto'}
              onClick={() => {
                setSkipPhone(false)
                setRun((n) => n + 1)
              }}
            >
              <RefreshCw size={16} aria-hidden /> 다시 점검
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
