import { call } from '../api.ts'
import { readAuthSession } from '../auth/authApi.ts'
import { createContext, useContext } from 'react'
import { createStore, type StoreApi } from 'zustand/vanilla'
import { useStore } from 'zustand'

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

type CreditStoreState = {
  state: CreditState
  refresh: () => Promise<void>
  cancel: () => void
}

export function createCreditStore(
  token: string,
  load: () => Promise<number> = fetchCredits,
  currentToken: () => string | undefined = () => readAuthSession()?.token,
) {
  let request = 0
  return createStore<CreditStoreState>((set) => ({
    state: { status: 'loading' },
    refresh: async () => {
      if (currentToken() !== token) return
      const id = ++request
      set({ state: { status: 'loading' } })
      try {
        const balance = await load()
        if (id === request && currentToken() === token) set({ state: { status: 'ready', balance } })
      } catch (error) {
        if (id === request && currentToken() === token) {
          console.error('크레딧 잔액 조회 실패:', error)
          set({ state: { status: 'error' } })
        }
      }
    },
    cancel: () => { request++ },
  }))
}

type CreditStore = StoreApi<CreditStoreState>
export const CreditContext = createContext<CreditStore | null>(null)

// 비로그인일 때도 훅 호출 순서가 같도록 빈 store 를 하나 둔다.
const emptyStore: CreditStore = createStore<CreditStoreState>(() => ({
  state: { status: 'loading' },
  refresh: async () => {},
  cancel: () => {},
}))

const selectState = (s: CreditStoreState) => s.state
const selectRefresh = (s: CreditStoreState) => s.refresh

export function useCredits(): { state: CreditState; refresh: () => Promise<void> } {
  const store = useContext(CreditContext) ?? emptyStore
  const state = useStore(store, selectState)
  const refresh = useStore(store, selectRefresh)
  return { state, refresh }
}
