// 목업 로그인 상태 (DESIGN.md §7-8): 타입, 계정, 훅. 화면 컴포넌트는 AuthProvider.tsx
import { createContext, useContext } from 'react'

export type Role = 'USER' | 'COMPANY' | 'ADMIN'
export type AuthUser = { id: number; email: string; name: string; role: Role; companyName?: string }

// 목업 계정. 비밀번호는 모두 pair1234 (개발용 테스트 값, docs/erd 샘플 회원과 같은 이메일)
/**
 * 백엔드 인증이 붙기 전까지는 로그인 없이 쓴다.
 * 직접 로그인한 계정이 없으면 이 목업 계정(관리자)으로 자동 접속한다. 관리자는 자가진단과 콘솔 모두 들어갈 수 있다.
 * 다른 권한을 시험하려면 /login 에서 로그인하거나 콘솔의 DEV 스위치를 쓴다. 백엔드 인증을 붙일 때 false 로 바꾼다.
 */
export const MOCK_AUTO_LOGIN = true

export const MOCK_PASSWORD = 'pair1234'
export const ACCOUNTS: AuthUser[] = [
  { id: 1, email: 'admin@pair.test', name: '관리자', role: 'ADMIN' },
  { id: 2, email: 'a@pair.test', name: '응시자A', role: 'USER' },
  { id: 3, email: 'b@pair.test', name: '응시자B', role: 'USER' },
  { id: 4, email: 'hr@example-tech.test', name: '예시테크 담당자', role: 'COMPANY', companyName: '예시테크' },
]

/** 로그인 뒤 권한별 첫 화면 */
export function homeFor(role: Role) {
  return role === 'USER' ? '/tasks' : role === 'COMPANY' ? '/console/sessions' : '/console/tasks'
}

export type AuthApi = {
  /** 지금 쓰는 계정 (자동 접속 포함) */
  user: AuthUser | null
  /** 직접 로그인했는지. 자동 접속이면 false */
  signedIn: boolean
  login: (email: string, password: string) => AuthUser | null
  /** company 를 주면 기업 회원(COMPANY)으로, 없으면 일반 회원(USER)으로 가입한다 */
  signup: (name: string, email: string, password: string, company?: string) => { user?: AuthUser; error?: string }
  logout: () => void
  /** 목업 전용: 콘솔의 권한 전환 스위치 */
  switchRole: (role: Exclude<Role, 'USER'>) => void
}

export const AuthContext = createContext<AuthApi | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('AuthProvider 안에서만 쓸 수 있습니다')
  return ctx
}
