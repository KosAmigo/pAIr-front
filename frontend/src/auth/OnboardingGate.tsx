import { useEffect, useRef, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './auth'
import { mustLogoutForOnboarding, needsOnboarding } from '../company/policy'

export function OnboardingGate({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const previous = useRef(pathname)
  const restricted = !loading && !!user && needsOnboarding(user)
  const blocked = restricted && pathname !== '/onboarding' && pathname !== '/login'
  useEffect(() => {
    const shouldLogout = !loading && mustLogoutForOnboarding(user, pathname, previous.current)
    previous.current = pathname
    if (!shouldLogout) return
    void logout().then(
      () => navigate('/login', { replace: true, state: { authMessage: '계정 활성화 전에 다른 페이지로 이동하여 로그아웃되었습니다. 다시 로그인해 주세요.' } }),
      () => navigate('/login', { replace: true, state: { logoutError: true } }),
    )
  }, [loading, user, logout, navigate, pathname])
  if (blocked) return <div role="status">로그아웃 중입니다.</div>
  return children
}
