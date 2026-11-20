import { useEffect, useMemo, type ReactNode } from 'react'
import { createCreditStore, CreditContext } from './credits'

export function CreditProvider({ token, children }: { token: string | null; children: ReactNode }) {
  const store = useMemo(() => token ? createCreditStore(token) : null, [token])
  useEffect(() => {
    if (!store) return
    void store.refresh()
    return store.cancel
  }, [store])
  return <CreditContext.Provider value={store}>{children}</CreditContext.Provider>
}
