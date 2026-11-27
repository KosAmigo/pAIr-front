// 과제 만들기 단계 표시: ① 아이디어 → ② 확인 → ③ 생성 → ④ 검수.
// 지난 단계는 체크, 지금 단계는 브랜드 그라데이션 원, 사이 선은 지난 만큼 차오른다(scaleX).
import { Check } from 'lucide-react'
import { motion } from 'motion/react'
import { cx } from '../../../components/cx'
import { duration, easing, springs } from '../../../lib/motion'

const FLOW: readonly string[] = ['아이디어', '확인', '생성', '검수']

export function FlowSteps({ at, names = FLOW }: { at: number; names?: readonly string[] }) {
  return (
    <ol aria-label={`단계 ${at + 1} / ${names.length}: ${names[at]}`} className="flex items-center">
      {names.map((name, i) => {
        const done = i < at
        const on = i === at
        return (
          <li key={name} className="flex items-center" aria-current={on ? 'step' : undefined}>
            {i > 0 && (
              <span aria-hidden className="relative mx-2 h-0.5 w-6 overflow-hidden rounded-full bg-line sm:w-12">
                <motion.span
                  className="bg-brand-gradient absolute inset-0 origin-left"
                  initial={false}
                  animate={{ scaleX: i <= at ? 1 : 0 }}
                  transition={{ duration: duration.normal, ease: easing.standard }}
                />
              </span>
            )}
            <span className="flex items-center gap-2">
              <motion.span
                aria-hidden
                initial={false}
                animate={{ scale: on ? 1.08 : 1 }}
                transition={springs.snappy}
                className={cx(
                  'inline-flex size-8 items-center justify-center rounded-full text-[14px] font-bold',
                  done && 'bg-brand-dim text-brand',
                  on && 'bg-brand-gradient text-on-accent shadow-[0_6px_18px_-6px_rgb(108_71_255/0.7)]',
                  !done && !on && 'border border-line-strong bg-panel text-text-faint',
                )}
              >
                {done ? <Check size={15} strokeWidth={3} /> : <span className="tnum font-mono">{i + 1}</span>}
              </motion.span>
              <span className={cx('hidden text-[14px] sm:inline', on ? 'font-bold text-text' : done ? 'font-semibold text-text-muted' : 'font-medium text-text-faint')}>{name}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
