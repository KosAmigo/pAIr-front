import { useEffect, useRef, useState } from 'react'
import { animate, useInView } from 'motion/react'
import { duration, easing, useShouldAnimate } from '../../lib/motion'

/**
 * 숫자 카운트업 (DESIGN.md §3.7). 화면에 처음 들어올 때 한 번.
 * 화면 낭독기는 최종값만 읽는다. 움직임 줄이기에서는 바로 최종값.
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
  useEffect(() => {
    if (!run || !inView) return
    const c = animate(from, value, { duration: duration.count, ease: easing.expo, onUpdate: setShown })
    return () => c.stop()
  }, [inView, run, value, from])
  const fmt = (n: number) => n.toFixed(decimals)
  return (
    <span ref={ref} className={className}>
      <span aria-hidden className="tnum">
        {fmt(run ? shown : value)}
      </span>
      <span className="sr-only">{fmt(value)}</span>
    </span>
  )
}
