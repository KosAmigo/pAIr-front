// 목업 로그인 (DESIGN.md §7-8). 백엔드 인증이 붙기 전까지 브라우저 안에서만 동작한다.
// 로그인 상태는 이 브라우저의 localStorage 에만 남는다 (개발용 편의).
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { ACCOUNTS, AuthContext, MOCK_AUTO_LOGIN, MOCK_PASSWORD, type AuthApi, type AuthUser } from './auth'

const KEY = 'pair.auth'

function load(): AuthUser | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch {
    return null
  }
}
function save(u: AuthUser | null) {
  try {
    if (u) localStorage.setItem(KEY, JSON.stringify(u))
    else localStorage.removeItem(KEY)
  } catch {
    // 저장 못 해도 이번 화면에서는 로그인 상태가 유지된다
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(load)

  const set = useCallback((u: AuthUser | null) => {
    save(u)
    setUser(u)
  }, [])

  const api = useMemo<AuthApi>(
    () => ({
      user: user ?? (MOCK_AUTO_LOGIN ? ACCOUNTS[0] : null),
      signedIn: user != null,
      login: (email, password) => {
        const found = ACCOUNTS.find((a) => a.email === email.trim().toLowerCase())
        if (!found || password !== MOCK_PASSWORD) return null
        set(found)
        return found
      },
      signup: (name, email, password) => {
        const e = email.trim().toLowerCase()
        if (ACCOUNTS.some((a) => a.email === e)) return { error: '이미 가입된 이메일입니다' }
        if (password.length < 8) return { error: '비밀번호는 8자 이상이어야 합니다' }
        const u: AuthUser = { id: 100 + Math.floor(Math.random() * 900), email: e, name: name.trim(), role: 'USER' }
        set(u)
        return { user: u }
      },
      logout: () => set(null),
      switchRole: (role) => {
        const base = ACCOUNTS.find((a) => a.role === role)!
        set(base)
      },
    }),
    [user, set],
  )

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>
}

