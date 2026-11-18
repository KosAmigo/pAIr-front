import { useEffect, useRef, useState } from 'react'
import { useInView } from 'motion/react'
import { duration, ms, useShouldAnimate } from '../../lib/motion'

const POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/_'

/**
 * 오버라인 라벨 글자가 뒤섞였다가 왼쪽부터 맞춰지는 등장 (DESIGN.md §3.7). mono 라벨 전용.
 * 화면 낭독기는 원래 글자만 읽는다. 움직임 줄이기에서는 바로 원래 글자.
 */
export function ScrambleText({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const run = useShouldAnimate()
  const [shown, setShown] = useState(text)
  useEffect(() => {
    if (!run || !inView) return
    const total = ms(duration.slow)
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / total)
      const fixed = Math.floor(p * text.length)
      setShown(
        text
          .split('')
          .map((ch, i) => (i < fixed || ch === ' ' ? ch : POOL[Math.floor(Math.random() * POOL.length)]))
          .join(''),
      )
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [inView, run, text])
  return (
    <span ref={ref} className={className}>
      <span aria-hidden>{run ? shown : text}</span>
      <span className="sr-only">{text}</span>
    </span>
  )
}
