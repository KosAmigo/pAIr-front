import type { ElementType, ReactNode } from 'react'
import { cx } from '../cx'
import { Aurora } from './Aurora'
import { StageContext } from './stage'

/**
 * DESIGN.md §3.6 다크 무대. bleed = 전체 폭, inset = 컨테이너 안 둥근 무대.
 * bleed 는 레이아웃은 컨테이너 안에 두고 어두운 바탕만 화면 좌우 끝까지 편다.
 * 안에서는 stage-* 토큰만 쓴다. 한 화면에 하나(초기화면만 둘). 무대 안 포커스 링은 stage-brand.
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
  const backdrop = (
    <>
      {aurora && <Aurora variant="stage" />}
      {dots && <div aria-hidden className="stage-dots pointer-events-none absolute inset-0 z-0" />}
    </>
  )
  return (
    <Tag
      className={cx(
        'stage-scope relative isolate text-stage-text',
        shape === 'inset' && 'overflow-hidden rounded-xl border border-stage-line bg-stage-bg shadow-lg',
        className,
      )}
      {...rest}
    >
      {shape === 'inset' ? (
        backdrop
      ) : (
        <div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2 overflow-hidden bg-stage-bg">
          {backdrop}
        </div>
      )}
      <StageContext.Provider value={true}>
        <div className="relative z-10 h-full">{children}</div>
      </StageContext.Provider>
    </Tag>
  )
}
