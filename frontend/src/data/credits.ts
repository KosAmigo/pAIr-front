// 크레딧 목업 (기획_결정사항 §3, 테이블 credit_ledger). 자가진단만 쓴다(실전 응시는 크레딧을 쓰지 않는다).
// 쓰는 양은 설정값이다: 가입 30, 응시 시작 10(채점 1회 포함), 롤백 5, AI 채팅 한 턴 1.
// 응시 중 바닥나면 AI 채팅만 막는다. 편집과 제출은 되고, 채점은 시작 때 이미 냈으므로 항상 된다.
// 새로 고치면 처음 잔액으로 돌아간다.
import { useSyncExternalStore } from 'react'

export const CREDIT_COST = { SIGNUP: 30, ATTEMPT_START: 10, ROLLBACK: 5, CHAT_TURN: 1 } as const
export type CreditReason = 'ATTEMPT_START' | 'ROLLBACK' | 'CHAT_TURN'

let balance = 42
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
export const useCredits = () => useSyncExternalStore(subscribe, () => balance)

/** 차감. 잔액이 모자라면 빼지 않고 false (원장의 balance_after >= 0 검사와 같은 규칙) */
export function spendCredits(reason: CreditReason): boolean {
  const cost = CREDIT_COST[reason]
  if (balance < cost) return false
  balance -= cost
  emit()
  return true
}

/** 목업 확인용: 잔액을 바꾼다 (테스트 결제는 백엔드와 함께 붙인다) */
export function setCreditsForDemo(n: number) {
  balance = Math.max(0, n)
  emit()
}
