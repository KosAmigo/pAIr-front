// DESIGN.md §7-9-0 콘솔 공통 셸: 왼쪽 사이드바(권한별 메뉴) + 상단 바(브레드크럼, 권한 배지, 아바타).
// 2026-11-19 개편: 사이드바는 다크 무대 레일. 활성 메뉴 뒤로 빛나는 판이 미끄러지고, 아래에 소속과 권한 카드.
import { useEffect, useState } from 'react'
import { CrumbContext } from './consoleCrumbs'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Building2, CalendarClock, FlaskConical, ShieldCheck, type LucideIcon } from 'lucide-react'
import { TaskIcon } from './domainIcons'
import { motion } from 'motion/react'
import { springs } from '../lib/motion'
import { cx } from './cx'
import { Aurora, Glass, PageTransition, StageSection } from './fx'
import { Logo } from './ui'
import { UserMenu } from './UserMenu'
import { useAuth, type Role } from '../auth/auth'
import { useTaskList } from '../data/consoleTasks'

type MenuItem = { to: string; label: string; icon: LucideIcon; roles: Role[]; count?: number }
const MENU: MenuItem[] = [
  { to: '/console/tasks', label: '과제', icon: TaskIcon, roles: ['ADMIN'] },
  { to: '/console/sessions', label: '회차', icon: CalendarClock, roles: ['ADMIN', 'MANAGER', 'PROCTOR'] },
  { to: '/console/companies', label: '회사', icon: Building2, roles: ['ADMIN'] },
  { to: '/console/members', label: '회사 회원', icon: Building2, roles: ['MANAGER'] },
]

/** 경로 → 브레드크럼 첫 칸 이름 */
const SECTION: Record<string, string> = { tasks: '과제', sessions: '회차', companies: '회사', members: '회사 회원' }

export function ConsoleShell() {
  // 토큰에서 확인된 사용자 역할에 맞는 콘솔 메뉴만 표시한다.
  const { user } = useAuth()
  const { pathname, state, key } = useLocation()
  // 권한 없는 주소에서 넘어오면(RequireAuth 가 state.denied 를 붙임) 토스트를 잠깐 띄운다
  const [dismissed, setDismissed] = useState<string | null>(null)
  const deniedState = state as { denied?: boolean; deniedMessage?: string } | null
  const denied = deniedState?.denied && dismissed !== key
  useEffect(() => {
    if (!denied) return
    const t = window.setTimeout(() => setDismissed(key), 2600)
    return () => window.clearTimeout(t)
  }, [denied, key])
  const toast = denied ? deniedState?.deniedMessage ?? '접근 권한이 없습니다' : null

  const [crumbs, setCrumbs] = useState<string[]>([])
  // 과제 목록은 관리자만 볼 수 있어 관리자일 때만 불러온다
  const taskList = useTaskList(user?.role === 'ADMIN')
  const draftCount = taskList.list?.filter((t) => t.status === 'HIDDEN').length ?? 0

  if (!user) return null
  // 과제 메뉴 옆 숫자 = 검수 대기 수
  const items = MENU.filter((m) => m.roles.includes(user.role)).map((m) => (m.to === '/console/tasks' ? { ...m, count: draftCount } : m))
  const section = pathname.split('/')[2]

  return (
    <div className="flex h-full">
      <StageSection as="aside" aria-label="콘솔 메뉴" className="flex w-64 shrink-0 flex-col rounded-none! border-0! shadow-none!">
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center gap-2 px-5">
            <Logo className="text-stage-text!" />
            <span className="rounded-sm border border-stage-line px-1.5 font-mono text-[11px] font-semibold tracking-[0.12em] text-stage-brand">CONSOLE</span>
          </div>
          <nav className="flex flex-col gap-1 px-3 pt-4">
            <p className="px-3 pb-1 font-mono text-[11px] tracking-[0.12em] text-stage-faint">MENU</p>
            {items.map((m) => (
              <MenuLink key={m.to} item={m} />
            ))}
            {user.role === 'ADMIN' && (
              <>
                <p className="px-3 pt-5 pb-1 font-mono text-[11px] tracking-[0.12em] text-stage-faint">TOOLS</p>
                <MenuLink item={{ to: '/grader', label: '채점 툴', icon: FlaskConical, roles: ['ADMIN'] }} />
              </>
            )}
          </nav>
          <div className="mt-auto p-3">
            <div className="glass-stage rounded-xl px-4 py-3">
              <p className="flex items-center gap-2 text-[13px] font-semibold text-stage-text">
                {user.companyName ? <Building2 size={16} className="text-stage-brand" aria-hidden /> : <ShieldCheck size={16} className="text-stage-brand" aria-hidden />}
                {user.companyName ?? 'pAIr 운영'}
              </p>
              <p className="mt-0.5 font-mono text-[12px] text-stage-muted">{user.role}</p>
            </div>
          </div>
        </div>
      </StageSection>

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
        cx('relative flex h-11 items-center gap-3 rounded-lg px-3 text-[15px] font-medium transition-colors duration-150', isActive ? 'text-stage-text' : 'text-stage-muted hover:bg-stage-raised/60 hover:text-stage-text')
      }
    >
      {({ isActive }) => (
        <>
          {/* 활성 메뉴 뒤 빛나는 판: 메뉴 사이를 미끄러진다 */}
          {isActive && (
            <motion.span
              layoutId="console-menu-active"
              transition={springs.snappy}
              className="absolute inset-0 -z-0 rounded-lg border border-stage-line bg-stage-raised shadow-[0_0_24px_-6px_color-mix(in_srgb,var(--color-stage-brand)_60%,transparent)]"
              aria-hidden
            >
              <span className="bg-brand-gradient absolute inset-y-2.5 left-0 w-[3px] rounded-full" />
            </motion.span>
          )}
          <item.icon size={18} strokeWidth={1.75} className={cx('relative', isActive && 'text-stage-brand')} aria-hidden />
          <span className="relative">{item.label}</span>
          {item.count != null && item.count > 0 && (
            <span className="tnum relative ml-auto rounded-full bg-stage-caution/15 px-2 font-mono text-[12px] font-semibold text-stage-caution">{item.count}</span>
          )}
        </>
      )}
    </NavLink>
  )
}
