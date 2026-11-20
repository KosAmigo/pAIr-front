import { cx } from '../cx'
import type { TaskGroup } from '../../lib/reviewTree'

/** 왼쪽 과제별 트리 레일: 과제 카드(갈래 수, 최고점, 점수 막대) */
export function TaskRail({ groups, selected, onSelect }: { groups: TaskGroup[]; selected: string | null; onSelect: (taskId: string) => void }) {
  return (
    <nav aria-label="과제별 트리" className="flex flex-col gap-2">
      <p className="label px-1">과제별 트리</p>
      {groups.map((g) => {
        const on = g.taskId === selected
        return (
          <button
            key={g.taskId}
            type="button"
            aria-current={on ? 'true' : undefined}
            onClick={() => onSelect(g.taskId)}
            className={cx(
              'rounded-xl border bg-panel px-3.5 py-3 text-left transition-[border-color,box-shadow] duration-150',
              on ? 'border-brand shadow-[0_0_0_3px_rgb(108_71_255/0.15)]' : 'border-line hover:border-line-strong',
            )}
          >
            <h3 className="text-[15px] leading-5 font-bold text-text">{g.title}</h3>
            <div className="mt-1.5 flex items-end gap-2.5 text-[12px] text-text-muted">
              <span>갈래 {g.count}개</span>
              <span>
                최고 <b className={cx('tnum font-mono', g.best != null && g.best >= 80 ? 'text-signal' : 'text-text')}>{g.best ?? '–'}</b>
              </span>
              <span className="ml-auto flex h-5 items-end gap-0.5" aria-hidden>
                {g.scores.map((s, i) => (
                  <i key={i} className="w-[5px] rounded-sm bg-brand/70" style={{ height: `${Math.max(4, Math.round((s / 100) * 20))}px` }} />
                ))}
              </span>
            </div>
          </button>
        )
      })}
    </nav>
  )
}
