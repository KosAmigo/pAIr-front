// 과제 목록·과제 만들기·만드는 중인 과제 세 화면이 같이 쓰는 두 버튼 (DESIGN.md §6.1-1).
// '과제 만들기'(주인공, 그라데이션 알약) + '만드는 중인 과제'(짝 알약: 흰 바탕 + 그라데이션 테두리 + 개수 배지).
// 화면마다 크기(size)만 다르고 모양·색·효과는 같다. 도는 작업이 있으면 은은한 빛 테두리·진행 점이 살아 움직이고(움직임 줄이기에서는 정지),
// 없으면 차분하다. 배지 개수는 화면 읽기용 글로도 읽힌다.
import { FilePlus2, Layers } from 'lucide-react'
import { cx } from '../../../components/cx'
import { ButtonLink } from '../../../components/ui'
import { generatingHref } from '../../../data/taskGenJobs'
import { useGenJobs } from './useGenJobs'

/** lg = 과제 목록 스포트라이트, md = 머리글·옆 버튼 */
export type GenButtonSize = 'lg' | 'md'
const SIZE: Record<GenButtonSize, string> = {
  lg: 'h-12 px-6 text-[16px]',
  md: 'h-10 px-5 text-[15px]',
}

export function CreateTaskButton({ size = 'md', className }: { size?: GenButtonSize; className?: string }) {
  return (
    <ButtonLink
      to="/console/tasks/new"
      variant="primary"
      data-testid="create-task-btn"
      className={cx('rounded-full shadow-[0_12px_32px_-12px_rgb(108_71_255/0.7)]', SIZE[size], className)}
    >
      <FilePlus2 size={size === 'lg' ? 18 : 16} aria-hidden /> 과제 만들기
    </ButtonLink>
  )
}

export function GeneratingButton({ size = 'md', className }: { size?: GenButtonSize; className?: string }) {
  const { active } = useGenJobs()
  const live = active > 0
  return (
    <span className={cx('relative inline-flex', className)}>
      {/* 도는 작업이 있으면 뒤에서 은은하게 숨 쉬는 빛 (움직임 줄이기면 멈춘 채 옅게만 보인다) */}
      {live && <span aria-hidden className="absolute -inset-1 rounded-full bg-brand-gradient opacity-25 blur-md motion-safe:animate-pulse" />}
      <ButtonLink
        to={generatingHref()}
        variant="secondary"
        data-testid="generating-btn"
        data-live={live}
        aria-label={live ? `만드는 중인 과제, 진행 중 ${active}개` : '만드는 중인 과제'}
        className={cx(
          'relative gap-2 rounded-full border-transparent bg-[linear-gradient(#fff,#fff)_padding-box,linear-gradient(120deg,#8b5cf6,#6c47ff_45%,#2f5bea)_border-box] font-bold',
          live ? 'text-brand shadow-[0_8px_26px_-10px_rgb(108_71_255/0.55)]' : 'text-text-muted hover:text-text',
          SIZE[size],
        )}
      >
        {live ? (
          <span aria-hidden className="relative inline-flex size-2.5">
            <span className="absolute inline-flex size-full rounded-full bg-brand opacity-60 motion-safe:animate-ping" />
            <span className="relative inline-flex size-2.5 rounded-full bg-brand" />
          </span>
        ) : (
          <Layers size={size === 'lg' ? 18 : 16} aria-hidden />
        )}
        만드는 중인 과제
        {live && (
          <span data-testid="gen-badge" className="tnum inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-brand-gradient px-1.5 font-mono text-[13px] font-bold text-on-accent">
            {active}
          </span>
        )}
      </ButtonLink>
    </span>
  )
}
