// 용도 바꾸기 토글 (검수 전 과제만). 누르면 바로 바뀌고(낙관적), 서버가 거절하면 원래대로 돌아가며 이유를 보여 준다.
// 상태 전환 규칙은 data/taskBoard.ts 의 usageReducer (테스트 있음).
import { useEffect, useReducer } from 'react'
import { motion } from 'motion/react'
import { Loader2, type LucideIcon } from 'lucide-react'
import { USAGE_ICON } from '../../../components/domainIcons'
import { cx } from '../../../components/cx'
import type { ConsoleTaskSummary, TaskUsage } from '../../../consoleApi'
import { setUsage } from '../../../data/consoleTasks'
import { usageErrorMessage, usageLock, usageReducer } from '../../../data/taskBoard'
import { springs } from '../../../lib/motion'

const OPTIONS: { value: TaskUsage; label: string; icon: LucideIcon }[] = [
  { value: 'SELF', label: '자가진단', icon: USAGE_ICON.SELF },
  { value: 'LIVE', label: '실전', icon: USAGE_ICON.LIVE },
]

const DESC: Record<TaskUsage, string> = {
  SELF: '올리면 누구나 자가진단에서 풀 수 있어요. 바꾸려면 지금(검수 전) 바꾸세요.',
  LIVE: '회차에만 쓰고 자가진단에는 안 보여요.',
}

export function UsageToggle({ task, onChanged, compact }: { task: ConsoleTaskSummary; onChanged: (s: ConsoleTaskSummary) => void; compact?: boolean }) {
  const [st, dispatch] = useReducer(usageReducer, { usage: task.usage, saving: false, prev: null, error: null })
  const lock = usageLock(task)
  // 다른 곳(새로 고침 등)에서 요약이 바뀌면 따라간다
  useEffect(() => dispatch({ type: 'reset', usage: task.usage }), [task.usage])

  const choose = async (usage: TaskUsage) => {
    if (lock || st.saving || usage === st.usage) return
    dispatch({ type: 'request', usage })
    try {
      const next = await setUsage(task.id, usage)
      dispatch({ type: 'success', usage: next.usage })
      onChanged(next)
    } catch (e) {
      dispatch({ type: 'fail', error: usageErrorMessage(e) })
    }
  }

  // 머리(ConsoleHero) 안에 들어가는 작은 모양: 라벨·설명 줄 없이 토글 하나(폭 200px 고정). 설명은 툴팁(title)과 화면 읽기용 글로만 둔다
  if (compact) {
    const desc = lock ?? DESC[st.usage]
    return (
      <div className="inline-flex items-center gap-2" title={desc}>
        <div role="radiogroup" aria-label="용도 바꾸기" aria-describedby="usage-desc" aria-disabled={!!lock || undefined} className="glass-stage isolate grid w-[200px] grid-cols-2 gap-0.5 rounded-full border border-stage-line p-0.5 shadow-[0_6px_20px_-10px_rgb(108_71_255/0.5)]">
          {OPTIONS.map((o) => {
            const on = st.usage === o.value
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={!!lock || st.saving}
                onClick={() => void choose(o.value)}
                className={cx('relative inline-flex h-8 items-center justify-center gap-1.5 rounded-full px-2 text-[13px] font-bold transition-colors outline-none focus-visible:ring-4 focus-visible:ring-stage-brand/30 disabled:cursor-not-allowed', on ? 'text-on-accent' : 'text-stage-muted hover:text-stage-text')}
              >
                {on && <motion.span layoutId="usage-pill-hero" transition={springs.snappy} className={cx('absolute inset-0 z-0 rounded-full shadow-[0_4px_14px_-4px_rgb(108_71_255/0.6)]', o.value === 'LIVE' ? 'bg-stage-text' : 'bg-brand-gradient')} />}
                <span className="relative z-10 inline-flex items-center gap-1.5"><o.icon size={13} aria-hidden /> {o.label}</span>
              </button>
            )
          })}
        </div>
        <span className="flex size-4 items-center justify-center">{st.saving && <Loader2 size={13} className="animate-spin text-stage-brand" aria-label="저장 중" />}</span>
        <span id="usage-desc" className="sr-only">{desc}</span>
        {st.error && (
          <p role="alert" className="max-w-[260px] text-[12px] font-semibold break-keep text-stage-alert">
            {st.error}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="flex w-[300px] flex-col gap-1.5">
      <span className="flex items-center gap-2 text-[13px] font-semibold text-stage-muted">
        용도
        {st.saving && <Loader2 size={13} className="animate-spin text-stage-brand" aria-label="저장 중" />}
      </span>
      <div role="radiogroup" aria-label="용도 바꾸기" aria-disabled={!!lock || undefined} title={lock ?? undefined} className="glass-stage isolate grid w-[216px] grid-cols-2 gap-1 rounded-full border border-stage-line p-1">
        {OPTIONS.map((o) => {
          const on = st.usage === o.value
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={!!lock || st.saving}
              onClick={() => void choose(o.value)}
              className={cx(
                'relative inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-2 text-[14px] font-bold transition-colors disabled:cursor-not-allowed',
                on ? 'text-on-accent' : 'text-stage-muted hover:text-stage-text',
              )}
            >
              {on && (
                <motion.span
                  layoutId="usage-pill"
                  transition={springs.snappy}
                  className={cx('absolute inset-0 z-0 rounded-full', o.value === 'LIVE' ? 'bg-stage-text' : 'bg-brand-gradient')}
                />
              )}
              <span className="relative z-10 inline-flex items-center gap-1.5"><o.icon size={14} aria-hidden /> {o.label}</span>
            </button>
          )
        })}
      </div>
      {/* 설명 글은 모든 문구를 같은 칸에 겹쳐 두고 지금 것만 보인다: 줄바꿈 수가 달라도 영역 높이는 가장 긴 문구 기준으로 고정 */}
      <div className="grid text-[12px] break-keep">
        {st.error && (
          <p role="alert" className="col-start-1 row-start-1 font-semibold text-stage-alert">
            {st.error}
          </p>
        )}
        {(lock ? [lock] : [DESC.SELF, DESC.LIVE]).map((t) => (
          <p key={t} className={cx('col-start-1 row-start-1 text-stage-muted', (st.error || (!lock && t !== DESC[st.usage])) && 'invisible')}>
            {t}
          </p>
        ))}
      </div>
    </div>
  )
}

/** 검수 전이 아닌 과제의 용도: 바꿀 수 없는 읽기 전용 칩(같은 알약 모양) */
export function UsageChip({ usage, lock }: { usage: TaskUsage; lock?: string | null }) {
  const o = OPTIONS.find((x) => x.value === usage)!
  return (
    <span
      title={lock ?? undefined}
      aria-label={`용도 ${o.label}`}
      className={cx('inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-bold text-on-accent shadow-[0_4px_14px_-4px_rgb(108_71_255/0.6)]', usage === 'LIVE' ? 'bg-stage-text' : 'bg-brand-gradient')}
    >
      <span className="relative z-10 inline-flex items-center gap-1.5"><o.icon size={13} aria-hidden /> {o.label}</span>
    </span>
  )
}
