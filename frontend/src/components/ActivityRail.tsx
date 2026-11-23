import { Bot, Files, ListChecks, PanelBottom } from 'lucide-react'
import { TaskIcon } from './domainIcons'
import type { ComponentType } from 'react'
import { cx } from './cx'

// DESIGN.md §6.14 Activity Rail: 응시 화면 맨 왼쪽 48px 아이콘 레일 (VS Code 의 activity bar 문법).
// 위: 사이드 패널 전환(과제, 파일). 같은 아이콘을 다시 누르면 패널이 접힌다.
// 아래: 실행 결과 창, AI 채팅 창 보이기/숨기기.

export type SidePanel = 'task' | 'files' | 'questions' | null

type Item = {
  key: string
  label: string
  icon: ComponentType<{ size?: number; strokeWidth?: number; 'aria-hidden'?: boolean }>
  active: boolean
  onClick: () => void
  /** 아이콘 오른쪽 위 작은 표시 (예: 답한 문항 수) */
  badge?: string
}

function RailButton({ label, icon: Icon, active, onClick, badge }: Omit<Item, 'key'>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        'relative flex size-12 items-center justify-center transition-colors duration-[120ms]',
        active ? 'text-text' : 'text-text-faint hover:text-text',
      )}
    >
      {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-brand" aria-hidden />}
      <Icon size={22} strokeWidth={1.75} aria-hidden />
      {badge && (
        <span className="tnum absolute right-0.5 bottom-1.5 rounded-sm bg-brand px-1 font-mono text-[10px] leading-4 font-semibold text-on-accent" aria-hidden>
          {badge}
        </span>
      )}
    </button>
  )
}

export function ActivityRail({
  side,
  onSide,
  showOutput,
  onToggleOutput,
  outputLabel = '실행 결과',
  showChat,
  onToggleChat,
  questions,
}: {
  side: SidePanel
  onSide: (s: SidePanel) => void
  showOutput: boolean
  onToggleOutput: () => void
  outputLabel?: string
  showChat: boolean
  onToggleChat: () => void
  /** 문항이 있는 과제에서만 넘긴다. 문항 탭이 생긴다 */
  questions?: { answered: number; total: number }
}) {
  const pick = (s: Exclude<SidePanel, null>) => onSide(side === s ? null : s)
  return (
    <nav aria-label="응시 도구" data-tour="rail" className="flex w-12 shrink-0 flex-col border-r border-line bg-panel">
      <RailButton label={side === 'task' ? '과제 패널 접기' : '과제'} icon={TaskIcon} active={side === 'task'} onClick={() => pick('task')} />
      <RailButton label={side === 'files' ? '파일 패널 접기' : '파일 탐색기'} icon={Files} active={side === 'files'} onClick={() => pick('files')} />
      {questions && (
        <RailButton
          label={side === 'questions' ? `문항 패널 접기 (${questions.answered}/${questions.total} 답함)` : `문항 (${questions.answered}/${questions.total} 답함)`}
          icon={ListChecks}
          active={side === 'questions'}
          onClick={() => pick('questions')}
          badge={`${questions.answered}/${questions.total}`}
        />
      )}
      <div className="mt-auto">
        <RailButton label={`${outputLabel} 창 ${showOutput ? '숨기기' : '보이기'}`} icon={PanelBottom} active={showOutput} onClick={onToggleOutput} />
        <RailButton label={`AI 채팅 창 ${showChat ? '숨기기' : '보이기'}`} icon={Bot} active={showChat} onClick={onToggleChat} />
      </div>
    </nav>
  )
}
