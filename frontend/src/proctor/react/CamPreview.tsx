import { useEffect, useRef } from 'react'
import { cx } from '../../components/cx'
import { camHub } from '../camHub.ts'
import { useCamHub } from './useCamHub.ts'

/** 허브의 카메라 스트림을 보여 주는 미리보기 (거울처럼 좌우 반전). 분석은 허브의 숨은 video 가 한다 */
export function CamPreview({ className }: { className?: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  const { camera } = useCamHub()
  useEffect(() => {
    const el = ref.current
    const s = camHub.stream()
    if (!el || camera !== 'ready' || !s) return
    el.srcObject = s
    el.muted = true
    el.playsInline = true
    void el.play().catch(() => undefined)
    return () => {
      el.srcObject = null
    }
  }, [camera])
  return <video ref={ref} className={cx('size-full -scale-x-100 object-cover', className)} aria-label="내 카메라 미리보기" />
}
