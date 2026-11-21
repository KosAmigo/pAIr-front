import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { setAuthHeaders } from '../api'
import { AuthContext, type AuthApi } from './auth'
import { authApi, readAuthSession, saveAuthSession, type AuthSession, AuthRequestError, AuthSessionExpiredError } from './authApi'
import { accountMutation } from './account'
import { CreditProvider } from '../data/CreditProvider'

// 토큰을 브라우저에 보관하고 서버에서 세션을 재검증해 로그인 상태를 앱 전체에 제공한다.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(readAuthSession)
  const sessionRef = useRef(session)
  const [loading, setLoading] = useState(session !== null)
  const token = session?.token
  // 백엔드가 헤더 방식(pair.auth.mode=header)일 때 쓰는 X-Pair-* 헤더도 함께 맞춘다. 렌더 중에 넣어야 자식 화면 첫 요청부터 실린다
  setAuthHeaders(session?.user ?? null)

  const set = useCallback((next: AuthSession | null) => {
    saveAuthSession(next)
    sessionRef.current = next
    setSession(next)
  }, [])

  const clearToken = useCallback((token: string) => {
    if (sessionRef.current?.token === token) set(null)
  }, [set])

  useEffect(() => {
    let active = true
    if (!token) return
    authApi
      .me(token)
      .then((user) => {
        if (!active) return
        const current = sessionRef.current
        if (current?.token === token) set({ ...current, user })
      })
      .catch((error: unknown) => {
        if (!active) return
        if (error instanceof AuthRequestError && error.status === 401) {
          clearToken(token)
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [token, set, clearToken])

  const logout = useCallback(async () => {
    const token = session?.token
    set(null)
    if (token) await authApi.logout(token)
  }, [session, set])

  const getProfile = useCallback(async () => {
    if (!token) throw new AuthSessionExpiredError()
    try {
      return await authApi.me(token)
    } catch (error) {
      if (error instanceof AuthRequestError && error.status === 401) {
        clearToken(token)
        throw new AuthSessionExpiredError()
      }
      throw error
    }
  }, [token, clearToken])

  const api = useMemo<AuthApi>(
    () => ({
      user: session?.user ?? null,
      signedIn: session != null,
      loading,
      logout,
      getProfile,
      changePassword: async (currentPassword, newPassword) => {
        if (!token) throw new AuthSessionExpiredError()
        await accountMutation(token, () => authApi.changePassword(token, currentPassword, newPassword), () => clearToken(token))
      },
      withdraw: async (currentPassword) => {
        if (!token) throw new AuthSessionExpiredError()
        await accountMutation(token, () => authApi.withdraw(token, currentPassword), () => clearToken(token))
      },
      login: async (email, password) => {
        const response = await authApi.login(email, password)
        set(response)
        return response.user
      },
      requestEmailVerification: (email) => authApi.requestEmailVerification(email),
      signup: async (name, email, password, code) => {
        const response = await authApi.signup(name, email, password, code)
        set(response)
        return response.user
      },
    }),
    [session, loading, logout, set, token, clearToken, getProfile],
  )

  return (
    <AuthContext.Provider value={api}>
      <CreditProvider token={token ?? null}>{children}</CreditProvider>
    </AuthContext.Provider>
  )
}
