// 과제 검수 머리(ConsoleHero) 안의 상태 + 용도 (옛 StatusFlow 가지 그림과 용도 토글 줄을 합친 것).
// 검수 전: [상태 칩: 검수 전] → [용도 토글]. 공개한 과제: 같은 말을 두 번 하지 않도록 '자가진단 과제' / '실전 과제' 배지 하나만.
// 들어올 때 차례로 나타나고(움직임 줄이기에서는 바로), 두 모양 모두 높이 32px 로 맞춰 오른쪽 위 줄이 움직이지 않는다.
import { motion, useReducedMotion } from 'motion/react'
import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ConsoleTaskSummary } from '../../../consoleApi'
import { usageLock } from '../../../data/taskBoard'
import { distance, duration, easing } from '../../../lib/motion'
import { TaskStatusBadge } from '../common'
import { UsageChip, UsageToggle } from './UsageToggle'

export function HeroStatus({ task, draft, onChanged, children }: { task: ConsoleTaskSummary; draft: boolean; onChanged: (s: ConsoleTaskSummary) => void; children?: ReactNode }) {
  const reduce = useReducedMotion()
  const item = {
    hidden: { opacity: 0, y: reduce ? 0 : distance.app / 2 },
    shown: { opacity: 1, y: 0, transition: { duration: reduce ? duration.fast : duration.normal, ease: easing.expo } },
  }
  if (!draft) {
    return (
      <motion.div initial="hidden" animate="shown" variants={{ shown: { transition: { staggerChildren: 0.07 } } }} className="flex min-h-[38px] flex-wrap items-center justify-end gap-x-2.5 gap-y-2" aria-label="상태와 용도" role="group">
        <motion.span variants={item} className="inline-flex">
          <UsageChip usage={task.usage} lock={usageLock(task)} />
        </motion.span>
        {children && (
          <motion.span variants={item} className="inline-flex items-center gap-2">
            {children}
          </motion.span>
        )}
      </motion.div>
    )
  }
  return (
    <motion.div initial="hidden" animate="shown" variants={{ shown: { transition: { staggerChildren: 0.07 } } }} className="flex min-h-[38px] flex-wrap items-center justify-end gap-x-2.5 gap-y-2" aria-label="상태와 용도" role="group">
      <motion.span variants={item} className="inline-flex">
        <TaskStatusBadge task={task} stage />
      </motion.span>
      <motion.span variants={item} aria-hidden className="inline-flex text-stage-faint">
        <ArrowRight size={14} />
      </motion.span>
      <motion.span variants={item} className="inline-flex">
        <UsageToggle task={task} onChanged={onChanged} compact />
      </motion.span>
      {children && (
        <motion.span variants={item} className="inline-flex items-center gap-2">
          {children}
        </motion.span>
      )}
    </motion.div>
  )
}
