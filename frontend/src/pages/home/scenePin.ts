// DESIGN.md §4.3 스크롤 고정(pin) 장면 전환. ②③ 섹션만 쓴다.
// 스크롤 위치로는 "장면 번호"만 정하고, 장면 사이 전환은 시간으로 재생한다(섞이지 않게).
// 고정은 768px 이상이고 움직임 줄이기가 아닐 때만. 장면 점으로 건너뛸 수 있다.
import { useRef, useState, type RefObject } from 'react'
import { ScrollTrigger, gsap, useGSAP } from './motion'

export const PIN_OK = '(min-width: 768px) and (prefers-reduced-motion: no-preference)'
export const STACK_OK = '(max-width: 767.98px) and (prefers-reduced-motion: no-preference)'

/**
 * pinRef 요소를 lengthPct(화면 높이의 %)만큼 고정하고, 고정 구간을 count 개 장면으로 나눈다.
 * scene: 아직 고정 구간 전이면 -1. pinned: 지금 고정 연출이 켜진 환경인지.
 */
export function useScenePin(pinRef: RefObject<HTMLElement | null>, count: number, lengthPct: number) {
  const [scene, setScene] = useState(-1)
  const [pinned, setPinned] = useState(false)
  const st = useRef<ScrollTrigger | null>(null)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(PIN_OK, () => {
        const el = pinRef.current
        if (!el) return
        setPinned(true)
        st.current = ScrollTrigger.create({
          trigger: el,
          pin: true,
          // 내용이 화면보다 낮으면 가운데에, 높으면 상단 바 아래에 고정한다
          start: () => (el.offsetHeight < window.innerHeight - 96 ? 'center center' : 'top top+=72'),
          end: `+=${lengthPct}%`,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            if (!self.isActive && self.progress <= 0) return
            const i = Math.min(count - 1, Math.floor(self.progress * count))
            setScene((s) => (s === i ? s : i))
          },
        })
        // 고정 전에 화면에 들어오면 첫 장면을 미리 재생하고, 위로 벗어나면 처음으로 되돌린다
        ScrollTrigger.create({
          trigger: el,
          start: 'top 75%',
          onEnter: () => setScene((s) => (s < 0 ? 0 : s)),
          onLeaveBack: () => setScene(-1),
        })
        return () => {
          st.current = null
          setPinned(false)
          setScene(-1)
        }
      })
    },
    { dependencies: [count, lengthPct] },
  )

  return { scene, pinned, st }
}

