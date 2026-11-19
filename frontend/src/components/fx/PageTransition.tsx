import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { distance, duration, easing } from '../../lib/motion'

/**
 * 화면 전환 (DESIGN.md §4.1). routeKey 가 바뀌면 들어오는 화면만 연출한다.
 * 상단 바·사이드바 같은 셸은 이 밖에 둬서 움직이지 않게 한다.
 * stage="focus"(집중 무대)는 페이드만 짧게.
 */
export function PageTransition({
  routeKey,
  stage = 'expressive',
  className,
  children,
}: {
  routeKey: string
  stage?: 'expressive' | 'focus'
  className?: string
  children: ReactNode
}) {
  const reduce = useReducedMotion()
  const calm = reduce || stage === 'focus'
  return (
    <motion.div
      key={routeKey}
      className={className}
      initial={{ opacity: 0, y: calm ? 0 : distance.app }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: calm ? duration.fast : duration.slow, ease: easing.expo }}
    >
      {children}
    </motion.div>
  )
}
