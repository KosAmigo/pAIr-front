import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { setAuthHeaders } from '../api'
import { AuthContext, type AuthApi, type AuthUser } from './auth'
import { authApi, ensureAuthSessionKey, logoutSession, newAuthSession, readAuthSession, saveAuthSession, subscribeAuthSession, type AuthSession, AuthRequestError, AuthSessionExpiredError } from './authApi'
import { accountMutation } from './account'
import { CreditProvider } from '../data/CreditProvider'
import { companyApi } from '../company/companyApi'
import { needsOnboarding } from '../company/policy'

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
    const sync = () => {
      const current = readAuthSession()
      sessionRef.current = current
      setSession(current)
    }
    const unsubscribe = subscribeAuthSession(sync)
    sync()
    return unsubscribe
  }, [])

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
    await logoutSession()
  }, [])

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

  const clearAccountSession = useCallback((expected: AuthSession) => {
    const current = sessionRef.current
    if (current &&
        (expected.sessionKey ? current.sessionKey === expected.sessionKey : current.token === expected.token)) {
      set(null)
    }
  }, [set])

  const api = useMemo<AuthApi>(
    () => ({
      user: session?.user ?? null,
      signedIn: session != null,
      loading,
      logout,
      getProfile,
      refreshProfile: async () => {
        const expected = sessionRef.current
        if (!expected) throw new AuthSessionExpiredError()
        const user = await getProfile()
        const current = sessionRef.current
        if (!current || (expected.sessionKey ? current.sessionKey !== expected.sessionKey : current.token !== expected.token)) throw new AuthSessionExpiredError()
        set({ ...current, user })
        return user
      },
      acceptInvitation: async (inviteToken, name, password, code) => {
        const response = await companyApi.accept(inviteToken, name, password, code)
        set(newAuthSession(response))
        return response.user
      },
      updateName: async (name) => {
        const expected = sessionRef.current
        if (!expected) throw new AuthSessionExpiredError()
        let user: AuthUser
        try {
          user = await authApi.updateName(expected.token, name.trim())
        } catch (error) {
          if (error instanceof AuthRequestError && error.status === 401) {
            clearToken(expected.token)
            throw new AuthSessionExpiredError()
          }
          throw error
        }
        // 요청 중 토큰이 갱신됐을 수 있으므로 지금 세션에 회원 정보만 바꿔 넣는다
        const current = sessionRef.current
        if (current && (expected.sessionKey ? current.sessionKey === expected.sessionKey : current.token === expected.token)) set({ ...current, user })
        return user
      },
      changePassword: async (currentPassword, newPassword) => {
        if (!token) throw new AuthSessionExpiredError()
        const expected = await ensureAuthSessionKey()
        if (!expected || (session?.sessionKey ? expected.sessionKey !== session.sessionKey : expected.token !== token)) throw new AuthSessionExpiredError()
        await accountMutation(expected.token, (accessToken) => authApi.changePassword(accessToken, currentPassword, newPassword), () => clearAccountSession(expected))
      },
      withdraw: async (currentPassword) => {
        if (!token) throw new AuthSessionExpiredError()
        const expected = await ensureAuthSessionKey()
        if (!expected || (session?.sessionKey ? expected.sessionKey !== session.sessionKey : expected.token !== token)) throw new AuthSessionExpiredError()
        await accountMutation(expected.token, (accessToken) => authApi.withdraw(accessToken, currentPassword), () => clearAccountSession(expected))
      },
      login: async (email, password) => {
        const response = await authApi.login(email, password)
        set(newAuthSession(response))
        return response.user
      },
      requestEmailVerification: (email) => authApi.requestEmailVerification(email),
      signup: async (name, email, password, code) => {
        const response = await authApi.signup(name, email, password, code)
        set(newAuthSession(response))
        return response.user
      },
    }),
    [session, loading, logout, set, token, clearAccountSession, getProfile, clearToken],
  )

  return (
    <AuthContext.Provider value={api}>
      <CreditProvider token={session && !needsOnboarding(session.user) ? session.token : null}>{children}</CreditProvider>
    </AuthContext.Provider>
  )
}
