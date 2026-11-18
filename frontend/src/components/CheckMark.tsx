import { AnimatePresence, motion } from 'motion/react'
import { Check } from 'lucide-react'
import { cx } from './cx'
import { springs } from '../lib/motion'

/** 체크 상자 겉모양 (시험 입장 동의, 회원가입 약관). 켜지면 브랜드 그라데이션으로 채워지고 체크가 튀어나온다.
 *  진짜 입력은 옆의 sr-only checkbox 가 맡고, 이건 aria-hidden 그림이다. */
export function CheckMark({ on, className }: { on: boolean; className?: string }) {
  return (
    <span
      className={cx(
        'flex size-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors duration-150',
        on ? 'bg-brand-gradient border-transparent' : 'border-line-strong bg-panel',
        className,
      )}
      aria-hidden
    >
      <AnimatePresence>
        {on && (
          <motion.span key="c" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={springs.snappy} className="text-on-accent">
            <Check size={16} strokeWidth={3} />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  )
}
