import { useRef, type ElementType, type HTMLAttributes } from 'react'
import { cx } from '../cx'
import { isLowEnd } from '../../lib/motion'
import { useInViewPause } from './useInViewPause'

/**
 * 테두리를 따라 도는 브랜드 그라데이션 빛 (DESIGN.md §3.7).
 * 표현 무대에서는 주인공 카드 하나, 진행 중 상태에만. 둥근 모서리는 className 의 rounded-* 를 따른다.
 */
export function GlowBorder({
  as: Tag = 'div',
  active = true,
  className,
  ...rest
}: HTMLAttributes<HTMLElement> & { as?: ElementType; active?: boolean }) {
  const ref = useRef<HTMLElement>(null)
  const paused = useInViewPause(ref) || isLowEnd()
  return <Tag ref={ref} data-paused={paused} className={cx(active && 'fx-glow-border', className)} {...rest} />
}
