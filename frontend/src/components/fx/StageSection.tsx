import type { ElementType, ReactNode } from 'react'
import { cx } from '../cx'
import { Aurora } from './Aurora'
import { StageContext } from './stage'

/**
 * DESIGN.md §3.6 다크 무대. bleed = 전체 폭, inset = 컨테이너 안 둥근 무대.
 * 안에서는 stage-* 토큰만 쓴다. 한 화면에 하나(초기화면만 둘).
 * 무대 안 포커스 링은 stage-brand 로 바뀐다(--color-brand 를 덮어씀).
 */
export function StageSection({
  shape = 'inset',
  aurora = true,
  dots = true,
  as: Tag = 'section',
  className,
  children,
  ...rest
}: {
  shape?: 'bleed' | 'inset'
  aurora?: boolean
  dots?: boolean
  as?: ElementType
  className?: string
  children: ReactNode
  'aria-label'?: string
  id?: string
}) {
  return (
    <Tag
      className={cx(
        'relative isolate overflow-hidden bg-stage-bg text-stage-text [--color-brand:var(--color-stage-brand)]',
        shape === 'inset' && 'rounded-xl border border-stage-line shadow-lg',
        className,
      )}
      {...rest}
    >
      {aurora && <Aurora variant="stage" />}
      {dots && <div aria-hidden className="stage-dots pointer-events-none absolute inset-0 z-0" />}
      <StageContext.Provider value={true}>
        <div className="relative z-10 h-full">{children}</div>
      </StageContext.Provider>
    </Tag>
  )
}
