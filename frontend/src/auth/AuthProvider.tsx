import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { setAuthHeaders } from '../api'
import { AuthContext, type AuthApi } from './auth'
import { authApi, AuthRequestError, logoutAuthSession, readAuthSession, saveAuthSession, startAuthSession, subscribeAuthSession } from './authApi'
import { CreditProvider } from '../data/CreditProvider'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState(readAuthSession)
  const [loading, setLoading] = useState(session !== null)
  const [notice, setNotice] = useState<string | null>(null)
  const token = session?.token
  setAuthHeaders(session?.user ?? null)

  useEffect(() => {
    const unsubscribe = subscribeAuthSession((next, expired) => {
      setSession(next)
      if (expired) setNotice('로그인 세션이 만료되었습니다. 다시 로그인해 주세요.')
      else if (next) setNotice(null)
    })
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'pair.auth' || event.key === null) {
        const next = readAuthSession()
        setSession(next)
        if (next) setNotice(null)
        else if (event.oldValue) setNotice('로그인 세션이 종료되었습니다. 다시 로그인해 주세요.')
      }
    }
    window.addEventListener('storage', onStorage)
    return () => {
      unsubscribe()
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  useEffect(() => {
    const initial = readAuthSession()
    if (!initial) return
    let active = true
    authApi.me()
      .then((user) => {
        if (!active) return
        const current = readAuthSession()
        if (current && current.sessionId === initial.sessionId && current.user.id === initial.user.id) {
          saveAuthSession({ ...current, user })
        }
      })
      .catch((error: unknown) => {
        if (!active) return
        if (error instanceof AuthRequestError && error.status === 401) {
          const current = readAuthSession()
          if (current && current.sessionId === initial.sessionId) saveAuthSession(null, true)
        } else {
          setNotice(error instanceof Error ? error.message : '로그인 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.')
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  const logout = useCallback(async () => {
    await logoutAuthSession()
    setNotice(null)
  }, [])

  const api = useMemo<AuthApi>(() => ({
    user: session?.user ?? null,
    signedIn: session != null,
    loading,
    logout,
    login: async (email, password) => {
      const response = await authApi.login(email, password)
      startAuthSession(response)
      return response.user
    },
    requestEmailVerification: (email) => authApi.requestEmailVerification(email),
    signup: async (name, email, password, code) => {
      const response = await authApi.signup(name, email, password, code)
      startAuthSession(response)
      return response.user
    },
  }), [session, loading, logout])

  return (
    <AuthContext.Provider value={api}>
      <CreditProvider token={token ?? null}>
        {notice && (
          <div role="alert" className="fixed top-3 right-3 z-50 max-w-sm rounded-md border border-alert/40 bg-panel px-4 py-3 text-[14px] text-alert shadow-md">
            {notice} {!session && <a className="font-semibold underline" href="/login">로그인</a>}
            <button type="button" className="ml-3 font-semibold underline" onClick={() => setNotice(null)}>닫기</button>
          </div>
        )}
        {children}
      </CreditProvider>
    </AuthContext.Provider>
  )
}
