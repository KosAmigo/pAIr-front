// 콘솔 목록 화면 위의 "단계 카드" 탭 (DESIGN.md §7-9, 2026-11-19 개편).
// 카드 하나가 탭 하나다. 큰 숫자(CountUp) + 이름 + 한 줄 설명, 고른 카드로 그라데이션 테두리가 미끄러져 온다.
import { motion } from 'motion/react'
import type { LucideIcon } from 'lucide-react'
import { cx } from '../../components/cx'
import { CountUp, Glass } from '../../components/fx'
import { springs } from '../../lib/motion'

export type StatTab<T extends string> = {
  value: T
  label: string
  hint: string
  icon: LucideIcon
  n: number
  /** 숫자가 있을 때 눈길을 끌어야 하는 탭 (진행 중 = alert, 검수 대기 = caution) */
  tone?: 'alert' | 'caution'
}

const TONE = {
  alert: { icon: 'bg-alert/10 text-alert', num: 'text-alert', pulse: true },
  caution: { icon: 'bg-caution/10 text-caution', num: 'text-caution', pulse: false },
}

export function StatTabs<T extends string>({
  id,
  label,
  tabs,
  value,
  onChange,
}: {
  /** 같은 화면에 여러 개를 쓸 때 겹치지 않게 (layoutId) */
  id: string
  label: string
  tabs: StatTab<T>[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div role="tablist" aria-label={label} className="grid flex-1 gap-3" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
      {tabs.map((t) => {
        const on = t.value === value
        const tone = t.tone && t.n > 0 ? TONE[t.tone] : null
        return (
          <button key={t.value} role="tab" type="button" aria-selected={on} onClick={() => onChange(t.value)} className="relative text-left">
            {on && <motion.span layoutId={`${id}-ring`} transition={springs.snappy} className="bg-brand-gradient absolute -inset-[2px] rounded-[14px]" aria-hidden />}
            <Glass className={cx('relative flex items-center gap-4 rounded-xl px-5 py-4 transition-colors', on ? 'bg-white/95!' : 'hover:bg-white/80!')}>
              <span className={cx('inline-flex size-11 items-center justify-center rounded-lg', tone ? tone.icon : on ? 'bg-brand-dim text-brand' : 'bg-panel-raised text-text-muted')}>
                <t.icon size={22} aria-hidden className={tone?.pulse ? 'rec-pulse' : undefined} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-text">{t.label}</span>
                <span className="block truncate text-[13px] text-text-muted">{t.hint}</span>
              </span>
              <CountUp value={t.n} className={cx('font-mono text-[34px] leading-10 font-semibold', tone ? tone.num : 'text-text')} />
            </Glass>
          </button>
        )
      })}
    </div>
  )
}
