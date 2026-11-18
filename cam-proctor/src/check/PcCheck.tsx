// PC 환경 점검: 장치·모니터·조명·자세·귀·손목을 확인하고, 휴대폰 스캔 결과까지 모아 정밀 분석한다.
import { useEffect, useRef, useState } from 'react'
import type { FaceLandmarker, HandLandmarker, PoseLandmarker, PoseLandmarkerResult } from '@mediapipe/tasks-vision'
import { captureSnapshot, frameLoop } from '../lib/camera'
import { headPoseFromMatrix, shouldersFromPose } from '../vision/features'
import type { Box } from '../rules/phoneRules'
import type { ClientMsg, ScanStage } from '../shared/protocol'
import { CheckList, updateItem } from './CheckList'
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
} from './envChecks'
import { audioProbe, grabPixels, isAutomated, isChromium, screenInfo, webglRenderer } from './probes'
import { deepScan, loadDeepDetector, type DeepFinding } from './deepScan'

export interface ScanFrame {
  source: 'pc' | 'phone'
  stage: ScanStage
  url: string
  objects: string[]
  /** PC가 받은 시각 (다시 점검할 때 예전 PC 사진을 빼기 위해) */
  at: number
}

interface Props {
  video: HTMLVideoElement
  stream: MediaStream
  models: { face: FaceLandmarker; pose: PoseLandmarker; hand: HandLandmarker }
  send: (msg: ClientMsg) => void
  phoneConnected: boolean
  phoneReport: CheckReport | null
  scanFrames: ScanFrame[]
  onDone: (report: CheckReport) => void
}

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

interface FrameInfo {
  faceCount: number
  box?: Box
  yaw?: number
  shouldersVisible: boolean
  handCount: number
}

export function PcCheck(props: Props) {
  const { video, stream, models, send } = props
  const [items, setItems] = useState(INITIAL)
  const [prompt, setPrompt] = useState('')
  const [findings, setFindings] = useState<{ frame: ScanFrame; found: DeepFinding[] }[]>([])
  const [done, setDone] = useState<CheckReport | null>(null)
  const [run, setRun] = useState(0)
  const [skipPhone, setSkipPhone] = useState(false)

  // 비동기 진행 중에 최신 props를 읽기 위한 ref
  const live = useRef(props)
  live.current = props
  const skipPhoneRef = useRef(skipPhone)
  skipPhoneRef.current = skipPhone

  useEffect(() => {
    let cancelled = false
    let stopLoop: (() => void) | null = null
    let current = INITIAL.map((i) => ({ ...i }))
    const set = (id: string, patch: Partial<CheckItem>) => {
      current = updateItem(current, id, patch)
      if (!cancelled) setItems(current)
    }
    const apply = (id: string, v: Verdict) => set(id, { status: v.status, detail: v.detail })
    setItems(current)
    setFindings([])
    setDone(null)

    /** 매 프레임 분석하면서 check가 true를 돌려줄 때까지 기다린다 */
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
          const info: FrameInfo = {
            faceCount: face.faceLandmarks.length,
            box,
            yaw: m ? headPoseFromMatrix(m.data).yaw : undefined,
            shouldersVisible: !!shouldersFromPose(lastPose),
            handCount: hands.landmarks.length,
          }
          const ok = check(info, now)
          if (ok || now - begin > timeoutMs) {
            stopLoop?.()
            resolve(ok)
          }
        })
      })

    const snap = (stage: ScanStage) => {
      const image = captureSnapshot(video, 640, 0.8)
      if (image) send({ type: 'scan-frame', stage, image, objects: [] })
    }

    const runStart = Date.now()

    async function main() {
      // 1) 브라우저·장치 정보 (즉시 확인)
      if (isAutomated()) apply('browser', { status: 'fail', detail: '자동화 도구로 제어되는 브라우저입니다.' })
      else apply('browser', isChromium() ? { status: 'pass', detail: 'Chromium 계열' } : { status: 'warn', detail: 'Chrome·Edge를 권장합니다 (모니터 확인 기능).' })
      apply('graphics', rendererVerdict(webglRenderer()))
      set('screens', { status: 'running', detail: '확인 중… (권한 창이 뜨면 허용해 주세요)' })
      const sc = await screenInfo()
      apply('screens', screensVerdict(sc.count, sc.isExtended))
      apply('camera', cameraVerdict(stream.getVideoTracks()[0]?.label ?? ''))
      set('audio', { status: 'running', detail: '마이크로 2초간 확인 중… (조용히 해 주세요)' })
      const audio = await audioProbe()
      const av = audioVerdict(audio.labels)
      const noise = audio.noiseDb === null ? '' : ` · 소음 ${audio.noiseDb.toFixed(0)} dBFS${audio.noiseDb > -35 ? ' (시끄러움)' : ''}`
      apply('audio', { status: av.status === 'pass' && audio.noiseDb !== null && audio.noiseDb > -35 ? 'warn' : av.status, detail: av.detail + noise })
      if (cancelled) return

      // 2) 조명·자세: 좋은 상태가 1.5초 이어지면 통과
      set('lighting', { status: 'running', detail: '' })
      set('placement', { status: 'running', detail: '' })
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
      set('ears', { status: 'running', detail: '' })
      setPrompt('고개를 천천히 왼쪽(또는 오른쪽)으로 끝까지 돌려 귀를 보여 주세요')
      let firstSign = 0
      let heldSince: number | null = null
      const firstOk = await waitFrames((f, now) => {
        if (f.yaw === undefined || Math.abs(f.yaw) < 45) {
          heldSince = null
          return false
        }
        heldSince ??= now
        firstSign = Math.sign(f.yaw)
        return now - heldSince > 400
      }, POSE_TIMEOUT_MS)
      if (firstOk) snap('ear-left')
      setPrompt('이번엔 반대쪽으로 끝까지 돌려 주세요')
      heldSince = null
      const secondOk =
        firstOk &&
        (await waitFrames((f, now) => {
          if (f.yaw === undefined || Math.abs(f.yaw) < 45 || Math.sign(f.yaw) === firstSign) {
            heldSince = null
            return false
          }
          heldSince ??= now
          return now - heldSince > 400
        }, POSE_TIMEOUT_MS))
      if (secondOk) snap('ear-right')
      apply('ears', secondOk ? { status: 'pass', detail: '양쪽 귀 사진 확보 (정밀 분석에서 이어폰 확인)' } : { status: 'warn', detail: '귀를 충분히 보여 주지 않았습니다.' })
      if (cancelled) return

      // 4) 손목: 두 손을 카메라에 1초 보여 주기
      set('wrist', { status: 'running', detail: '' })
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
        set('phone', { detail: live.current.phoneConnected ? '휴대폰에서 스캔 진행 중…' : '휴대폰이 연결되지 않았습니다. 오른쪽 QR로 연결해 주세요.' })
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
        apply('phone', { status: 'warn', detail: '휴대폰 점검을 건너뛰었습니다.' })
      }

      // 6) 정밀 분석: 점검 사진 전부를 open-vocabulary 모델로 다시 본다
      setPrompt('')
      set('deep', { status: 'running', detail: '분석 모델 내려받는 중… (처음 한 번, 약 150MB)' })
      try {
        await loadDeepDetector((r) => set('deep', { detail: `분석 모델 내려받는 중… ${(r * 100).toFixed(0)}%` }))
        await new Promise((r) => setTimeout(r, 500)) // 마지막 사진이 서버를 거쳐 도착할 시간
        const frames = live.current.scanFrames.filter((f) => f.source === 'phone' || f.at >= runStart)
        const results: { frame: ScanFrame; found: DeepFinding[] }[] = []
        for (let i = 0; i < frames.length && !cancelled; i++) {
          set('deep', { detail: `사진 분석 중 ${i + 1}/${frames.length}` })
          results.push({ frame: frames[i], found: await deepScan(frames[i].url, frames[i].stage) })
          setFindings([...results])
        }
        const flagged = results.filter((r) => r.found.length)
        const labels = [...new Set(flagged.flatMap((r) => r.found.map((f) => f.label)))]
        apply(
          'deep',
          frames.length === 0
            ? { status: 'warn', detail: '분석할 점검 사진이 없습니다.' }
            : flagged.length
              ? { status: 'warn', detail: `사진 ${flagged.length}/${frames.length}장에서 검토 필요: ${labels.join(', ')}` }
              : { status: 'pass', detail: `사진 ${frames.length}장 이상 없음` },
        )
      } catch (e) {
        apply('deep', { status: 'warn', detail: `정밀 분석 실패: ${e instanceof Error ? e.message : e}` })
      }
      if (cancelled) return

      const report = makeReport(current)
      send({ type: 'check-report', report })
      setDone(report)
    }

    main()
    return () => {
      cancelled = true
      stopLoop?.()
    }
    // run이 바뀌면 처음부터 다시 점검
  }, [run])

  return (
    <div className="check-panel">
      <h3>시험 환경 점검</h3>
      {prompt && <p className="check-prompt">{prompt}</p>}
      <CheckList items={items} />

      {items.find((i) => i.id === 'phone')?.status === 'running' && !skipPhone && (
        <button className="ghost" onClick={() => setSkipPhone(true)}>휴대폰 없이 진행</button>
      )}

      {findings.some((f) => f.found.length) && (
        <div className="findings">
          <h4>검토 필요 사진</h4>
          <p className="muted small">자동 판정이 아니라 감독관 확인용 표시입니다.</p>
          <div className="finding-grid">
            {findings.filter((f) => f.found.length).map((f) => (
              <figure key={f.frame.url}>
                <div className="finding-img">
                  <img src={f.frame.url} alt="" />
                  {f.found.map((d) => (
                    <span
                      key={d.label}
                      className="finding-box"
                      style={{ left: `${d.box.xmin * 100}%`, top: `${d.box.ymin * 100}%`, width: `${(d.box.xmax - d.box.xmin) * 100}%`, height: `${(d.box.ymax - d.box.ymin) * 100}%` }}
                    />
                  ))}
                </div>
                <figcaption className="small">
                  {f.frame.source === 'pc' ? '노트북' : '휴대폰'} · {f.found.map((d) => `${d.label} ${(d.score * 100).toFixed(0)}%`).join(', ')}
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}

      {done && (
        <div className="check-actions">
          {done.passed ? (
            <>
              <p>점검을 통과했습니다{done.items.some((i) => i.status === 'warn') ? ' (주의 항목은 감독 기록에 남습니다)' : ''}.</p>
              <button onClick={() => props.onDone(done)}>시험 감독 시작</button>
            </>
          ) : (
            <p className="error">통과하지 못한 항목이 있습니다. 조치한 뒤 다시 점검해 주세요.</p>
          )}
          <button className="ghost" onClick={() => { setSkipPhone(false); setRun((n) => n + 1) }}>다시 점검</button>
        </div>
      )}
    </div>
  )
}
