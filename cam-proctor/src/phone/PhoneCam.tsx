// 휴대폰 보조 캠: 옆·뒤에서 손·팔 움직임과 다른 기기·켜진 화면을 감시한다.
import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  HandLandmarker,
  HandLandmarkerResult,
  ObjectDetector,
  ObjectDetectorResult,
  PoseLandmarker,
  PoseLandmarkerResult,
} from '@mediapipe/tasks-vision'
import { RuleEngine } from '../rules/RuleEngine'
import {
  PHONE_RULES,
  buildPhoneBaseline,
  dedupeObjects,
  phoneConditions,
  type DetectedObject,
  type PhoneBaseline,
  type PhoneFeatures,
} from '../rules/phoneRules'
import { createHandLandmarker, createObjectDetector, createPoseLandmarker, createScanDetector } from '../vision/models'
import { detectedObjects, phoneFeatures } from '../vision/features'
import { FpsMeter, frameLoop, openCamera, stopCamera } from '../lib/camera'
import { ProctorSocket } from '../lib/socket'
import { toViolation } from '../lib/violation'
import { PhoneScan } from '../check/PhoneScan'
import { requestOrientationPermission } from '../check/probes'
import type { ClientMsg } from '../shared/protocol'

type Phase = 'connecting' | 'ready' | 'loading' | 'scan' | 'place' | 'calibrating' | 'monitoring' | 'error'
const CALIBRATION_MS = 3000
const OBJECT_INTERVAL_MS = 500

interface Models {
  hand: HandLandmarker
  pose: PoseLandmarker
  object: ObjectDetector
  /** 환경 점검용 (정지 이미지·타일 감지) */
  scan: ObjectDetector
}

export function PhoneCam() {
  const params = new URLSearchParams(location.search)
  const sessionId = params.get('s') ?? ''
  const token = params.get('t') ?? ''

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const socketRef = useRef<ProctorSocket | null>(null)
  const modelsRef = useRef<Models | null>(null)
  const stopLoopRef = useRef<(() => void) | null>(null)
  const statusRef = useRef({ fps: 0, handCount: 0, objects: [] as string[], calibrated: false })

  const [phase, setPhase] = useState<Phase>('connecting')
  const [error, setError] = useState('')
  /** 세션 자체가 잘못된 경우: 다시 시도 버튼 대신 QR 재스캔 안내 */
  const [sessionError, setSessionError] = useState(false)
  const [lastWarning, setLastWarning] = useState('')
  const [calibProgress, setCalibProgress] = useState(0)
  const [hud, setHud] = useState({ fps: 0, hands: 0, objects: '' })
  const [gyro, setGyro] = useState(false)
  const scanDoneRef = useRef(false)
  const sendMsg = useCallback((m: ClientMsg) => socketRef.current?.send(m), [])

  useEffect(() => {
    if (!sessionId || !token) {
      setSessionError(true)
      setPhase('error')
      setError('PC 화면의 QR 코드로 접속해 주세요.')
      return
    }
    const socket = new ProctorSocket(
      () => ({ type: 'hello-phone', sessionId, token }),
      (msg) => {
        if (msg.type === 'phone-joined') setPhase((p) => (p === 'connecting' ? 'ready' : p))
        if (msg.type === 'error') {
          // 세션이 틀린 경우 재접속해도 소용없으므로 멈춘다
          socketRef.current?.close()
          setSessionError(true)
          setPhase('error')
          setError(msg.message)
        }
      },
    )
    socketRef.current = socket
    const statusTimer = setInterval(() => {
      socket.send({ type: 'phone-status', status: { ...statusRef.current, bytesSent: socket.bytesSent } })
    }, 1000)

    // 다른 앱으로 전환하면 바로 알린다 (전송이 안 되면 서버가 응답 없음으로 잡는다)
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        const now = performance.now()
        socket.send({
          type: 'violation',
          violation: toViolation(
            { kind: 'phone_hidden', message: '휴대폰에서 감독 화면을 벗어났습니다', startedAt: now, ts: now, durationMs: 0 },
            'phone',
            null,
          ),
        })
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(statusTimer)
      document.removeEventListener('visibilitychange', onVisibility)
      socket.close()
      stopLoopRef.current?.()
      stopCamera(streamRef.current)
    }
  }, [sessionId, token])

  async function start() {
    const video = videoRef.current!
    setError('')
    try {
      // 아이폰 자이로 권한은 버튼 탭 안에서 가장 먼저 받아야 한다
      setGyro(await requestOrientationPermission())
      setPhase('loading')
      // 화면 꺼짐 방지
      await (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<unknown> } }).wakeLock
        ?.request('screen')
        .catch(() => undefined)
      // 작은 물체를 찾기 위해 고해상도로 연다 (분석 모델은 내부에서 줄여 쓴다)
      if (!streamRef.current) streamRef.current = await openCamera(video, 'environment', { width: 1280, height: 720 })
      if (!modelsRef.current) {
        const [hand, pose, object, scan] = await Promise.all([
          createHandLandmarker(),
          createPoseLandmarker(),
          createObjectDetector(),
          createScanDetector(),
        ])
        modelsRef.current = { hand, pose, object, scan }
      }
      // 스캔을 이미 마쳤다면(배치·보정 단계 오류) 배치부터 다시
      setPhase(scanDoneRef.current ? 'place' : 'scan')
    } catch (e) {
      setPhase('error')
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  /** 한 프레임 분석. 무거운 물체 감지는 0.5초마다만 돌리고 결과를 재사용한다. */
  function makeAnalyzer() {
    const video = videoRef.current!
    const { hand, pose, object } = modelsRef.current!
    const lumaCanvas = document.createElement('canvas')
    lumaCanvas.width = 64
    lumaCanvas.height = 48
    const lumaCtx = lumaCanvas.getContext('2d', { willReadFrequently: true })!
    let frame = 0
    let lastObjAt = Number.NEGATIVE_INFINITY
    let objects: DetectedObject[] = []
    let objRes: ObjectDetectorResult | undefined
    let poseRes: PoseLandmarkerResult | undefined
    let handRes: HandLandmarkerResult | undefined

    return (now: number): PhoneFeatures => {
      handRes = hand.detectForVideo(video, now)
      if (frame++ % 2 === 0) poseRes = pose.detectForVideo(video, now)
      if (now - lastObjAt >= OBJECT_INTERVAL_MS) {
        lastObjAt = now
        objRes = object.detectForVideo(video, now)
        lumaCtx.drawImage(video, 0, 0, 64, 48)
        const img = lumaCtx.getImageData(0, 0, 64, 48)
        // R 채널 자리에 밝기를 넣어 둔다
        for (let i = 0; i < img.data.length; i += 4) {
          img.data[i] = 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2]
        }
        objects = detectedObjects(objRes, video.videoWidth, video.videoHeight, { data: img.data, w: 64, h: 48 })
      }
      draw(handRes, objRes)
      return phoneFeatures(handRes, poseRes, objects)
    }
  }

  /** 배치 확인용: 손 점과 물체 박스를 화면에 그린다 */
  function draw(hands: HandLandmarkerResult | undefined, objs: ObjectDetectorResult | undefined) {
    const video = videoRef.current!
    const canvas = canvasRef.current!
    if (canvas.width !== video.videoWidth) {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
    }
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#4ade80'
    for (const lm of hands?.landmarks ?? []) {
      for (const p of lm) ctx.fillRect(p.x * canvas.width - 2, p.y * canvas.height - 2, 4, 4)
    }
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
    stopLoopRef.current?.()
    setPhase('calibrating')
    statusRef.current.calibrated = false
    const video = videoRef.current!
    const analyze = makeAnalyzer()
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
      runMonitoring(baseline, analyze)
    })
  }

  function runMonitoring(baseline: PhoneBaseline, analyze: (now: number) => PhoneFeatures) {
    setPhase('monitoring')
    statusRef.current.calibrated = true
    const video = videoRef.current!
    const engine = new RuleEngine(PHONE_RULES)
    const fps = new FpsMeter()
    let lastUi = 0
    stopLoopRef.current = frameLoop(video, (now) => {
      fps.tick(now)
      const f = analyze(now)
      const seen = dedupeObjects(f.objects)
      for (const fired of engine.evaluate(phoneConditions(f, baseline), now)) {
        const v = toViolation(fired, 'phone', video, {
          hands: f.hands.length,
          objects: seen.map((o) => `${o.label}${o.bright ? '(켜짐)' : ''}`).join(','),
        })
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
    <div className="phone-layout">
      <div className="video-wrap phone-video">
        <video ref={videoRef} />
        <canvas ref={canvasRef} className="overlay-canvas" />
        {phase === 'calibrating' && (
          <div className="overlay">
            <p>두 손을 키보드 위에 올리고 그대로 기다려 주세요</p>
            <div className="progress"><div style={{ width: `${calibProgress * 100}%` }} /></div>
          </div>
        )}
      </div>

      <div className="phone-panel">
        {phase === 'connecting' && <p>PC와 연결하는 중…</p>}
        {phase === 'loading' && <p>카메라와 분석 모델을 준비하는 중…</p>}
        {phase === 'error' && <p className="error">{error}</p>}
        {(phase === 'ready' || (phase === 'error' && !sessionError)) && (
          <>
            <p className="small">
              먼저 휴대폰을 들고 방과 책상을 스캔한 뒤, 옆이나 뒤에 세워 감독을 시작합니다. 영상은 전송되지 않습니다.
            </p>
            <button onClick={start}>{phase === 'error' ? '다시 시도' : '보조 캠 시작'}</button>
          </>
        )}
        {phase === 'scan' && videoRef.current && streamRef.current && modelsRef.current && (
          <PhoneScan
            video={videoRef.current}
            stream={streamRef.current}
            detector={modelsRef.current.scan}
            gyro={gyro}
            send={sendMsg}
            onDone={() => {
              scanDoneRef.current = true
              setPhase('place')
            }}
          />
        )}
        {phase === 'place' && (
          <>
            <p>
              휴대폰을 옆이나 뒤에 세워 <b>두 손, 키보드, 시험 화면</b>이 함께 보이게 놓아 주세요.
            </p>
            <button onClick={runCalibration}>배치 완료</button>
          </>
        )}
        {phase === 'monitoring' && (
          <>
            <p><span className="dot ok" /> 감시 중 · {hud.fps} FPS · 손 {hud.hands}개</p>
            {hud.objects && <p className="muted small">보이는 물체: {hud.objects}</p>}
            {lastWarning && <p className="error small">최근 경고: {lastWarning}</p>}
            <button className="ghost" onClick={runCalibration}>기준 위치 다시 잡기</button>
            <p className="muted small">시험이 끝날 때까지 이 화면을 켜 두세요.</p>
          </>
        )}
      </div>
    </div>
  )
}
