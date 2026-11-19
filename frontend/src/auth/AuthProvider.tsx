import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AuthContext, type AuthApi } from './auth'
import { authApi, readAuthSession, saveAuthSession, type AuthSession, AuthRequestError } from './authApi'

// 토큰을 브라우저에 보관하고 서버에서 세션을 재검증해 로그인 상태를 앱 전체에 제공한다.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(readAuthSession)
  const [loading, setLoading] = useState(session !== null)
  const token = session?.token

  useEffect(() => {
    let active = true
    if (!token) return
    authApi
      .me(token)
      .then((user) => {
        if (!active) return
        setSession((current) => {
          if (!current || current.token !== token) return current
          const next = { ...current, user }
          saveAuthSession(next)
          return next
        })
      })
      .catch((error: unknown) => {
        if (!active) return
        if (error instanceof AuthRequestError && error.status === 401) {
          setSession((current) => {
            if (current?.token !== token) return current
            saveAuthSession(null)
            return null
          })
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [token])

  const set = useCallback((next: AuthSession | null) => {
    saveAuthSession(next)
    setSession(next)
  }, [])

  const logout = useCallback(async () => {
    const token = session?.token
    set(null)
    if (token) await authApi.logout(token)
  }, [session, set])

  const api = useMemo<AuthApi>(
    () => ({
      user: session?.user ?? null,
      signedIn: session != null,
      loading,
      logout,
      login: async (email, password) => {
        const response = await authApi.login(email, password)
        set(response)
        return response.user
      },
      signup: async (name, email, password) => {
        const response = await authApi.signup(name, email, password)
        set(response)
        return response.user
      },
    }),
    [session, loading, logout, set],
  )

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>
}
