// 전체 화면 진입/상태. 전체 화면은 사용자 클릭 같은 직접 동작 안에서만 켤 수 있어서,
// 대기실로 넘어가는 버튼을 누르는 그 순간에 enterFullscreen() 을 부른다.
import { useEffect, useState } from 'react'

export function isFullscreen(): boolean {
  return typeof document !== 'undefined' && Boolean(document.fullscreenElement)
}

/** 전체 화면으로 들어간다. 이미 전체 화면이거나 브라우저가 거절하면 조용히 넘어간다 */
export function enterFullscreen(): void {
  if (typeof document === 'undefined' || document.fullscreenElement) return
  document.documentElement.requestFullscreen?.().catch(() => undefined)
}

export function useFullscreen(): boolean {
  const [on, setOn] = useState(isFullscreen)
  useEffect(() => {
    const sync = () => setOn(isFullscreen())
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])
  return on
}
