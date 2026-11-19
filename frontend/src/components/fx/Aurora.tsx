import { useRef } from 'react'
import { cx } from '../cx'
import { isLowEnd } from '../../lib/motion'
import { useInViewPause } from './useInViewPause'

export type AuroraVariant = 'full' | 'band' | 'stage'

/**
 * DESIGN.md §1.2 brand-aurora. 한 화면에 하나만 깐다(다크 무대 안 stage 는 따로 셈).
 * 부모는 position: relative 여야 한다. band 는 위쪽 띠(높이 320px).
 */
export function Aurora({ variant, className }: { variant: AuroraVariant; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const paused = useInViewPause(ref) || isLowEnd()
  return (
    <div
      ref={ref}
      aria-hidden
      data-variant={variant}
      data-paused={paused}
      className={cx('fx-aurora z-0', variant === 'band' && 'bottom-auto h-80', className)}
    >
      <i />
      <i />
      <i />
    </div>
  )
}
