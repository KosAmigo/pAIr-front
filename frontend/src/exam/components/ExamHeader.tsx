import { CircleHelp } from 'lucide-react'
import type { Task } from '../../api'
import { cx } from '../../components/cx'
import { Button, IconButton, Logo, ModeBadge } from '../../components/ui'
import { CreditPill } from '../../components/CreditPill'
import { ViolationCounter, type useAntiCheating } from '../../anti-cheating'
import type { readLiveExam } from '../../proctor/liveExam.ts'
import { fmt } from '../format'

/** 6.7 Status Bar: 과제 이름, 남은 시간, 도움말·제출 */
export function ExamHeader({
  task,
  live,
  left,
  locked,
  tone,
  model,
  antiCheating,
  setActionError,
  setTourOpen,
  setConfirm,
}: {
  task: Task
  live: ReturnType<typeof readLiveExam>
  left: number
  locked: boolean
  tone: string
  model: string
  antiCheating: ReturnType<typeof useAntiCheating>
  setActionError: (e: string | null) => void
  setTourOpen: (open: boolean) => void
  setConfirm: (open: boolean) => void
}) {
  return (

    <header className="grid h-11 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-line bg-panel px-4">
      <div className="flex min-w-0 items-center gap-3">
        <Logo />
        <span className="h-4 w-px bg-line" aria-hidden />
        <span className="truncate text-[15px] font-semibold">{task.title}</span>
        <ModeBadge mode={live ? 'live' : 'self'} />
      </div>
      <div className="flex items-baseline gap-2 px-2" data-tour="timer" aria-label={`남은 시간 ${fmt(left)}`}>
        <span className="label">{locked ? 'FOLLOW-UP' : 'REMAINING'}</span>
        <span className={cx('tnum font-mono text-[21px] leading-7 font-semibold transition-colors duration-[180ms]', tone)} role="timer">
          {left < 0 && !locked ? '-' : ''}
          {fmt(Math.abs(left))}
        </span>
      </div>
      <div className="flex items-center justify-end gap-3">
        <IconButton label="사용 안내" onClick={() => setTourOpen(true)}>
          <CircleHelp size={18} aria-hidden />
        </IconButton>
        {!live && <CreditPill />}
        {live && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void antiCheating.requestFullscreen().catch(() => setActionError('전체 화면으로 전환할 수 없습니다.'))}
            >
              전체 화면 시작
            </Button>
            <ViolationCounter count={antiCheating.count} />
          </>
        )}
        <span className="font-mono text-[12px] text-text-faint">{model}</span>
        {!locked && (
          <Button variant="primary" size="sm" data-tour="submit" onClick={() => setConfirm(true)}>
            제출
          </Button>
        )}
      </div>
    </header>
  )
}
