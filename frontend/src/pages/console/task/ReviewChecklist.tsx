// 검수 체크리스트. 체크는 이 브라우저(localStorage)에만 남는다. 저장이 막혀 있어도 화면에서는 체크된다.
import { motion } from 'motion/react'
import { Check, ClipboardCheck } from 'lucide-react'
import { cx } from '../../../components/cx'
import { REVIEW_CHECKS } from '../../../data/taskBoard'
import type { useChecklist } from './useChecklist'
import { duration, easing, springs } from '../../../lib/motion'

export function ReviewChecklist({ state }: { state: ReturnType<typeof useChecklist> }) {
  const { list, toggle, saved, done } = state
  const all = done === REVIEW_CHECKS.length
  return (
    <section aria-labelledby="checklist-title" className={cx('rounded-2xl border bg-panel p-5 shadow-sm transition-colors', all ? 'border-signal/40' : 'border-line')}>
      <div className="flex items-center gap-2">
        <ClipboardCheck size={18} className={all ? 'text-signal' : 'text-brand'} aria-hidden />
        <h2 id="checklist-title" className="text-[16px] font-bold text-text">
          검수 체크리스트
        </h2>
        <span className={cx('tnum ml-auto font-mono text-[13px] font-semibold', all ? 'text-signal' : 'text-text-muted')}>
          {done} / {REVIEW_CHECKS.length}
        </span>
      </div>
      <span aria-hidden className="mt-3 block h-1.5 overflow-hidden rounded-full bg-panel-raised">
        <motion.span
          className={cx('block h-full origin-left rounded-full', all ? 'bg-signal' : 'bg-brand-gradient')}
          initial={false}
          animate={{ scaleX: done / REVIEW_CHECKS.length }}
          transition={{ duration: duration.normal, ease: easing.standard }}
        />
      </span>
      <ul className="mt-3 flex flex-col gap-1">
        {REVIEW_CHECKS.map((c) => {
          const on = !!list[c.key]
          return (
            <li key={c.key}>
              <label className={cx('flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-panel-raised', on && 'bg-signal/6')}>
                <input type="checkbox" checked={on} onChange={() => toggle(c.key)} className="peer sr-only" />
                <span
                  aria-hidden
                  className={cx(
                    'inline-flex size-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand',
                    on ? 'border-signal bg-signal text-on-accent' : 'border-line-strong bg-panel',
                  )}
                >
                  {on && (
                    <motion.span initial={{ scale: 0.3 }} animate={{ scale: 1 }} transition={springs.snappy}>
                      <Check size={13} strokeWidth={3.5} />
                    </motion.span>
                  )}
                </span>
                <span className={cx('text-[14px] font-semibold break-keep', on ? 'text-text-muted line-through decoration-signal/60' : 'text-text')}>{c.text}</span>
              </label>
            </li>
          )
        })}
      </ul>
      <p className="mt-3 text-[12px] leading-[18px] break-keep text-text-muted">
        {all ? '모두 확인했어요. 이제 공개해도 좋아요.' : '공개하기 전에 하나씩 확인하세요.'}
        {!saved && ' (이 브라우저에 저장하지 못해 새로 고치면 사라져요)'}
      </p>
    </section>
  )
}
