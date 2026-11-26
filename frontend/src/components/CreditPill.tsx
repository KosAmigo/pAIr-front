import { Coins } from 'lucide-react'
import { useAuth } from '../auth/auth'
import { useCredits } from '../data/credits'

/** 크레딧 잔액. 관리자는 크레딧 제한 없이 쓰므로(서버가 검사·차감하지 않음) 보여 주지 않는다 */
export function CreditPill() {
  const { user } = useAuth()
  const { state, refresh } = useCredits()
  if (user?.role === 'ADMIN') return null
  return (
    <span className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-panel/70 px-2.5 text-[14px] font-semibold text-text-muted sm:px-3">
      <Coins size={15} className="text-text-faint" aria-hidden />
      <span className="sr-only sm:not-sr-only">크레딧</span>
      <span role="status" aria-live="polite">
        {state.status === 'loading' ? '조회 중' : state.status === 'error' ? '조회 실패' : state.balance.toLocaleString()}
      </span>
      {state.status === 'error' && (
        <button type="button" onClick={() => void refresh()} className="text-brand underline">다시 조회</button>
      )}
    </span>
  )
}
