// 용도 바꾸기 토글 (검수 전 과제만). 누르면 바로 바뀌고(낙관적), 서버가 거절하면 원래대로 돌아가며 이유를 보여 준다.
// 상태 전환 규칙은 data/taskBoard.ts 의 usageReducer (테스트 있음).
import { useEffect, useReducer } from 'react'
import { motion } from 'motion/react'
import { Globe2, Loader2, Lock } from 'lucide-react'
import { cx } from '../../../components/cx'
import type { ConsoleTaskSummary, TaskUsage } from '../../../consoleApi'
import { setUsage } from '../../../data/consoleTasks'
import { usageErrorMessage, usageLock, usageReducer } from '../../../data/taskBoard'
import { springs } from '../../../lib/motion'

const OPTIONS: { value: TaskUsage; label: string; icon: typeof Lock }[] = [
  { value: 'SELF', label: '공개 문제', icon: Globe2 },
  { value: 'LIVE', label: '비공개 문제', icon: Lock },
]

export function UsageToggle({ task, onChanged }: { task: ConsoleTaskSummary; onChanged: (s: ConsoleTaskSummary) => void }) {
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

  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-2 text-[13px] font-semibold text-stage-muted">
        용도
        {st.saving && <Loader2 size={13} className="animate-spin text-stage-brand" aria-label="저장 중" />}
      </span>
      <div role="radiogroup" aria-label="용도 바꾸기" aria-disabled={!!lock || undefined} title={lock ?? undefined} className="glass-stage flex w-fit gap-1 rounded-full border border-stage-line p-1">
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
                'relative inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[14px] font-bold transition-colors disabled:cursor-not-allowed',
                on ? 'text-on-accent' : 'text-stage-muted hover:text-stage-text',
              )}
            >
              {on && (
                <motion.span
                  layoutId="usage-pill"
                  transition={springs.snappy}
                  className={cx('absolute inset-0 -z-10 rounded-full', o.value === 'LIVE' ? 'bg-stage-text' : 'bg-brand-gradient')}
                />
              )}
              <o.icon size={14} aria-hidden /> {o.label}
            </button>
          )
        })}
      </div>
      {st.error ? (
        <p role="alert" className="max-w-[300px] text-[12px] font-semibold break-keep text-stage-alert">
          {st.error}
        </p>
      ) : (
        <p className="max-w-[300px] text-[12px] break-keep text-stage-muted">
          {lock ?? (st.usage === 'LIVE' ? '실전 시험 전용이에요. 자가진단에는 절대 안 보여요.' : '공개하면 자가진단에 나와요. 바꾸려면 지금(검수 전) 바꾸세요.')}
        </p>
      )}
    </div>
  )
}
