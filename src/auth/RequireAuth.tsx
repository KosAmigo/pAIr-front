// DESIGN.md §7-8 접근 막기: 로그인하지 않았으면 /login?next=... 로, 권한이 맞지 않으면 그 권한의 첫 화면으로 보낸다.
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { homeFor, useAuth, type Role } from './auth'

export default function RequireAuth({ roles }: { roles?: Role[] }) {
  const { user } = useAuth()
  const loc = useLocation()
  if (!user) {
    const next = encodeURIComponent(loc.pathname + loc.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={homeFor(user.role)} replace state={{ denied: true }} />
  }
  return <Outlet />
}
