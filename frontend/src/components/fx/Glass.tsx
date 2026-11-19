import type { ElementType, HTMLAttributes } from 'react'
import { cx } from '../cx'
import { useOnStage } from './stage'

/** DESIGN.md §3.5 유리 표면. 표·폼·긴 본문 패널에는 쓰지 않는다. */
export function Glass({
  as: Tag = 'div',
  tone,
  className,
  ...rest
}: HTMLAttributes<HTMLElement> & { as?: ElementType; tone?: 'light' | 'stage' }) {
  const onStage = useOnStage()
  const t = tone ?? (onStage ? 'stage' : 'light')
  return <Tag className={cx(t === 'stage' ? 'glass-stage' : 'glass', className)} {...rest} />
}
