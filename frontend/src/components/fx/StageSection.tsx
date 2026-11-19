import type { ElementType, ReactNode } from 'react'
import { cx } from '../cx'
import { Aurora } from './Aurora'
import { StageContext } from './stage'

/**
 * DESIGN.md §3.6 스포트라이트(밝은 강조 영역). 2026-11-19: 어두운 무대를 없애고 밝은 카드로 바꿨다.
 * 아주 옅은 보라 → 파랑 면 + 브랜드 기운 테두리 + 옅은 오로라 + 도트 그리드. bleed = 전체 폭, inset = 둥근 카드.
 * 안에서는 stage-* 토큰(밝은 값)을 쓴다. 한 화면에 하나(초기화면만 둘).
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
        shape === 'inset' && 'spotlight-surface overflow-hidden rounded-xl border border-stage-line shadow-md',
        className,
      )}
      {...rest}
    >
      {shape === 'inset' ? (
        backdrop
      ) : (
        <div aria-hidden className="spotlight-surface pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2 overflow-hidden border-y border-stage-line">
          {backdrop}
        </div>
      )}
      <StageContext.Provider value={true}>
        <div className="relative z-10 h-full">{children}</div>
      </StageContext.Provider>
    </Tag>
  )
}
