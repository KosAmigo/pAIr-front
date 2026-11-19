import type { ElementType, HTMLAttributes, PointerEvent } from 'react'
import { cx } from '../cx'
import { useFinePointer, useShouldAnimate } from '../../lib/motion'
import { useOnStage } from './stage'

type Props = HTMLAttributes<HTMLElement> & { as?: ElementType; to?: string; type?: 'button' | 'submit' }

/**
 * 커서를 따라 카드 면에 비치는 빛 (DESIGN.md §3.7). 누를 수 있는 카드에만 쓴다. 표 행·입력창 금지.
 * as={Link} 처럼 다른 컴포넌트로 그릴 수 있다.
 */
export function Spotlight({ as: Tag = 'div', className, onPointerMove, onPointerLeave, ...rest }: Props) {
  const fine = useFinePointer()
  const animate = useShouldAnimate()
  const onStage = useOnStage()
  const on = fine && animate
  return (
    <Tag
      data-tone={onStage ? 'stage' : 'light'}
      className={cx(on && 'fx-spotlight', className)}
      onPointerMove={(e: PointerEvent<HTMLElement>) => {
        if (on) {
          const r = e.currentTarget.getBoundingClientRect()
          e.currentTarget.style.setProperty('--spot-x', `${e.clientX - r.left}px`)
          e.currentTarget.style.setProperty('--spot-y', `${e.clientY - r.top}px`)
          e.currentTarget.style.setProperty('--spot-o', '1')
        }
        onPointerMove?.(e)
      }}
      onPointerLeave={(e: PointerEvent<HTMLElement>) => {
        e.currentTarget.style.setProperty('--spot-o', '0')
        onPointerLeave?.(e)
      }}
      {...rest}
    />
  )
}
