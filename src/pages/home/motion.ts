// 초기화면 전용 모션 설정 (DESIGN.md §4.2). GSAP 플러그인 등록과 Lenis 공유.
import { createContext, useContext, type RefObject } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { useGSAP } from '@gsap/react'
import type Lenis from 'lenis'

gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP)

export { gsap, ScrollTrigger, SplitText, useGSAP }

/** 움직임을 켜도 되는 환경. GSAP 연출은 모두 이 조건 안에서만 만든다. */
export const MOTION_OK = '(prefers-reduced-motion: no-preference)'

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export const LenisContext = createContext<RefObject<Lenis | null> | null>(null)
/** Lenis는 화면이 열린 뒤에 만들어지므로 ref로 나눠 준다. 쓸 때 .current 를 읽는다. */
export const useLenis = () => useContext(LenisContext)

/** 상단 바 앵커: Lenis가 있으면 부드럽게, 없으면 바로 이동한다. */
export function scrollToId(lenisRef: RefObject<Lenis | null> | null, id: string) {
  const lenis = lenisRef?.current ?? null
  const el = document.getElementById(id)
  if (!el) return
  if (lenis) lenis.scrollTo(el, { offset: -72, duration: 1.4 })
  else el.scrollIntoView({ block: 'start' })
}
