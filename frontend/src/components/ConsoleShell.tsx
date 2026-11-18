// DESIGN.md §7-9-0 콘솔 공통 셸: 왼쪽 사이드바(권한별 메뉴) + 상단 바(브레드크럼, 권한 배지, 아바타).
import { useEffect, useState } from 'react'
import { CrumbContext } from './consoleCrumbs'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Building2, CalendarClock, FileStack, FlaskConical, ShieldCheck } from 'lucide-react'
import { motion } from 'motion/react'
import { springs } from '../lib/motion'
import { cx } from './cx'
import { Aurora, Glass, PageTransition } from './fx'
import { Logo } from './ui'
import { UserMenu } from './UserMenu'
import { homeFor, useAuth, type Role } from '../auth/auth'
import { tabOf, useConsoleTasks } from '../data/consoleTasks'

type MenuItem = { to: string; label: string; icon: typeof FileStack; roles: Role[]; count?: number }
const MENU: MenuItem[] = [
  { to: '/console/tasks', label: '과제', icon: FileStack, roles: ['ADMIN'] },
  { to: '/console/sessions', label: '회차', icon: CalendarClock, roles: ['ADMIN', 'MANAGER', 'PROCTOR'] },
  { to: '/console/companies', label: '회사', icon: Building2, roles: ['ADMIN'] },
]

/** 경로 → 브레드크럼 첫 칸 이름 */
const SECTION: Record<string, string> = { tasks: '과제', sessions: '회차', companies: '회사' }

export function ConsoleShell() {
  const { user, switchRole } = useAuth()
  const { pathname, state, key } = useLocation()
  const nav = useNavigate()
  // 권한 없는 주소에서 넘어오면(RequireAuth 가 state.denied 를 붙임) 토스트를 잠깐 띄운다
  const [dismissed, setDismissed] = useState<string | null>(null)
  const denied = (state as { denied?: boolean } | null)?.denied && dismissed !== key
  useEffect(() => {
    if (!denied) return
    const t = window.setTimeout(() => setDismissed(key), 2600)
    return () => window.clearTimeout(t)
  }, [denied, key])
  const toast = denied ? '접근 권한이 없습니다' : null

  const [crumbs, setCrumbs] = useState<string[]>([])
  const draftCount = useConsoleTasks().filter((t) => tabOf(t) === 'draft').length

  if (!user) return null
  // 과제 메뉴 옆 숫자 = 검수 대기 수
  const items = MENU.filter((m) => m.roles.includes(user.role)).map((m) => (m.to === '/console/tasks' ? { ...m, count: draftCount } : m))
  const section = pathname.split('/')[2]

  return (
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col border-r border-line bg-panel">
        <div className="flex h-14 items-center gap-2 px-5">
          <Logo />
          <span className="label">CONSOLE</span>
        </div>
        <nav aria-label="콘솔 메뉴" className="flex flex-col gap-0.5 px-3 pt-3">
          {items.map((m) => (
            <MenuLink key={m.to} item={m} />
          ))}
          {user.role === 'ADMIN' && (
            <>
              <div className="mx-2 my-3 h-px bg-line" />
              <MenuLink item={{ to: '/grader', label: '채점 툴', icon: FlaskConical, roles: ['ADMIN'] }} />
            </>
          )}
        </nav>
        <div className="mt-auto border-t border-line px-5 py-4">
          {user.companyName ? (
            <p className="flex items-center gap-2 text-[13px] text-text-muted">
              <Building2 size={16} aria-hidden /> {user.companyName}
            </p>
          ) : (
            <p className="flex items-center gap-2 text-[13px] text-text-muted">
              <ShieldCheck size={16} aria-hidden /> pAIr 운영
            </p>
          )}
        </div>
      </aside>

      <div className="relative isolate flex min-w-0 flex-1 flex-col">
        <Aurora variant="band" className="h-[360px]" />
        <header className="glass relative z-20 flex h-14 shrink-0 items-center gap-3 rounded-none border-0 border-b border-line/70 px-8 shadow-none">
          <nav aria-label="현재 위치" className="flex items-center gap-2 text-[15px]">
            <Link to={`/console/${section}`} className={cx(crumbs.length ? 'text-text-muted hover:text-text' : 'font-semibold text-text')}>
              {SECTION[section] ?? '콘솔'}
            </Link>
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-2">
                <span className="text-text-faint" aria-hidden>
                  /
                </span>
                <span className={cx(i === crumbs.length - 1 ? 'font-semibold text-text' : 'text-text-muted')}>{c}</span>
              </span>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <RoleSwitch
              role={user.role === 'USER' ? 'MANAGER' : user.role}
              onChange={(r) => {
                switchRole(r)
                nav(homeFor(r))
              }}
            />
            <span
              className={cx(
                'inline-flex h-[22px] items-center rounded-sm px-1.5 font-mono text-[12px] font-semibold tracking-[0.08em]',
                user.role === 'ADMIN' ? 'bg-brand-dim text-brand' : 'bg-info/10 text-info',
              )}
            >
              {user.role}
            </span>
            <UserMenu />
          </div>
        </header>
        <main className="relative z-10 min-h-0 flex-1 overflow-auto">
          <CrumbContext.Provider value={setCrumbs}>
            <PageTransition routeKey={pathname} className="min-h-full">
              <Outlet />
            </PageTransition>
          </CrumbContext.Provider>
        </main>
      </div>

      {toast && (
        <Glass role="status" className="fade-in fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-md px-4 py-2 text-[14px] text-text shadow-modal!">
          {toast}
        </Glass>
      )}
    </div>
  )
}

function MenuLink({ item }: { item: MenuItem }) {
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        cx(
          'relative flex h-10 items-center gap-3 rounded-md px-3 text-[15px] font-medium transition-colors duration-150',
          isActive ? 'bg-brand-dim text-brand' : 'text-text-muted hover:bg-panel-raised hover:text-text',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span layoutId="console-menu-active" transition={springs.snappy} className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-brand-gradient" aria-hidden />
          )}
          <item.icon size={18} strokeWidth={1.75} aria-hidden />
          {item.label}
          {item.count != null && (
            <span className="tnum ml-auto rounded-sm bg-panel-raised px-1.5 font-mono text-[12px] text-text-muted">{item.count}</span>
          )}
        </>
      )}
    </NavLink>
  )
}

type ConsoleRole = Exclude<Role, 'USER'>
/** 목업 전용 권한 전환 스위치 (DESIGN.md §7-9). 백엔드 인증이 붙으면 지운다. */
function RoleSwitch({ role, onChange }: { role: ConsoleRole; onChange: (r: ConsoleRole) => void }) {
  return (
    <div role="radiogroup" aria-label="목업 권한 전환" title="개발용: 권한 전환" className="flex items-center gap-0.5 rounded-md border border-dashed border-caution/70 p-0.5">
      <span className="px-1.5 font-mono text-[11px] text-caution">DEV</span>
      {(['ADMIN', 'MANAGER', 'PROCTOR'] as const).map((r) => (
        <button
          key={r}
          type="button"
          role="radio"
          aria-checked={role === r}
          onClick={() => role !== r && onChange(r)}
          className={cx(
            'h-6 rounded-sm px-2 font-mono text-[11px] font-semibold',
            role === r ? 'bg-panel-raised text-text' : 'text-text-muted hover:text-text',
          )}
        >
          {r}
        </button>
      ))}
    </div>
  )
}

