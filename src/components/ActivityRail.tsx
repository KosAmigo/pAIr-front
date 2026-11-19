import { Bot, ClipboardList, Files, PanelBottom } from 'lucide-react'
import type { ComponentType } from 'react'
import { cx } from './cx'

// DESIGN.md §6.14 Activity Rail: 응시 화면 맨 왼쪽 48px 아이콘 레일 (VS Code 의 activity bar 문법).
// 위: 사이드 패널 전환(과제, 파일). 같은 아이콘을 다시 누르면 패널이 접힌다.
// 아래: 실행 결과 창, AI 채팅 창 보이기/숨기기.

export type SidePanel = 'task' | 'files' | null

type Item = { key: string; label: string; icon: ComponentType<{ size?: number; strokeWidth?: number; 'aria-hidden'?: boolean }>; active: boolean; onClick: () => void }

function RailButton({ label, icon: Icon, active, onClick }: Omit<Item, 'key'>) {
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
}: {
  side: SidePanel
  onSide: (s: SidePanel) => void
  showOutput: boolean
  onToggleOutput: () => void
  outputLabel?: string
  showChat: boolean
  onToggleChat: () => void
}) {
  const pick = (s: Exclude<SidePanel, null>) => onSide(side === s ? null : s)
  return (
    <nav aria-label="응시 도구" className="flex w-12 shrink-0 flex-col border-r border-line bg-panel">
      <RailButton label={side === 'task' ? '과제 패널 접기' : '과제'} icon={ClipboardList} active={side === 'task'} onClick={() => pick('task')} />
      <RailButton label={side === 'files' ? '파일 패널 접기' : '파일 탐색기'} icon={Files} active={side === 'files'} onClick={() => pick('files')} />
      <div className="mt-auto">
        <RailButton label={`${outputLabel} 창 ${showOutput ? '숨기기' : '보이기'}`} icon={PanelBottom} active={showOutput} onClick={onToggleOutput} />
        <RailButton label={`AI 채팅 창 ${showChat ? '숨기기' : '보이기'}`} icon={Bot} active={showChat} onClick={onToggleChat} />
      </div>
    </nav>
  )
}
