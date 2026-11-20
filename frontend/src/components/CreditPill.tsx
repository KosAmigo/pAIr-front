import { Coins } from 'lucide-react'
import { useCredits } from '../data/credits'

export function CreditPill() {
  const { state, refresh } = useCredits()
  return (
    <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-panel/70 px-3 text-[14px] font-semibold text-text-muted">
      <Coins size={15} className="text-text-faint" aria-hidden />
      <span>크레딧</span>
      <span role="status" aria-live="polite">
        {state.status === 'loading' ? '조회 중' : state.status === 'error' ? '조회 실패' : state.balance.toLocaleString()}
      </span>
      {state.status === 'error' && (
        <button type="button" onClick={() => void refresh()} className="text-brand underline">다시 조회</button>
      )}
    </span>
  )
}
