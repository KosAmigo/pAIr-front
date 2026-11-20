import { call } from '../api.ts'
import { readAuthSession } from '../auth/authApi.ts'
import { createContext, useContext, useSyncExternalStore } from 'react'

export type CreditState =
  | { status: 'loading' }
  | { status: 'ready'; balance: number }
  | { status: 'error' }

export async function fetchCredits(): Promise<number> {
  const data = await call<unknown>('GET', '/api/credits')
  if (typeof data !== 'object' || data === null || !('balance' in data) ||
      typeof data.balance !== 'number' || !Number.isFinite(data.balance) || data.balance < 0) {
    throw new Error('크레딧 잔액 응답이 올바르지 않습니다.')
  }
  return data.balance
}

export function createCreditStore(
  token: string,
  load: () => Promise<number> = fetchCredits,
  currentToken: () => string | undefined = () => readAuthSession()?.token,
) {
  let state: CreditState = { status: 'loading' }
  let request = 0
  const listeners = new Set<() => void>()
  const publish = (next: CreditState) => {
    state = next
    listeners.forEach((listener) => listener())
  }

  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    refresh: async () => {
      if (currentToken() !== token) return
      const id = ++request
      publish({ status: 'loading' })
      try {
        const balance = await load()
        if (id === request && currentToken() === token) publish({ status: 'ready', balance })
      } catch (error) {
        if (id === request && currentToken() === token) {
          console.error('크레딧 잔액 조회 실패:', error)
          publish({ status: 'error' })
        }
      }
    },
    cancel: () => { request++ },
  }
}

type CreditStore = ReturnType<typeof createCreditStore>
export const CreditContext = createContext<CreditStore | null>(null)

const emptyState: CreditState = { status: 'loading' }
const subscribeEmpty = () => () => {}
const getEmptySnapshot = () => emptyState
const refreshEmpty = async () => {}

export function useCredits(): { state: CreditState; refresh: () => Promise<void> } {
  const store = useContext(CreditContext)
  const state = useSyncExternalStore(
    store?.subscribe ?? subscribeEmpty,
    store?.getSnapshot ?? getEmptySnapshot,
  )
  return { state, refresh: store?.refresh ?? refreshEmpty }
}
