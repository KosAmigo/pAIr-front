import { useEffect, useRef, useState } from 'react'
import { useCamHub } from './useCamHub.ts'

const MESSAGE = {
  idle: '영상 대기 중 (휴대폰에서 "보조 캠 시작"을 눌러 주세요)',
  connecting: '휴대폰 영상 연결 중',
  live: '',
  failed: '휴대폰 영상을 연결하지 못했습니다. 휴대폰 화면을 켠 채 QR 을 다시 찍어 주세요.',
} as const

/** 영상이 이 시간 동안 새 프레임 없이 멈춰 있으면 "들어오지 않음"으로 안내한다 */
const STALL_MS = 4000
const STALL_CHECK_MS = 1000
/** 영상 연결 중이 이 시간을 넘기면 네트워크 원인을 안내한다 */
const SLOW_CONNECT_MS = 10000
const SLOW_CONNECT_MESSAGE = '영상 경로를 만들지 못하고 있습니다. PC 와 휴대폰이 같은 와이파이인지(게스트·공용 와이파이는 기기 간 통신이 막힘), VPN 이 꺼져 있는지 확인해 주세요. 휴대폰이 LTE 면 TURN 서버가 필요합니다.'

/** 휴대폰 보조 카메라 영상 (WebRTC 로 직접 받은 스트림, 소리 없음) */
export function PhoneVideo() {
  const { phoneStream, phoneVideo, phoneStatus } = useCamHub()
  const ref = useRef<HTMLVideoElement>(null)
  const [stalled, setStalled] = useState(false)
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    const video = ref.current
    if (video) video.srcObject = phoneStream
  }, [phoneStream])

  // 영상 연결이 오래 걸리면(영상 경로 ICE 가 안 만들어지는 경우) 원인 후보를 안내한다
  useEffect(() => {
    if (phoneVideo !== 'connecting') return
    const id = window.setTimeout(() => setSlow(true), SLOW_CONNECT_MS)
    return () => {
      window.clearTimeout(id)
      setSlow(false)
    }
  }, [phoneVideo])

  // 연결은 'live' 인데 화면이 검거나 멈춰 있는 경우(휴대폰이 잠기거나 카메라가 중단됨)를 알린다
  useEffect(() => {
    if (phoneVideo !== 'live') return
    const video = ref.current
    if (!video) return
    let lastTime = -1
    let lastChange = performance.now()
    const id = window.setInterval(() => {
      if (video.currentTime !== lastTime) {
        lastTime = video.currentTime
        lastChange = performance.now()
        setStalled(false)
      } else if (performance.now() - lastChange > STALL_MS) {
        setStalled(true)
      }
    }, STALL_CHECK_MS)
    return () => {
      window.clearInterval(id)
      setStalled(false)
    }
  }, [phoneVideo, phoneStream])

  // 휴대폰이 보내는 상태(sending)로 원인을 가려 안내한다: 송신 전이면 시작 버튼, 송신 중인데 멈췄으면 화면 꺼짐·앱 전환
  const stalledMessage =
    phoneStatus && !phoneStatus.sending
      ? '휴대폰 영상이 들어오지 않습니다. 휴대폰에서 "보조 캠 시작"을 눌러 주세요.'
      : '휴대폰 영상이 멈췄습니다. 휴대폰 화면이 꺼졌거나 다른 앱으로 나가지 않았는지 확인해 주세요.'
  const message = phoneVideo === 'connecting' && slow ? SLOW_CONNECT_MESSAGE : phoneVideo !== 'live' ? MESSAGE[phoneVideo] : stalled ? stalledMessage : ''

  return (
    <div className="relative mt-3 aspect-video w-full overflow-hidden rounded-lg border border-line bg-black">
      <video ref={ref} autoPlay muted playsInline className="size-full object-contain" aria-label="휴대폰 보조 카메라 영상" />
      {message && (
        <p
          role={phoneVideo === 'failed' || stalled ? 'alert' : 'status'}
          className="absolute inset-0 flex items-center justify-center px-4 text-center text-[13px] leading-5 break-keep text-white"
        >
          {message}
        </p>
      )}
    </div>
  )
}
