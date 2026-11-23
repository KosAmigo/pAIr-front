import { useEffect, useRef } from 'react'
import { useCamHub } from './useCamHub.ts'

const MESSAGE = {
  idle: '영상 대기 중',
  connecting: '휴대폰 사진을 기다리는 중',
  live: '',
  failed: '휴대폰 사진을 받지 못했습니다. 휴대폰 화면을 켠 채 QR 을 다시 찍어 주세요.',
} as const

/** 휴대폰 보조 카메라 화면 (받은 JPEG 프레임을 캔버스 스트림으로 보여 준다, 소리 없음) */
export function PhoneVideo() {
  const { phoneStream, phoneVideo } = useCamHub()
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = ref.current
    if (video) video.srcObject = phoneStream
  }, [phoneStream])

  return (
    <div className="relative mt-3 aspect-video w-full overflow-hidden rounded-lg border border-line bg-black">
      <video ref={ref} autoPlay muted playsInline className="size-full object-contain" aria-label="휴대폰 보조 카메라 화면" />
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
