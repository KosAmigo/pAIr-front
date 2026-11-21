import { useEffect, useRef } from 'react'
import { useCamHub } from './useCamHub.ts'

const MESSAGE = {
  idle: '영상 대기 중',
  connecting: '휴대폰 영상 연결 중',
  live: '',
  failed: '휴대폰 영상을 연결하지 못했습니다. 휴대폰 화면을 켠 채 QR 을 다시 찍어 주세요.',
} as const

/** 휴대폰 보조 카메라 영상 (WebRTC 로 직접 받은 스트림, 소리 없음) */
export function PhoneVideo() {
  const { phoneStream, phoneVideo } = useCamHub()
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = ref.current
    if (video) video.srcObject = phoneStream
  }, [phoneStream])

  return (
    <div className="relative mt-3 aspect-video w-full overflow-hidden rounded-lg border border-line bg-black">
      <video ref={ref} autoPlay muted playsInline className="size-full object-contain" aria-label="휴대폰 보조 카메라 영상" />
      {phoneVideo !== 'live' && (
        <p
          role={phoneVideo === 'failed' ? 'alert' : 'status'}
          className="absolute inset-0 flex items-center justify-center px-4 text-center text-[13px] leading-5 break-keep text-white"
        >
          {MESSAGE[phoneVideo]}
        </p>
      )}
    </div>
  )
}
