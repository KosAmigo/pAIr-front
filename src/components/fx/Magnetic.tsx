import type { ReactNode } from 'react'
import { motion, useMotionValue, useSpring } from 'motion/react'
import { cx } from '../cx'
import { springs, useFinePointer, useShouldAnimate } from '../../lib/motion'

const MAX = 8

/** 커서 쪽으로 살짝 끌려오는 버튼 (최대 8px, DESIGN.md §3.7). 표현 무대에서는 화면당 주 행동 1개. */
export function Magnetic({ children, className }: { children: ReactNode; className?: string }) {
  const fine = useFinePointer()
  const run = useShouldAnimate()
  const x = useSpring(useMotionValue(0), springs.magnetic)
  const y = useSpring(useMotionValue(0), springs.magnetic)
  if (!fine || !run) return <span className={cx('inline-flex', className)}>{children}</span>
  return (
    <motion.span
      className={cx('inline-flex', className)}
      style={{ x, y }}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2)
        const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2)
        x.set(Math.max(-1, Math.min(1, dx)) * MAX)
        y.set(Math.max(-1, Math.min(1, dy)) * MAX * 0.6)
      }}
      onPointerLeave={() => {
        x.set(0)
        y.set(0)
      }}
    >
      {children}
    </motion.span>
  )
}
