import type { ReactNode } from 'react'
import { cx } from '../../components/cx'
import { GradientText, ScrambleText, useOnStage } from '../../components/fx'

// DESIGN.md §7-1 섹션 머리: 오버라인 라벨(brand) → hero 제목(핵심 단어 하나만 그라데이션) → lead 설명.
export default function SectionHead({
  label,
  title,
  lead,
  center,
  compact,
  className,
}: {
  label: string
  title: ReactNode
  lead?: ReactNode
  center?: boolean
  /** 좁은 칸에 들어가는 제목 (복기 섹션) */
  compact?: boolean
  className?: string
}) {
  // 다크 무대(§3.6) 안에서는 stage 토큰으로 바뀐다
  const stage = useOnStage()
  return (
    <div data-reveal className={cx(center && 'text-center', className)}>
      <p className={cx('label', stage ? 'text-stage-brand' : 'text-brand')}>
        <ScrambleText text={label} />
      </p>
      <h2
        className={cx(
          'mt-4 leading-[1.1] font-extrabold tracking-[-0.035em]',
          compact ? 'text-[length:clamp(36px,3.4vw,52px)]' : 'text-[length:clamp(40px,4.4vw,64px)]',
          stage ? 'text-stage-text' : 'text-text',
        )}
      >
        {title}
      </h2>
      {lead && (
        <p className={cx('mt-5 max-w-[560px] text-[20px] leading-8', center && 'mx-auto', stage ? 'text-stage-muted' : 'text-text-muted')}>
          {lead}
        </p>
      )}
    </div>
  )
}

/** 제목 안 핵심 단어 하나에만 쓰는 그라데이션 글씨 */
export function Grad({ children }: { children: ReactNode }) {
  return <GradientText>{children}</GradientText>
}
