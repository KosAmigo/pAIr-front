// 과제 목록 카드 (DESIGN.md §7-9-1, 2026-11-20 개편). 카드 전체가 검수 상세로 가는 링크이고,
// 공개하기·숨기기는 검수 상세 화면에서 한다. 누를 수 있는 카드라 호버하면 떠오르고 Spotlight 가 비친다.
import { Link } from 'react-router-dom'
import { CircleMinus, Lock } from 'lucide-react'
import { cx } from '../../../components/cx'
import { Spotlight } from '../../../components/fx'
import { LevelPips, type Level } from '../../../components/taskKind'
import type { ConsoleTaskSummary } from '../../../consoleApi'
import { checkBadge, isClosed, tabOf, trackOf } from '../../../data/taskBoard'
import { AiBadge, CheckBadge, MinutesChip, TrackLabel, TrackTile } from './badges'

const LEVELS = ['초급', '중급', '고급']

export function TaskCard({ task: t }: { task: ConsoleTaskSummary }) {
  const track = trackOf(t)
  const tab = tabOf(t)
  const check = checkBadge(t)
  const closed = isClosed(t)
  return (
    <Spotlight
      className={cx(
        'group relative flex w-full flex-col rounded-xl border bg-panel p-4 shadow-sm transition-[transform,box-shadow,border-color] duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md',
        tab === 'draft' ? 'border-caution/30' : 'border-line hover:border-line-strong',
        closed && 'opacity-75',
      )}
    >
      {/* 검수 전 카드는 위쪽에 주의색 띠 */}
      {tab === 'draft' && <span aria-hidden className="absolute inset-x-4 top-0 h-0.5 rounded-b-full bg-caution/70" />}
      <div className="relative z-10 flex items-start gap-2.5">
        <TrackTile track={track} size={36} />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {t.generated && <AiBadge />}
          {check && <CheckBadge result={check} />}
          {t.usage === 'LIVE' && (
            <span className="inline-flex h-[22px] items-center gap-1 rounded-full bg-text/8 px-2 text-[12px] font-semibold text-text">
              <Lock size={12} aria-hidden /> {tab === 'draft' ? '비공개용' : '실전 전용'}
            </span>
          )}
          {closed && (
            <span className="inline-flex h-[22px] items-center gap-1 rounded-full bg-panel-raised px-2 text-[12px] font-semibold text-text-muted">
              <CircleMinus size={12} aria-hidden /> 내림
            </span>
          )}
        </div>
      </div>

      <Link to={`/console/tasks/${encodeURIComponent(t.id)}`} className="mt-3 block rounded-sm outline-offset-4 after:absolute after:inset-0 after:z-10 after:rounded-xl after:content-['']">
        <h3 className="relative line-clamp-2 text-[15px] leading-6 font-bold tracking-[-0.01em] break-keep text-text group-hover:text-brand">{t.title}</h3>
      </Link>
      <p className="relative mt-1 line-clamp-2 text-[13px] leading-5 break-keep text-text-muted">
        {t.summary || <span className="text-text-faint">한 줄 소개가 없어요</span>}
      </p>

      <div className="relative mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <TrackLabel track={track} />
        {t.difficulty && LEVELS.includes(t.difficulty) && <LevelPips level={t.difficulty as Level} />}
        <MinutesChip minutes={t.minutes} />
      </div>
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
