// 휴대폰 보조 캠 페이지: /proctor/phone?p={짝 코드} (PC 화면의 QR 로 들어온다).
// 옆·뒤에서 손·팔 움직임과 다른 기기·켜진 화면을 감시한다. 경고는 릴레이로 보내고, 릴레이 서버가 저장한다.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type {
  HandLandmarker,
  HandLandmarkerResult,
  ObjectDetector,
  ObjectDetectorResult,
  PoseLandmarker,
  PoseLandmarkerResult,
} from '@mediapipe/tasks-vision'
import { Smartphone } from 'lucide-react'
import { Button, Logo, StatusDot } from '../../components/ui'
import { requestOrientationPermission } from '../check/probes.ts'
import { toCamViolation } from '../core/events.ts'
import {
  PHONE_RULES,
  buildPhoneBaseline,
  dedupeObjects,
  phoneConditions,
  type DetectedObject,
  type PhoneBaseline,
  type PhoneFeatures,
} from '../core/phoneRules.ts'
import { RuleEngine } from '../core/RuleEngine.ts'
import type { ClientMsg } from '../relay/protocol.ts'
import { RelaySocket } from '../relay/RelaySocket.ts'
import { FpsMeter, captureSnapshot, frameLoop, openCamera, stopCamera } from '../vision/camera.ts'
import { detectedObjects, phoneFeatures } from '../vision/features.ts'
import { createHandLandmarker, createObjectDetector, createPoseLandmarker, createScanDetector } from '../vision/models.ts'
import { PhoneScan } from './PhoneScan.tsx'

type Phase = 'connecting' | 'ready' | 'loading' | 'scan' | 'switching' | 'place' | 'calibrating' | 'monitoring' | 'error'
type Models = { hand: HandLandmarker; pose: PoseLandmarker; object: ObjectDetector; scan: ObjectDetector }

const CALIBRATION_MS = 3000
const OBJECT_INTERVAL_MS = 500
const STATUS_INTERVAL_MS = 1000
const LUMA_W = 64
const LUMA_H = 48

export default function PhoneCamPage() {
  const [params] = useSearchParams()
  const pairCode = params.get('p') ?? ''

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const socketRef = useRef<RelaySocket | null>(null)
  const modelsRef = useRef<Models | null>(null)
  const stopLoopRef = useRef<(() => void) | null>(null)
  const statusRef = useRef({ fps: 0, handCount: 0, objects: [] as string[], calibrated: false })
  const scanDoneRef = useRef(false)

  const [phaseState, setPhase] = useState<Phase>('connecting')
  const [errorState, setError] = useState('')
  /** 짝 코드 자체가 틀린 경우: 다시 시도 대신 QR 재스캔 안내 */
  const [fatalState, setFatal] = useState(false)
  // QR 없이 들어온 경우는 연결을 시도하지 않고 바로 안내한다
  const phase: Phase = pairCode ? phaseState : 'error'
  const error = pairCode ? errorState : 'PC 화면의 QR 코드로 접속해 주세요.'
  const fatal = pairCode ? fatalState : true
  const [lastWarning, setLastWarning] = useState('')
  /** 카메라를 바꾸지 못했을 때 등 화면에 띄울 안내 */
  const [notice, setNotice] = useState('')
  const [calibProgress, setCalibProgress] = useState(0)
  const [hud, setHud] = useState({ fps: 0, hands: 0, objects: '' })
  const [gyro, setGyro] = useState(false)
  const sendMsg = useCallback((m: ClientMsg) => socketRef.current?.send(m), [])

  const [scanCtx, setScanCtx] = useState<{ video: HTMLVideoElement; stream: MediaStream; detector: ObjectDetector } | null>(null)

  useEffect(() => {
    if (!pairCode) return
    const socket = new RelaySocket(
      () => ({ type: 'hello-phone', pairCode }),
      (msg) => {
        if (msg.type === 'phone-joined') setPhase((p) => (p === 'connecting' ? 'ready' : p))
        if (msg.type === 'error') {
          setFatal(true)
          setPhase('error')
          setError(msg.message)
        }
      },
    )
    socketRef.current = socket
    const statusTimer = window.setInterval(() => {
      socket.send({ type: 'phone-status', status: { ...statusRef.current, bytesSent: socket.bytesSent } })
    }, STATUS_INTERVAL_MS)

    // 다른 앱으로 전환하면 바로 알린다 (전송이 안 되면 서버가 응답 없음으로 잡는다)
    const onVisibility = () => {
      if (document.visibilityState !== 'hidden') return
      const now = performance.now()
      const v = toCamViolation(
        { kind: 'phone_hidden', message: '휴대폰에서 감독 화면을 벗어났습니다', startedAt: now, ts: now, durationMs: 0 },
        'PHONE_CAM',
        undefined,
      )
      if (v) socket.send({ type: 'violation', violation: v })
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(statusTimer)
      document.removeEventListener('visibilitychange', onVisibility)
      socket.close()
      stopLoopRef.current?.()
      stopCamera(streamRef.current)
    }
  }, [pairCode])

  async function start() {
    const video = videoRef.current
    if (!video) return
    setError('')
    try {
      // 아이폰 자이로 권한은 버튼 탭 안에서 가장 먼저 받아야 한다
      setGyro(await requestOrientationPermission())
      setPhase('loading')
      // 화면 꺼짐 방지
      await (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<unknown> } }).wakeLock?.request('screen').catch(() => undefined)
      // 작은 물체를 찾기 위해 고해상도로 연다 (분석 모델은 내부에서 줄여 쓴다)
      if (!streamRef.current) streamRef.current = await openCamera(video, 'environment', { width: 1280, height: 720 })
      if (!modelsRef.current) {
        const [hand, pose, object, scan] = await Promise.all([createHandLandmarker(), createPoseLandmarker(), createObjectDetector(), createScanDetector()])
        modelsRef.current = { hand, pose, object, scan }
      }
      setScanCtx({ video, stream: streamRef.current, detector: modelsRef.current.scan })
      setPhase(scanDoneRef.current ? 'place' : 'scan')
    } catch (e) {
      setPhase('error')
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  /**
   * 방·책상 스캔은 후면 카메라로 하고, 시험 중 감독은 전면 카메라로 한다.
   * 스캔이 끝나면 후면 카메라를 닫고 전면으로 바꾼다. 전면을 열지 못하면 후면으로 돌아가 계속한다.
   */
  async function switchToMonitoringCamera() {
    const video = videoRef.current
    if (!video) return
    setPhase('switching')
    setNotice('')
    stopCamera(streamRef.current)
    streamRef.current = null
    try {
      streamRef.current = await openCamera(video, 'user', { width: 1280, height: 720 })
    } catch {
      try {
        streamRef.current = await openCamera(video, 'environment', { width: 1280, height: 720 })
        setNotice('전면 카메라를 열 수 없어 후면 카메라로 계속합니다.')
      } catch (e) {
        setPhase('error')
        setError(e instanceof Error ? e.message : String(e))
        return
      }
    }
    setPhase('place')
  }

  /** 한 프레임 분석. 무거운 물체 감지는 0.5초마다만 돌리고 결과를 재사용한다 */
  function makeAnalyzer(video: HTMLVideoElement, m: Models) {
    const lumaCanvas = document.createElement('canvas')
    lumaCanvas.width = LUMA_W
    lumaCanvas.height = LUMA_H
    const lumaCtx = lumaCanvas.getContext('2d', { willReadFrequently: true })
    let frame = 0
    let lastObjAt = Number.NEGATIVE_INFINITY
    let objects: DetectedObject[] = []
    let objRes: ObjectDetectorResult | undefined
    let poseRes: PoseLandmarkerResult | undefined
    let handRes: HandLandmarkerResult | undefined
    return (now: number): PhoneFeatures => {
      handRes = m.hand.detectForVideo(video, now)
      if (frame++ % 2 === 0) poseRes = m.pose.detectForVideo(video, now)
      if (now - lastObjAt >= OBJECT_INTERVAL_MS && lumaCtx) {
        lastObjAt = now
        objRes = m.object.detectForVideo(video, now)
        lumaCtx.drawImage(video, 0, 0, LUMA_W, LUMA_H)
        const img = lumaCtx.getImageData(0, 0, LUMA_W, LUMA_H)
        // R 채널 자리에 밝기를 넣어 둔다 (켜진 화면 판별용)
        for (let i = 0; i < img.data.length; i += 4) img.data[i] = 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2]
        objects = detectedObjects(objRes, video.videoWidth, video.videoHeight, { data: img.data, w: LUMA_W, h: LUMA_H })
      }
      draw(video, handRes, objRes)
      return phoneFeatures(handRes, poseRes, objects)
    }
  }

  /** 배치 확인용: 손 점과 물체 박스를 화면에 그린다 */
  function draw(video: HTMLVideoElement, hands: HandLandmarkerResult | undefined, objs: ObjectDetectorResult | undefined) {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    if (canvas.width !== video.videoWidth) {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#4ade80'
    for (const lm of hands?.landmarks ?? []) for (const p of lm) ctx.fillRect(p.x * canvas.width - 2, p.y * canvas.height - 2, 4, 4)
    ctx.lineWidth = 3
    ctx.font = '16px sans-serif'
    for (const d of objs?.detections ?? []) {
      const bb = d.boundingBox
      const cat = d.categories[0]
      if (!bb || !cat) continue
      ctx.strokeStyle = cat.categoryName === 'cell phone' || cat.categoryName === 'book' ? '#f87171' : '#60a5fa'
      ctx.strokeRect(bb.originX, bb.originY, bb.width, bb.height)
      ctx.fillStyle = ctx.strokeStyle
      ctx.fillText(`${cat.categoryName} ${(cat.score * 100).toFixed(0)}%`, bb.originX + 4, bb.originY + 18)
    }
  }

  function runCalibration() {
    const video = videoRef.current
    const m = modelsRef.current
    if (!video || !m) return
    stopLoopRef.current?.()
    setPhase('calibrating')
    statusRef.current.calibrated = false
    const analyze = makeAnalyzer(video, m)
    const samples: PhoneFeatures[] = []
    const begin = performance.now()
    stopLoopRef.current = frameLoop(video, (now) => {
      samples.push(analyze(now))
      setCalibProgress(Math.min(1, (now - begin) / CALIBRATION_MS))
      if (now - begin < CALIBRATION_MS) return
      stopLoopRef.current?.()
      const baseline = buildPhoneBaseline(samples)
      if (baseline.handCount === 0) {
        setPhase('error')
        setError('손이 보이지 않습니다. 두 손이 키보드 위에 보이도록 휴대폰 위치를 조정한 뒤 다시 시도해 주세요.')
        return
      }
      runMonitoring(video, baseline, analyze)
    })
  }

  function runMonitoring(video: HTMLVideoElement, baseline: PhoneBaseline, analyze: (now: number) => PhoneFeatures) {
    setPhase('monitoring')
    statusRef.current.calibrated = true
    const engine = new RuleEngine(PHONE_RULES)
    const fps = new FpsMeter()
    let lastUi = 0
    stopLoopRef.current = frameLoop(video, (now) => {
      fps.tick(now)
      const f = analyze(now)
      const seen = dedupeObjects(f.objects)
      for (const fired of engine.evaluate(phoneConditions(f, baseline), now)) {
        const v = toCamViolation(fired, 'PHONE_CAM', captureSnapshot(video), {
          hands: f.hands.length,
          objects: seen.map((o) => `${o.label}${o.bright ? '(켜짐)' : ''}`).join(','),
        })
        if (!v) continue
        if (fired.kind === 'extra_screen' && seen.some((o) => o.bright)) v.message += ' (켜진 화면)'
        socketRef.current?.send({ type: 'violation', violation: v })
        setLastWarning(v.message)
      }
      const labels = seen.map((o) => o.label)
      statusRef.current = { fps: fps.fps, handCount: f.hands.length, objects: labels, calibrated: true }
      if (now - lastUi > 300) {
        lastUi = now
        setHud({ fps: fps.fps, hands: f.hands.length, objects: labels.join(', ') })
      }
    })
  }

  return (
    <div className="mobile-layout mx-auto flex min-h-full w-full max-w-[560px] flex-col bg-bg">
      <header className="flex h-12 items-center gap-2 border-b border-line bg-panel px-4">
        <Logo />
        <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-text-muted">
          <Smartphone size={15} aria-hidden /> 보조 카메라
        </span>
      </header>
      <div className="relative aspect-[4/3] w-full bg-black">
        <video ref={videoRef} className="size-full object-contain" aria-label="휴대폰 카메라 화면" />
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 size-full object-contain" aria-hidden />
        {phase === 'calibrating' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/45 px-6 text-center text-[15px] font-semibold text-white">
            두 손을 키보드 위에 올리고 그대로 기다려 주세요
            <span className="h-2 w-full overflow-hidden rounded-full bg-white/30">
              <span className="block h-full origin-left bg-white" style={{ transform: `scaleX(${calibProgress})` }} />
            </span>
          </div>
        )}
      </div>

      <main className="flex flex-col gap-3 p-4">
        {phase === 'connecting' && <p className="text-[15px]">PC 와 연결하는 중입니다</p>}
        {phase === 'loading' && <p className="text-[15px]">카메라와 분석 모델을 준비하는 중입니다</p>}
        {phase === 'switching' && <p className="text-[15px]">스캔을 마쳤습니다. 시험 중 감독에 쓸 전면 카메라로 바꾸는 중입니다</p>}
        {phase === 'error' && (
          <p role="alert" className="rounded-lg border border-alert/40 bg-alert/10 px-3 py-2 text-[14px] text-alert">
            {error}
          </p>
        )}
        {(phase === 'ready' || (phase === 'error' && !fatal)) && (
          <>
            <p className="text-[14px] leading-6 break-keep text-text-muted">
              먼저 휴대폰을 들고 방과 책상을 스캔한 뒤, 옆이나 뒤에 세워 감독을 시작합니다. 영상은 전송되지 않고 이 휴대폰 안에서만 분석됩니다.
            </p>
            <Button variant="primary" size="lg" onClick={() => void start()}>
              {phase === 'error' ? '다시 시도' : '보조 캠 시작'}
            </Button>
          </>
        )}
        {phase === 'scan' && scanCtx && (
          <PhoneScan
            video={scanCtx.video}
            stream={scanCtx.stream}
            detector={scanCtx.detector}
            gyro={gyro}
            send={sendMsg}
            onDone={() => {
              scanDoneRef.current = true
              void switchToMonitoringCamera()
            }}
          />
        )}
        {phase === 'place' && (
          <>
            {notice && <p className="text-[13px] leading-5 break-keep text-caution">{notice}</p>}
            <p className="text-[15px] leading-6 break-keep">
              시험 중에는 <b>전면 카메라</b>를 씁니다. 휴대폰을 옆이나 뒤에 세워, 화면이 있는 쪽 카메라에 <b>두 손, 키보드, 시험 화면</b>이 함께 보이게 놓아 주세요.
            </p>
            <Button variant="primary" size="lg" onClick={runCalibration}>
              배치 완료
            </Button>
          </>
        )}
        {phase === 'monitoring' && (
          <>
            <StatusDot status="ok" label={`감시 중 · ${hud.fps} FPS · 손 ${hud.hands}개`} />
            {hud.objects && <p className="text-[13px] text-text-muted">보이는 물체: {hud.objects}</p>}
            {lastWarning && <p className="text-[13px] text-alert">최근 경고: {lastWarning}</p>}
            <Button variant="ghost" onClick={runCalibration}>
              기준 위치 다시 잡기
            </Button>
            <p className="text-[13px] text-text-muted">시험이 끝날 때까지 이 화면을 켜 두세요.</p>
          </>
        )}
      </main>
    </div>
  )
}
