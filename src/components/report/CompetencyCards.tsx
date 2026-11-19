import { useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ChevronDown } from 'lucide-react'
import { cx } from '../cx'
import { duration, easing } from '../../lib/motion'
import { CountUp, RevealGroup, RevealItem, Spotlight } from '../fx'

export type CompetencyCard = {
  key: string
  name: string
  score: number
  max: number
  color: string
  /** 한 줄 요약 (감점 내역 등) */
  note: ReactNode
  /** 펼치면 카드 묶음 아래에 나오는 상세 */
  detail?: ReactNode
}

/** 점수 고리: 화면에 들어오면 0에서 점수 비율까지 그려진다 */
function Gauge({ score, max, color }: { score: number; max: number; color: string }) {
  const reduce = useReducedMotion()
  const r = 30
  const ratio = Math.max(0, Math.min(1, score / max))
  return (
    <div className="relative size-[76px] shrink-0">
      <svg viewBox="0 0 76 76" className="-rotate-90" aria-hidden>
        <circle cx="38" cy="38" r={r} fill="none" stroke="var(--color-panel-raised)" strokeWidth="7" />
        <motion.circle
          cx="38"
          cy="38"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px color-mix(in srgb, ${color} 55%, transparent))` }}
          initial={reduce ? false : { pathLength: 0 }}
          whileInView={{ pathLength: ratio }}
          viewport={{ once: true }}
          transition={{ duration: duration.crawl, ease: easing.expo }}
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <CountUp value={score} className="font-mono text-[20px] leading-6 font-semibold text-text" />
        <span className="font-mono text-[11px] text-text-muted">/{max}</span>
      </span>
    </div>
  )
}

/**
 * 결과 리포트 항목별 점수 (DESIGN.md §7-4, 2026-11-19 개편): 표 대신 점수 고리 카드 3열.
 * 카드를 누르면 그 항목의 상세(감점 체크 표 등)가 카드 묶음 아래로 펼쳐진다. 한 번에 하나.
 */
export function CompetencyCards({ items, label = 'BREAKDOWN', title = '항목별 점수' }: { items: CompetencyCard[]; label?: string; title?: string }) {
  const [open, setOpen] = useState<string | null>(null)
  const sel = items.find((i) => i.key === open)
  return (
    <section className="@container col-span-12" aria-label={title}>
      <div className="mb-3 flex items-baseline gap-3">
        <span className="label">{label}</span>
        <h2 className="text-h2 font-semibold text-text">{title}</h2>
        <span className="text-[13px] text-text-muted">카드를 누르면 감점 근거가 펼쳐집니다</span>
      </div>
      <RevealGroup className="grid grid-cols-1 gap-3 @lg:grid-cols-2 @5xl:grid-cols-3">
        {items.map((it) => {
          const on = open === it.key
          return (
            <RevealItem key={it.key} className="flex">
              <Spotlight
                as="button"
                type="button"
                aria-expanded={on}
                aria-controls="competency-detail"
                onClick={() => setOpen(on ? null : it.key)}
                className={cx(
                  'flex w-full items-center gap-4 rounded-xl border bg-panel p-4 text-left shadow-sm transition-[transform,box-shadow,border-color] duration-150 hover:-translate-y-0.5 hover:shadow-md',
                  on ? 'border-brand shadow-md' : 'border-line',
                )}
              >
                <Gauge score={it.score} max={it.max} color={it.color} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-[17px] font-bold text-text">
                    <span className="size-2 rounded-full" style={{ background: it.color }} aria-hidden />
                    {it.name}
                  </p>
                  <p className="mt-1 line-clamp-2 text-[14px] leading-5 text-text-muted">{it.note}</p>
                </div>
                {it.detail && <ChevronDown size={18} className={cx('shrink-0 text-text-muted transition-transform duration-200', on && 'rotate-180 text-brand')} aria-hidden />}
              </Spotlight>
            </RevealItem>
          )
        })}
      </RevealGroup>
      <AnimatePresence mode="wait">
        {sel?.detail && (
          <motion.div
            id="competency-detail"
            key={sel.key}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: duration.normal, ease: easing.expo }}
            className="mt-3 overflow-hidden rounded-xl border border-line bg-panel shadow-sm"
          >
            <header className="flex h-11 items-center gap-2 border-b border-line px-4" style={{ boxShadow: `inset 3px 0 0 ${sel.color}` }}>
              <span className="label">DETAIL</span>
              <span className="text-[16px] font-semibold text-text">{sel.name}</span>
              <span className="tnum ml-auto font-mono text-[14px] text-text-muted">
                {sel.score} / {sel.max}
              </span>
            </header>
            {sel.detail}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
