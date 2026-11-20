// 콘솔 목록 화면 위의 "단계 카드" 탭 (DESIGN.md §7-9, 2026-11-19 개편).
// 카드 하나가 탭 하나다. 큰 숫자(CountUp) + 이름 + 한 줄 설명, 고른 카드로 그라데이션 테두리가 미끄러져 온다.
import type { LucideIcon } from 'lucide-react'
import { cx } from '../../components/cx'
import { CountUp, Glass } from '../../components/fx'

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
  label,
  tabs,
  value,
  onChange,
}: {
  /** 예전 슬라이딩 테두리에 쓰던 값. 호출하는 쪽을 그대로 두려고 남겨 둔다 */
  id?: string
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
            <Glass className={cx('relative flex items-center gap-4 rounded-xl px-5 py-4 transition-colors', on ? 'bg-white/95! ring-2 ring-brand shadow-[0_6px_24px_-8px_color-mix(in_srgb,var(--color-brand)_55%,transparent)]' : 'hover:bg-white/80!')}>
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
