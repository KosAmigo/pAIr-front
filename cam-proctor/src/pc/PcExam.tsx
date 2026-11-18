// PC 시험 화면: 노트북 정면 캠으로 고개·시선·몸통을 감시하고, 폰 캠 경고도 함께 받는다.
import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import type { FaceLandmarker, PoseLandmarker, PoseLandmarkerResult } from '@mediapipe/tasks-vision'
import { RuleEngine } from '../rules/RuleEngine'
import { PC_RULES, PC_THRESHOLDS, buildPcBaseline, pcConditions, type PcBaseline, type PcFeatures } from '../rules/pcRules'
import { angleDiff } from '../rules/stats'
import { createFaceLandmarker, createPoseLandmarker } from '../vision/models'
import { pcFeatures } from '../vision/features'
import { FpsMeter, frameLoop, openCamera, stopCamera } from '../lib/camera'
import { ProctorSocket } from '../lib/socket'
import { VIDEO_BYTES_PER_SEC, formatBytes, toViolation } from '../lib/violation'
import type { PeerState, PhoneStatus, Violation } from '../shared/protocol'
import { ViolationLog } from './ViolationLog'

type Phase = 'idle' | 'loading' | 'calibrating' | 'monitoring' | 'error'
const CALIBRATION_MS = 3000
const SESSION_KEY = 'cam-proctor-session'

interface Live {
  features: PcFeatures
  active: ReturnType<RuleEngine['active']>
  fps: number
}

export function PcExam() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const socketRef = useRef<ProctorSocket | null>(null)
  const stopLoopRef = useRef<(() => void) | null>(null)
  const modelsRef = useRef<{ face: FaceLandmarker; pose: PoseLandmarker } | null>(null)
  const baselineRef = useRef<PcBaseline | null>(null)
  const startedAtRef = useRef<number>(0)

  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState('')
  const [connected, setConnected] = useState(false)
  const [phoneUrls, setPhoneUrls] = useState<string[]>([])
  const [qr, setQr] = useState('')
  const [phone, setPhone] = useState<PeerState>('disconnected')
  const [phoneStatus, setPhoneStatus] = useState<PhoneStatus | null>(null)
  const [violations, setViolations] = useState<Violation[]>([])
  const [toast, setToast] = useState<Violation | null>(null)
  const [live, setLive] = useState<Live | null>(null)
  const [calibProgress, setCalibProgress] = useState(0)
  const [, forceTick] = useState(0)

  const seenIdsRef = useRef(new Set<string>())
  const addViolation = (v: Violation) => {
    if (seenIdsRef.current.has(v.id)) {
      // 서버가 돌려준 같은 이벤트: 저장된 사진 경로로 교체
      if (v.snapshot) setViolations((prev) => prev.map((p) => (p.id === v.id ? { ...p, snapshot: v.snapshot } : p)))
      return
    }
    seenIdsRef.current.add(v.id)
    setToast(v)
    setViolations((prev) => [v, ...prev])
  }

  // 서버 연결 & 세션
  useEffect(() => {
    const socket = new ProctorSocket(
      () => ({ type: 'hello-pc', sessionId: sessionStorage.getItem(SESSION_KEY) ?? undefined }),
      (msg) => {
        if (msg.type === 'session') {
          sessionStorage.setItem(SESSION_KEY, msg.sessionId)
          setPhoneUrls(msg.phoneUrls)
          if (msg.phoneUrls[0]) QRCode.toDataURL(msg.phoneUrls[0], { width: 220, margin: 1 }).then(setQr)
        } else if (msg.type === 'peer') {
          setPhone(msg.phone)
          if (msg.phone !== 'connected') setPhoneStatus(null)
        } else if (msg.type === 'phone-status') {
          setPhoneStatus(msg.status)
        } else if (msg.type === 'violation') {
          addViolation(msg.violation)
        }
      },
      setConnected,
    )
    socketRef.current = socket
    const t = setInterval(() => forceTick((n) => n + 1), 1000)
    return () => {
      clearInterval(t)
      socket.close()
      stopLoopRef.current?.()
      stopCamera(streamRef.current)
    }
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  async function start() {
    const video = videoRef.current!
    setError('')
    try {
      setPhase('loading')
      if (!streamRef.current) streamRef.current = await openCamera(video, 'user')
      if (!modelsRef.current) {
        const [face, pose] = await Promise.all([createFaceLandmarker(), createPoseLandmarker()])
        modelsRef.current = { face, pose }
      }
      runCalibration()
    } catch (e) {
      setPhase('error')
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function analyze(now: number, frame: number, lastPose: { current?: PoseLandmarkerResult }) {
    const video = videoRef.current!
    const { face, pose } = modelsRef.current!
    const faceRes = face.detectForVideo(video, now)
    // 포즈는 2프레임에 한 번 (몸통은 천천히 움직이므로 충분)
    if (frame % 2 === 0) lastPose.current = pose.detectForVideo(video, now)
    return pcFeatures(faceRes, lastPose.current)
  }

  function runCalibration() {
    stopLoopRef.current?.()
    setPhase('calibrating')
    const video = videoRef.current!
    const samples: PcFeatures[] = []
    const lastPose: { current?: PoseLandmarkerResult } = {}
    let frame = 0
    const begin = performance.now()
    stopLoopRef.current = frameLoop(video, (now) => {
      samples.push(analyze(now, frame++, lastPose))
      setCalibProgress(Math.min(1, (now - begin) / CALIBRATION_MS))
      if (now - begin < CALIBRATION_MS) return
      stopLoopRef.current?.()
      const baseline = buildPcBaseline(samples)
      if (!baseline) {
        setPhase('error')
        setError('정면 얼굴이 충분히 잡히지 않았습니다. 화면을 정면으로 보고 혼자 앉은 상태에서 다시 시도해 주세요.')
        return
      }
      baselineRef.current = baseline
      runMonitoring()
    })
  }

  function runMonitoring() {
    setPhase('monitoring')
    startedAtRef.current = Date.now()
    const video = videoRef.current!
    const engine = new RuleEngine(PC_RULES)
    const fps = new FpsMeter()
    const lastPose: { current?: PoseLandmarkerResult } = {}
    let frame = 0
    let lastUi = 0
    stopLoopRef.current = frameLoop(video, (now) => {
      fps.tick(now)
      const f = analyze(now, frame++, lastPose)
      const b = baselineRef.current!
      for (const fired of engine.evaluate(pcConditions(f, b), now)) {
        const v = toViolation(fired, 'pc', video, detailFor(f, b))
        addViolation(v)
        socketRef.current?.send({ type: 'violation', violation: v })
      }
      if (now - lastUi > 200) {
        lastUi = now
        setLive({ features: f, active: engine.active(now), fps: fps.fps })
      }
    })
  }

  const elapsedSec = phase === 'monitoring' ? (Date.now() - startedAtRef.current) / 1000 : 0
  const sent = (socketRef.current?.bytesSent ?? 0) + (phoneStatus?.bytesSent ?? 0)
  const cams = phone === 'connected' ? 2 : 1
  const videoEquiv = elapsedSec * VIDEO_BYTES_PER_SEC * cams
  const b = baselineRef.current

  return (
    <div className="pc-layout">
      <header className="topbar">
        <strong>Cam Proctor</strong>
        <span className={`dot ${connected ? 'ok' : 'bad'}`} /> 서버 {connected ? '연결됨' : '연결 중…'}
        <span className={`dot ${phone === 'connected' ? 'ok' : phone === 'stale' ? 'warn' : 'bad'}`} />
        휴대폰 캠 {phone === 'connected' ? '연결됨' : phone === 'stale' ? '응답 없음' : '미연결'}
        <span className="spacer" />
        경고 <b>{violations.length}</b>건
      </header>

      <main className="pc-main">
        <section className="panel cam-panel">
          <div className="video-wrap">
            <video ref={videoRef} className="mirror" />
            {phase === 'calibrating' && (
              <div className="overlay">
                <p>화면을 정면으로 바라보고 바른 자세로 앉아 주세요</p>
                <div className="progress"><div style={{ width: `${calibProgress * 100}%` }} /></div>
              </div>
            )}
            {(phase === 'idle' || phase === 'error' || phase === 'loading') && (
              <div className="overlay">
                {phase === 'loading' ? (
                  <p>카메라와 분석 모델을 준비하는 중…</p>
                ) : (
                  <>
                    {error && <p className="error">{error}</p>}
                    <button onClick={start}>{phase === 'error' ? '다시 시도' : '감독 시작'}</button>
                    <p className="muted small">영상은 서버로 전송되지 않고 이 브라우저 안에서만 분석됩니다.</p>
                  </>
                )}
              </div>
            )}
            {live && phase === 'monitoring' && live.active.length > 0 && (
              <div className="active-chips">
                {live.active.map((a) => (
                  <span key={a.kind} className="chip">
                    {a.message} · {(a.heldMs / 1000).toFixed(1)}/{(a.durationMs / 1000).toFixed(1)}초
                  </span>
                ))}
              </div>
            )}
          </div>

          {phase === 'monitoring' && (
            <button className="ghost" onClick={runCalibration}>기준 자세 다시 잡기</button>
          )}

          {live && b && (
            <table className="metrics">
              <tbody>
                <tr><th>FPS</th><td>{live.fps}</td><th>얼굴 수</th><td>{live.features.faceCount}</td></tr>
                <tr>
                  <th>고개 좌우</th><td>{fmt(live.features.yaw, (y) => angleDiff(y, b.yaw))}° / ±{PC_THRESHOLDS.yawDeg}</td>
                  <th>고개 상하</th><td>{fmt(live.features.pitch, (p) => angleDiff(p, b.pitch))}° / {PC_THRESHOLDS.pitchDownDeg}</td>
                </tr>
                <tr>
                  <th>시선 좌우</th><td>{fmt(live.features.gazeX, (g) => g - b.gazeX, 2)} / ±{PC_THRESHOLDS.gazeX}</td>
                  <th>시선 아래</th><td>{fmt(live.features.gazeY, (g) => g - b.gazeY, 2)} / {PC_THRESHOLDS.gazeDown}</td>
                </tr>
                <tr>
                  <th>몸통 이동</th>
                  <td>{b.shoulders && live.features.shoulders ? Math.hypot(live.features.shoulders.cx - b.shoulders.cx, live.features.shoulders.cy - b.shoulders.cy).toFixed(2) : '-'} / {PC_THRESHOLDS.torsoShift}</td>
                  <th>어깨 너비비</th>
                  <td>{b.shoulders && live.features.shoulders ? (live.features.shoulders.width / b.shoulders.width).toFixed(2) : '-'}</td>
                </tr>
              </tbody>
            </table>
          )}
        </section>

        <aside className="side">
          <section className="panel">
            <h3>보조 카메라 (휴대폰)</h3>
            {phone === 'connected' ? (
              <div>
                <p>연결됨 · {phoneStatus?.calibrated ? '감시 중' : '준비 중'}</p>
                {phoneStatus && (
                  <p className="muted small">
                    {phoneStatus.fps} FPS · 손 {phoneStatus.handCount}개
                    {phoneStatus.objects.length > 0 && ` · 물체: ${phoneStatus.objects.join(', ')}`}
                  </p>
                )}
              </div>
            ) : (
              <div className="qr-box">
                {qr ? <img src={qr} alt="휴대폰 연결 QR" /> : <p className="muted">QR 생성 중…</p>}
                <p className="small">
                  같은 와이파이에서 휴대폰 카메라로 QR을 찍어 주세요. 휴대폰은 옆이나 뒤에 세워 두 손과 책상, 시험 화면이 함께 보이게 놓습니다.
                </p>
                {phoneUrls.length > 0 && (
                  <details className="small">
                    <summary>QR이 안 열리면 주소 직접 입력</summary>
                    {phoneUrls.map((u) => <div key={u} className="mono phone-url">{u}</div>)}
                  </details>
                )}
              </div>
            )}
          </section>

          {phase === 'monitoring' && (
            <section className="panel">
              <h3>전송량</h3>
              <p className="small">
                실제 전송 <b>{formatBytes(sent)}</b> · 영상이었다면 약 {formatBytes(Math.round(videoEquiv))}
                {videoEquiv > 0 && <> (<b>{((1 - sent / videoEquiv) * 100).toFixed(2)}%</b> 절감)</>}
              </p>
            </section>
          )}

          <section className="panel grow">
            <h3>경고 기록</h3>
            <ViolationLog items={violations} />
          </section>
        </aside>
      </main>

      {toast && (
        <div className="toast" role="alert">
          <b>경고</b> {toast.message}
          <span className="muted small"> ({toast.source === 'pc' ? '노트북 캠' : '휴대폰 캠'})</span>
        </div>
      )}
    </div>
  )
}

function fmt(v: number | undefined, f: (v: number) => number, digits = 0) {
  return v === undefined ? '-' : f(v).toFixed(digits)
}

function detailFor(f: PcFeatures, b: PcBaseline): Violation['detail'] {
  const d: Violation['detail'] = { faceCount: f.faceCount }
  if (f.yaw !== undefined) d.yaw = Math.round(angleDiff(f.yaw, b.yaw))
  if (f.pitch !== undefined) d.pitch = Math.round(angleDiff(f.pitch, b.pitch))
  if (f.gazeX !== undefined) d.gazeX = +(f.gazeX - b.gazeX).toFixed(2)
  if (f.gazeY !== undefined) d.gazeY = +(f.gazeY - b.gazeY).toFixed(2)
  return d
}
