// DESIGN.md §4.1 모션 토큰 + §4.4 움직임 줄이기 판단. 시간·easing·스프링 숫자는 이 파일에만 둔다.
import { useEffect, useState } from 'react'
import { useReducedMotion, type Transition } from 'motion/react'

/** 초 단위 (motion/react 기준). CSS·GSAP에서 쓸 때는 ms()로 바꾼다. */
export const duration = {
  instant: 0.08,
  fast: 0.15,
  normal: 0.26,
  slow: 0.6,
  crawl: 0.9,
  count: 1.2,
  pulse: 1.6,
} as const

export const easing = {
  standard: [0.2, 0, 0, 1],
  expo: [0.16, 1, 0.3, 1],
  out: [0, 0, 0.58, 1],
  linear: [0, 0, 1, 1],
} as const satisfies Record<string, [number, number, number, number]>

export const springs = {
  snappy: { type: 'spring', stiffness: 300, damping: 30 },
  gentle: { type: 'spring', stiffness: 120, damping: 14 },
  magnetic: { type: 'spring', stiffness: 150, damping: 15, mass: 0.1 },
} as const satisfies Record<string, Transition>

export const distance = { app: 16, home: 40, lift: -4 } as const
export const scale = { press: 0.97, pop: 1.06 } as const
/** 순차 등장 간격 (0.04–0.08초) */
export const stagger = { tight: 0.04, normal: 0.06 } as const

export const ms = (s: number) => Math.round(s * 1000)

/** 저사양 판단. 모듈 최상단이 아니라 함수 안에서만 navigator를 읽는다. */
export function isLowEnd() {
  return typeof navigator !== 'undefined' && (navigator.hardwareConcurrency ?? 8) <= 4
}

export function prefersReduced() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * §4.4 단일 판단 지점. essential=true(상태를 알리는 움직임)는 저사양에서도 켠다.
 * 움직임 줄이기에서는 항상 false.
 */
export function shouldAnimate({ essential = false }: { essential?: boolean } = {}) {
  if (prefersReduced()) return false
  if (!essential && isLowEnd()) return false
  return true
}

/** React용: 움직임 줄이기 설정이 바뀌면 다시 그린다. */
export function useShouldAnimate({ essential = false }: { essential?: boolean } = {}) {
  const reduce = useReducedMotion()
  if (reduce) return false
  if (!essential && isLowEnd()) return false
  return true
}

/** 커서 반응 부품(Spotlight, Magnetic)은 정밀 포인터가 있을 때만 켠다. */
export function useFinePointer() {
  const [fine, setFine] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)')
    const on = () => setFine(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return fine
}
