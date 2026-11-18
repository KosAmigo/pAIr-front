// 콘솔 상세 화면 머리 (DESIGN.md §7-9, 2026-11-19 개편): 회차·과제·회사·응시자 상세가 같은 틀을 쓴다.
// 다크 무대(안쪽 무대) 카드 = 왼쪽 배지·제목·메타 + 오른쪽 큰 숫자 칸들(CountUp). 아래에 알약 탭(PillTabs).
import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { cx } from '../../components/cx'
import { CountUp, Reveal, StageSection } from '../../components/fx'
import { springs } from '../../lib/motion'

export type HeroStat = { label: string; value: number; unit?: string; tone?: 'caution' | 'alert' | 'signal' }

const TONE = { caution: 'text-stage-caution', alert: 'text-stage-alert', signal: 'text-stage-signal' }

export function ConsoleHero({
  badge,
  title,
  meta,
  stats,
  actions,
  label,
}: {
  badge?: ReactNode
  title: ReactNode
  meta?: ReactNode
  stats?: HeroStat[]
  actions?: ReactNode
  label: string
}) {
  return (
    <StageSection aria-label={label}>
      <div className="flex flex-wrap items-center gap-x-10 gap-y-6 px-8 py-7">
        <Reveal className="min-w-0 flex-1">
          {badge && <div className="mb-2 flex items-center gap-2">{badge}</div>}
          <h1 className="truncate text-[28px] leading-9 font-bold tracking-[-0.02em] text-stage-text">{title}</h1>
          {meta && <div className="tnum mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[13px] text-stage-muted">{meta}</div>}
        </Reveal>
        {stats && stats.length > 0 && (
          <dl className="flex gap-8">
            {stats.map((st) => (
              <div key={st.label} className="flex flex-col">
                <dt className="label text-stage-muted">{st.label}</dt>
                <dd className="flex items-baseline gap-1">
                  <CountUp
                    value={st.value}
                    className={cx('font-mono text-[34px] leading-10 font-semibold', st.tone && st.value > 0 ? TONE[st.tone] : 'text-stage-text')}
                  />
                  {st.unit && <span className="text-[13px] text-stage-muted">{st.unit}</span>}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </StageSection>
  )
}

/** 다크 무대 위 메타 구분선 */
export function HeroSep() {
  return <span className="inline-block h-3 w-px shrink-0 self-center bg-stage-line-strong" aria-hidden />
}

/** 알약 탭: 유리 알약 안에서 고른 칸 뒤로 그라데이션 알약이 미끄러진다. disabled 칸은 흐리고 누를 수 없다 */
export function PillTabs<T extends string>({
  id,
  label,
  tabs,
  value,
  onChange,
}: {
  id: string
  label: string
  tabs: { value: T; label: ReactNode; disabled?: boolean; hint?: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div role="tablist" aria-label={label} className="glass flex w-fit gap-1 rounded-full p-1.5">
      {tabs.map((t) => {
        const on = t.value === value
        return (
          <button
            key={t.value}
            role="tab"
            type="button"
            aria-selected={on}
            aria-disabled={t.disabled || undefined}
            title={t.hint}
            onClick={() => !t.disabled && onChange(t.value)}
            className={cx(
              'relative inline-flex h-10 items-center gap-2 rounded-full px-5 text-[15px] font-semibold transition-colors',
              on ? 'text-on-accent' : t.disabled ? 'cursor-not-allowed text-text-faint' : 'text-text-muted hover:text-text',
            )}
          >
            {on && <motion.span layoutId={`${id}-pill`} transition={springs.snappy} className="bg-brand-gradient absolute inset-0 -z-10 rounded-full shadow-[0_8px_24px_-8px_rgb(108_71_255/0.6)]" />}
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
