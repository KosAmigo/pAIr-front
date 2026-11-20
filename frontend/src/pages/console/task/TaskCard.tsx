// 과제 목록 카드 (DESIGN.md §7-9-1, 2026-11-20 개편). 카드 전체가 검수 상세로 가는 링크이고,
// 오른쪽 위 ⋯ 메뉴로 공개하기·숨기기를 한다. 누를 수 있는 카드라 호버하면 떠오르고 Spotlight 가 비친다.
import { Link } from 'react-router-dom'
import { ArrowUpRight, CircleMinus, Lock } from 'lucide-react'
import { cx } from '../../../components/cx'
import { Spotlight } from '../../../components/fx'
import { LevelPips, type Level } from '../../../components/taskKind'
import type { ConsoleTaskSummary } from '../../../consoleApi'
import { checkBadge, isClosed, madeAt, tabOf, trackOf } from '../../../data/taskBoard'
import { RowMenu } from '../common'
import { fmtTime } from '../format'
import { AiBadge, CheckBadge, MinutesChip, TrackLabel, TrackTile } from './badges'

type MenuItem = { text: string; onClick: () => void; danger?: boolean; disabled?: boolean }

const LEVELS = ['초급', '중급', '고급']

export function TaskCard({ task: t, menu }: { task: ConsoleTaskSummary; menu: MenuItem[] }) {
  const track = trackOf(t)
  const tab = tabOf(t)
  const check = checkBadge(t)
  const at = madeAt(t)
  const closed = isClosed(t)
  return (
    <Spotlight
      className={cx(
        'group relative flex w-full flex-col rounded-2xl border bg-panel p-5 shadow-sm transition-[transform,box-shadow,border-color] duration-150 ease-out hover:-translate-y-1 hover:shadow-md',
        tab === 'draft' ? 'border-caution/30' : 'border-line hover:border-line-strong',
        closed && 'opacity-75',
      )}
    >
      {/* 검수 전 카드는 위쪽에 주의색 띠 */}
      {tab === 'draft' && <span aria-hidden className="absolute inset-x-5 top-0 h-0.5 rounded-b-full bg-caution/70" />}
      <div className="relative z-10 flex items-start gap-3">
        <TrackTile track={track} category={t.category} />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 pt-0.5">
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
        <div className="relative z-20 -mt-1 -mr-2">
          <RowMenu label={`${t.title} 메뉴`} items={menu} />
        </div>
      </div>

      <Link to={`/console/tasks/${encodeURIComponent(t.id)}`} className="mt-4 block rounded-sm outline-offset-4 after:absolute after:inset-0 after:z-10 after:rounded-2xl after:content-['']">
        <h3 className="relative line-clamp-2 text-[17px] leading-6 font-bold tracking-[-0.01em] break-keep text-text group-hover:text-brand">{t.title}</h3>
      </Link>
      <p className="relative mt-1.5 line-clamp-2 min-h-11 text-[14px] leading-[22px] break-keep text-text-muted">
        {t.summary || <span className="text-text-faint">한 줄 소개가 없어요</span>}
      </p>

      <div className="relative mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <TrackLabel track={track} />
        {t.difficulty && LEVELS.includes(t.difficulty) && <LevelPips level={t.difficulty as Level} />}
        <MinutesChip minutes={t.minutes} />
      </div>

      <div className="relative mt-4 flex items-center gap-2 border-t border-line pt-3 text-[12px] text-text-muted">
        <span className="tnum font-mono">{at ? fmtTime(at) : '-'}</span>
        <span className="truncate font-mono text-text-faint">{t.id}</span>
        <ArrowUpRight size={16} aria-hidden className="ml-auto shrink-0 text-text-faint transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-brand" />
      </div>
    </Spotlight>
  )
}

/** 불러오는 동안 카드 자리 */
export function TaskCardSkeleton() {
  return (
    <li aria-hidden className="flex animate-pulse flex-col gap-3 rounded-2xl border border-line bg-panel p-5 shadow-sm">
      <div className="flex gap-3">
        <span className="size-11 rounded-xl bg-panel-raised" />
        <span className="mt-1 h-5 w-20 rounded-full bg-panel-raised" />
      </div>
      <span className="mt-2 h-5 w-3/4 rounded bg-panel-raised" />
      <span className="h-4 w-full rounded bg-panel-raised" />
      <span className="h-4 w-1/2 rounded bg-panel-raised" />
      <span className="mt-3 h-4 w-1/3 rounded bg-panel-raised" />
    </li>
  )
}
