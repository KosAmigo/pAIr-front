// 휴대폰 보조 캠 페이지: /proctor/phone?p={짝 코드} (PC 화면의 QR 로 들어온다).
// 휴대폰은 영상이 아니라 JPEG 프레임(변화가 있을 때와 5초마다)을 서버 중계로 PC 에 보내기만 한다.
// 책상 스캔·손·물체 분석과 경고 저장은 전부 응시자 PC 가 받은 프레임으로 한다 (모델·추론·영상 스트리밍 없음).
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Smartphone } from 'lucide-react'
import { Button, Logo, StatusDot } from '../../components/ui'
import { createPhoneRelay, type PhoneRelay } from '../relay/PhoneRelay.ts'
import { parseQualityMode } from '../core/phoneQuality.ts'
import { PhoneFrameSender } from '../relay/phoneSender.ts'
import type { SendMode } from '../relay/phoneSenderCore.ts'
import { openCamera, stopCamera } from '../vision/camera.ts'

type Phase = 'connecting' | 'ready' | 'loading' | 'sending' | 'error'

/** 페이지가 다시 불러와져도 남도록 마지막 단계를 탭 저장소에 적어 둔다 (어느 단계에서 끊기는지 알려고) */
const TRACE_KEY = 'pair.phone.lastPhase'
const PHASE_LABEL: Partial<Record<Phase, string>> = {
  loading: '카메라 준비',
  sending: '사진 송신',
}

function readLastPhase(): Phase | null {
  try {
    return sessionStorage.getItem(TRACE_KEY) as Phase | null
  } catch {
    return null // 저장소를 못 쓰는 환경이면 진단 안내만 건너뛴다
  }
}

const STATUS_INTERVAL_MS = 1000

export default function PhoneCamPage() {
  const [params] = useSearchParams()
  const pairCode = params.get('p') ?? ''
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const socketRef = useRef<PhoneRelay | null>(null)
  const senderRef = useRef<PhoneFrameSender | null>(null)
  const modeRef = useRef<SendMode | null>(null)
  const sendingRef = useRef(false)

  const [phaseState, setPhase] = useState<Phase>('connecting')
  const [errorState, setError] = useState('')
  /** 짝 코드 자체가 틀린 경우: 다시 시도 대신 QR 재스캔 안내 */
  const [fatalState, setFatal] = useState(false)
  // QR 없이 들어온 경우는 연결을 시도하지 않고 바로 안내한다
  const phase: Phase = pairCode ? phaseState : 'error'
  const error = pairCode ? errorState : 'PC 화면의 QR 코드로 접속해 주세요.'
  const fatal = pairCode ? fatalState : true
  /** 이 페이지가 다시 불러와지기 전에 마지막으로 있던 단계 */
  const [previousPhase] = useState(readLastPhase)
  useEffect(() => {
    sendingRef.current = phase === 'sending'
    try {
      sessionStorage.setItem(TRACE_KEY, phase)
    } catch {
      // 저장소를 못 쓰면 기록만 못 남긴다
    }
  }, [phase])
  useEffect(() => {
    if (!pairCode) return
    const socket = createPhoneRelay(
      pairCode,
      (msg) => {
        if (msg.type === 'quality') {
          // 서버가 phone-joined 직후(촬영을 시작하기 전)에도 보내므로 기억해 두었다가 송신기가 만들어지면 적용한다
          const mode = parseQualityMode(msg.mode)
          if (mode) {
            modeRef.current = mode
            senderRef.current?.setRequestedMode(mode)
          }
        }
        if (msg.type === 'phone-joined') setPhase((p) => (p === 'connecting' ? 'ready' : p))
        if (msg.type === 'error') {
          setFatal(true)
          setPhase('error')
          setError(msg.message)
        }
      },
    )
    socketRef.current = socket
    // 타이머가 예정보다 얼마나 늦게 도는지 잰다 (메인 스레드가 오래 막히면 상태 전송이 밀린다)
    let lastTick = performance.now()
    let maxLag = 0
    const statusTimer = window.setInterval(() => {
      const now = performance.now()
      maxLag = Math.max(maxLag, Math.round(now - lastTick - STATUS_INTERVAL_MS))
      lastTick = now
      // 서버는 phone-status 도 "신호"로 센다. 다른 앱으로 전환한 동안에는 보내지 않아야 응답 없음(stale)이 제때 잡힌다
      if (document.visibilityState === 'hidden') return
      socket.send({ type: 'phone-status', status: { sending: sendingRef.current, bytesSent: socket.bytesSent, relay: socket.health(maxLag) } })
    }, STATUS_INTERVAL_MS)
    // 다른 앱으로 전환하면 촬영이 멈춰 프레임·생존 신호가 끊기고, 서버가 15초 뒤 PC 에 응답 없음(stale)을 알린다.
    // (운영 중계는 phone-alert 를 전달하지 않으므로 따로 알리지 않는다)
    return () => {
      window.clearInterval(statusTimer)
      senderRef.current?.stop()
      senderRef.current = null
      socket.close()
      stopCamera(streamRef.current)
    }
  }, [pairCode])

  async function start() {
    const video = videoRef.current
    if (!video) return
    setError('')
    try {
      setPhase('loading')
      // 화면 꺼짐 방지
      await (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<unknown> } }).wakeLock?.request('screen').catch(() => undefined)
      // 책상 스캔 때 고해상도 프레임을 만들 수 있도록 카메라는 1280×720 으로 연다 (평소 송신은 512px 로 줄여 보낸다)
      if (!streamRef.current) streamRef.current = await openCamera(video, 'environment', { width: 1280, height: 720 })
      const socket = socketRef.current
      if (socket && !senderRef.current) {
        const sender = new PhoneFrameSender(video, socket)
        sender.setRequestedMode(modeRef.current)
        socket.onFrameDropped(() => sender.frameDropped())
        senderRef.current = sender
      }
      senderRef.current?.start()
      setPhase('sending')
    } catch (e) {
      setPhase('error')
      setError(e instanceof Error ? e.message : String(e))
    }
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
      </div>

      <main className="flex flex-col gap-3 p-4">
        {phase === 'connecting' && <p className="text-[15px]">PC 와 연결하는 중입니다</p>}
        {phase === 'loading' && <p className="text-[15px]">카메라를 준비하는 중입니다</p>}
        {phase === 'error' && (
          <p role="alert" className="rounded-lg border border-alert/40 bg-alert/10 px-3 py-2 text-[14px] text-alert">
            {error}
          </p>
        )}
        {(phase === 'ready' || (phase === 'error' && !fatal)) && (
          <>
            {previousPhase && PHASE_LABEL[previousPhase] && (
              <p role="status" className="rounded-lg border border-caution/40 bg-caution/10 px-3 py-2 text-[13px] leading-5 break-keep text-text">
                이 페이지가 &quot;{PHASE_LABEL[previousPhase]}&quot; 단계에서 다시 불러와졌습니다. 처음부터 다시 진행해 주세요. 계속 반복되면 이 단계를 알려 주세요.
              </p>
            )}
            <p className="text-[14px] leading-6 break-keep text-text-muted">
              시작하면 카메라 사진이 PC 로 전달됩니다(변화가 있을 때와 5초마다). 이후 안내(책상 스캔 등)는 모두 PC 화면에 나옵니다. 평소 사진은 서버가 저장하지 않고 PC 로만 넘기며 분석은 PC 에서 합니다. 이상이 감지되면 그 앞뒤 사진만 부정행위 검토용으로 저장됩니다.
            </p>
            <Button variant="primary" size="lg" onClick={() => void start()}>
              {phase === 'error' ? '다시 시도' : '보조 캠 시작'}
            </Button>
          </>
        )}
        {phase === 'sending' && (
          <>
            <StatusDot status="ok" label="사진 송신 중" />
            <p className="text-[15px] leading-6 break-keep">
              <b>PC 화면의 안내를 따라 주세요.</b> 책상 스캔 때는 책상 전체가 보이는 곳에 세워 두고, 시험 중에는 카메라에 <b>두 손, 키보드, 시험 화면</b>이 함께 보이게 놓습니다.
            </p>
            <p className="text-[13px] text-text-muted">시험이 끝날 때까지 이 화면을 켜 두세요.</p>
          </>
        )}
      </main>
    </div>
  )
}
