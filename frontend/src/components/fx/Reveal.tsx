import type { ReactNode } from 'react'
import { motion, useReducedMotion, type Variants } from 'motion/react'
import { distance, duration, easing, stagger as staggerTok } from '../../lib/motion'

type Tag = 'div' | 'section' | 'ul' | 'li' | 'header' | 'span'
const VIEWPORT = { once: true, margin: '0px 0px -40px 0px' } as const

/**
 * 화면에 들어올 때 아래에서 올라오는 등장 (DESIGN.md §3.7, §4.1). 한 번만.
 * 움직임 줄이기에서는 y 없이 짧은 페이드만 한다.
 */
export function Reveal({
  as = 'div',
  delay = 0,
  y = distance.app,
  className,
  children,
}: {
  as?: Tag
  delay?: number
  y?: number
  className?: string
  children: ReactNode
}) {
  const reduce = useReducedMotion()
  const M = motion[as] as typeof motion.div
  return (
    <M
      className={className}
      initial={{ opacity: 0, y: reduce ? 0 : y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={VIEWPORT}
      transition={{ duration: reduce ? duration.fast : duration.slow, ease: easing.expo, delay: reduce ? 0 : delay }}
    >
      {children}
    </M>
  )
}

/** 순차 등장 묶음. 자식은 RevealItem. */
export function RevealGroup({
  as = 'div',
  gap = staggerTok.normal,
  className,
  children,
}: {
  as?: Tag
  gap?: number
  className?: string
  children: ReactNode
}) {
  const M = motion[as] as typeof motion.div
  const v: Variants = { hidden: {}, shown: { transition: { staggerChildren: gap } } }
  return (
    <M className={className} variants={v} initial="hidden" whileInView="shown" viewport={VIEWPORT}>
      {children}
    </M>
  )
}

export function RevealItem({ as = 'div', className, children }: { as?: Tag; className?: string; children: ReactNode }) {
  const reduce = useReducedMotion()
  const M = motion[as] as typeof motion.div
  const v: Variants = {
    hidden: { opacity: 0, y: reduce ? 0 : distance.app },
    shown: { opacity: 1, y: 0, transition: { duration: reduce ? duration.fast : duration.slow, ease: easing.expo } },
  }
  return (
    <M className={className} variants={v}>
      {children}
    </M>
  )
}
