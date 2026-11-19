import { useEffect, useRef, useState } from 'react'
import { animate, useInView } from 'motion/react'
import { duration, easing, ms, useShouldAnimate } from '../../lib/motion'

/**
 * 숫자 카운트업 (DESIGN.md §3.7). 화면에 처음 들어올 때 한 번.
 * 화면 낭독기는 최종값만 읽는다. 움직임 줄이기에서는 바로 최종값.
 * 안전장치: 화면 진입 감지나 애니메이션 프레임이 돌지 않는 환경(숨은 탭, 화면 없는 브라우저)에서도
 * 연출 시간이 지나면 반드시 최종값이 보이게 한다. 숫자가 0 에 멈춰 보이는 일이 없게.
 */
export function CountUp({
  value,
  decimals = 0,
  from = 0,
  className,
}: {
  value: number
  decimals?: number
  from?: number
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const run = useShouldAnimate()
  const [shown, setShown] = useState(from)
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    if (!run || !inView) return
    const c = animate(from, value, { duration: duration.count, ease: easing.expo, onUpdate: setShown, onComplete: () => setSettled(true) })
    return () => c.stop()
  }, [inView, run, value, from])
  // 진입 감지와 상관없이, 연출 시간 + 여유가 지나면 최종값으로 고정
  useEffect(() => {
    const t = window.setTimeout(() => setSettled(true), ms(duration.count) + 600)
    return () => window.clearTimeout(t)
  }, [value])
  const fmt = (n: number) => n.toFixed(decimals)
  const display = !run || settled ? value : shown
  return (
    <span ref={ref} className={className}>
      <span aria-hidden className="tnum">
        {fmt(display)}
      </span>
      <span className="sr-only">{fmt(value)}</span>
    </span>
  )
}
