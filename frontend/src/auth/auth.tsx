import { createContext, useContext } from 'react'

// 서버가 인증한 회원·역할 타입과 로그인 상태를 React 컴포넌트에 전달하는 컨텍스트.
export type Role = 'USER' | 'MANAGER' | 'PROCTOR' | 'ADMIN'
export type CompanyRole = 'MANAGER' | 'PROCTOR'
export const isCompanyRole = (r: Role | undefined): r is CompanyRole => r === 'MANAGER' || r === 'PROCTOR'
export const canManageSessions = (r: Role | undefined) => r === 'ADMIN' || r === 'MANAGER'
export const canReviewProctor = (r: Role | undefined) => r === 'ADMIN' || r === 'MANAGER' || r === 'PROCTOR'
export type AuthUser = { id: number; email: string; name: string; role: Role; companyName?: string; companyId?: number }

export function homeFor(role: Role) {
  return role === 'USER' ? '/tasks' : isCompanyRole(role) ? '/console/sessions' : '/console/tasks'
}

export type AuthApi = {
  user: AuthUser | null
  signedIn: boolean
  loading: boolean
  login: (email: string, password: string) => Promise<AuthUser>
  signup: (name: string, email: string, password: string) => Promise<AuthUser>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthApi | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('AuthProvider 안에서만 쓸 수 있습니다')
  return ctx
}
