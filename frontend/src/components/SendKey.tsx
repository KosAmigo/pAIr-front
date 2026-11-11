import { CornerDownLeft } from 'lucide-react'
import { cx } from './ui'

// DESIGN.md §6.8 AI Chat 전송 버튼: 키보드 엔터 키처럼 보이는 키캡 모양.
// 보낼 내용이 있으면 signal 색으로 켜지고, 없거나 막혀 있으면 흐리게 둔다.
export function SendKey({ ready, disabled, onClick }: { ready: boolean; disabled?: boolean; onClick: () => void }) {
  const on = ready && !disabled
  return (
    <button
      type="button"
      aria-label="전송"
      title="전송 (Ctrl + Enter)"
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'inline-flex h-8 min-w-11 items-center justify-center rounded-sm border border-b-[3px] px-2 transition-colors duration-[120ms] active:translate-y-px active:border-b',
        on ? 'border-signal bg-signal/12 text-signal hover:bg-signal/20' : 'border-line-strong bg-panel text-text-faint',
        'disabled:cursor-not-allowed disabled:opacity-40',
      )}
    >
      <CornerDownLeft size={18} strokeWidth={2} aria-hidden />
    </button>
  )
}
