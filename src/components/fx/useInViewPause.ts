import { useEffect, useState, type RefObject } from 'react'

/** 화면 밖이거나 탭이 숨겨지면 true. 반복 연출은 이 값으로 멈춘다 (DESIGN.md §4.2). */
export function useInViewPause(ref: RefObject<Element | null>) {
  const [offscreen, setOffscreen] = useState(false)
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setOffscreen(!e.isIntersecting))
    io.observe(el)
    const vis = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', vis)
    return () => {
      io.disconnect()
      document.removeEventListener('visibilitychange', vis)
    }
  }, [ref])
  return offscreen || hidden
}
