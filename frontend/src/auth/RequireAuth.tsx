// 서버에서 복원한 로그인과 역할을 확인해, 비로그인은 로그인 화면으로 역할 불일치는 허용된 첫 화면으로 보낸다.
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { homeFor, useAuth, type Role } from './auth'

export default function RequireAuth({ roles }: { roles?: Role[] }) {
  const { user, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <div className="min-h-full" role="status" aria-label="로그인 확인 중" />
  if (!user) {
    const next = encodeURIComponent(loc.pathname + loc.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={homeFor(user.role)} replace state={{ denied: true }} />
  }
  return <Outlet />
}
