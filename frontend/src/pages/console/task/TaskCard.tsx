// 과제 목록 카드 (DESIGN.md §7-9-1, 2026-11-20 개편). 카드 전체가 검수 상세로 가는 링크이고,
// 공개하기·숨기기는 검수 상세 화면에서 한다. 누를 수 있는 카드라 호버하면 떠오르고 Spotlight 가 비친다.
import { Link } from 'react-router-dom'
import { CircleMinus } from 'lucide-react'
import { cx } from '../../../components/cx'
import { Spotlight } from '../../../components/fx'
import { LevelPips, type Level } from '../../../components/taskKind'
import type { ConsoleTaskSummary } from '../../../consoleApi'
import { checkBadge, isClosed, tabOf, trackOf } from '../../../data/taskBoard'
import { CheckFailNote, CompetencyBadges, MinutesChip, TrackTile } from './badges'

const LEVELS = ['초급', '중급', '고급']

export function TaskCard({ task: t }: { task: ConsoleTaskSummary }) {
  const track = trackOf(t)
  const tab = tabOf(t)
  const closed = isClosed(t)
  // 자동 확인은 검수 전 과제에서 실패했을 때만 알린다
  const checkFailed = tab === 'draft' && checkBadge(t) === 'fail'
  const hasComps = (t.competencies ?? []).length > 0
  return (
    <Spotlight
      className={cx(
        'group relative flex w-full flex-col rounded-xl border bg-panel p-4 shadow-sm transition-[transform,box-shadow,border-color] duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md',
        tab === 'draft' ? 'border-caution/30' : 'border-line hover:border-line-strong',
        closed && 'opacity-75',
      )}
    >
      {/* 윗줄: 직군 아이콘 · 난이도(가운데) · 제한 시간(오른쪽) */}
      <div className="relative z-10 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <TrackTile track={track} size={36} />
        <span className="justify-self-center">{t.difficulty && LEVELS.includes(t.difficulty) && <LevelPips level={t.difficulty as Level} />}</span>
        <span className="justify-self-end">
          <MinutesChip minutes={t.minutes} />
        </span>
      </div>

      <Link to={`/console/tasks/${encodeURIComponent(t.id)}`} className="mt-3 block rounded-sm outline-offset-4 after:absolute after:inset-0 after:z-10 after:rounded-xl after:content-['']">
        <h3 className="relative line-clamp-2 text-[15px] leading-6 font-bold tracking-[-0.01em] break-keep text-text group-hover:text-brand">{t.title}</h3>
      </Link>
      <p className="relative mt-1 line-clamp-2 text-[13px] leading-5 break-keep text-text-muted">
        {t.summary || <span className="text-text-faint">한 줄 소개가 없어요</span>}
      </p>

      {(hasComps || checkFailed || closed) && (
        <div className="relative mt-3 flex min-w-0 items-center gap-1.5">
          {checkFailed && <CheckFailNote />}
          {closed && (
            <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-panel-raised px-2 text-[12px] font-semibold text-text-muted">
              <CircleMinus size={12} aria-hidden /> 내림
            </span>
          )}
          <CompetencyBadges keys={t.competencies} />
        </div>
      )}
    </Spotlight>
  )
}

/** 불러오는 동안 카드 자리 */
export function TaskCardSkeleton() {
  return (
    <li aria-hidden className="flex animate-pulse flex-col gap-2.5 rounded-xl border border-line bg-panel p-4 shadow-sm">
      <div className="flex gap-3">
        <span className="size-9 rounded-xl bg-panel-raised" />
        <span className="mt-1 h-5 w-20 rounded-full bg-panel-raised" />
      </div>
      <span className="mt-1 h-5 w-3/4 rounded bg-panel-raised" />
      <span className="h-4 w-full rounded bg-panel-raised" />
      <span className="h-4 w-1/2 rounded bg-panel-raised" />
    </li>
  )
}
