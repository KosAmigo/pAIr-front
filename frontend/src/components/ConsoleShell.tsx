// DESIGN.md §7-9-0 콘솔 공통 셸: 왼쪽 사이드바(권한별 메뉴) + 상단 바(브레드크럼, 권한 배지, 아바타).
// 2026-11-19 개편: 사이드바는 다크 무대 레일. 활성 메뉴 뒤로 빛나는 판이 미끄러지고, 아래에 소속과 권한 카드.
import { useEffect, useState } from 'react'
import { CrumbContext } from './consoleCrumbs'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Building2, CalendarClock, FlaskConical, PanelLeftClose, PanelLeftOpen, ShieldCheck, type LucideIcon } from 'lucide-react'
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
const SECTION: Record<string, string> = { grader: '채점 툴', tasks: '과제', sessions: '회차', companies: '회사', members: '회사 회원' }

const NAV_KEY = 'pair.consoleNavCollapsed'
const readCollapsed = () => {
  try {
    return localStorage.getItem(NAV_KEY) === '1'
  } catch {
    return false
  }
}

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
  // 사이드바 접힘: 접으면 아이콘만 남는 레일(72px), 펼치면 216px. 상태는 기억한다
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const toggleNav = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(NAV_KEY, c ? '0' : '1')
      } catch {
        /* 저장이 막혀도 이번 화면에서는 동작한다 */
      }
      return !c
    })
  // 과제 목록은 관리자만 볼 수 있어 관리자일 때만 불러온다
  const taskList = useTaskList(user?.role === 'ADMIN')
  const draftCount = taskList.list?.filter((t) => t.status === 'HIDDEN').length ?? 0

  if (!user) return null
  // 과제 메뉴 옆 숫자 = 검수 대기 수
  const items = MENU.filter((m) => m.roles.includes(user.role)).map((m) => (m.to === '/console/tasks' ? { ...m, count: draftCount } : m))
  // 채점 툴(/grader)도 이 셸 안에 있다: 첫 칸 = 채점 툴
  const inGrader = pathname.startsWith('/grader')
  const section = inGrader ? 'grader' : pathname.split('/')[2]

  return (
    <div className="flex h-full">
      {/* 접힘 = 사이드바 폭만 왼쪽 기준으로 줄어든다. 안쪽은 216px 고정이라 내용은 왼쪽에 붙은 채 오른쪽 끝이 잘려 들어가고,
          아이콘 칸(48px)은 펼침·접힘 모두 72px 레일의 가운데에 있어 화면 위치(x·y)가 변하지 않는다. 이름 글자는 투명도로만 나타나고 사라진다. */}
      <StageSection as="aside" aria-label="콘솔 메뉴" data-collapsed={collapsed} className={cx('shrink-0 overflow-hidden rounded-none! border-0! shadow-none! transition-[width] duration-200 ease-out motion-reduce:transition-none', collapsed ? 'w-[72px]' : 'w-[216px]')}>
        <div className="flex h-full w-[216px] flex-col">
          <div className="flex h-16 items-center gap-2 pl-[27px]">
            <Logo compact={collapsed} className="text-stage-text!" />
            <span aria-hidden={collapsed} className={cx('rounded-sm border border-stage-line px-1.5 font-mono text-[11px] font-semibold tracking-[0.12em] text-stage-brand transition-opacity duration-150 motion-reduce:transition-none', collapsed && 'opacity-0')}>
              CONSOLE
            </span>
          </div>
          <nav aria-label="콘솔 메뉴 항목" className="flex flex-col gap-1 px-3 pt-4">
            <Label collapsed={collapsed} className="pb-1">MENU</Label>
            {items.map((m) => (
              <MenuLink key={m.to} item={m} collapsed={collapsed} />
            ))}
            {user.role === 'ADMIN' && (
              <>
                <Label collapsed={collapsed} className="pt-5 pb-1">TOOLS</Label>
                <MenuLink item={{ to: '/grader', label: '채점 툴', icon: FlaskConical, roles: ['ADMIN'] }} collapsed={collapsed} />
              </>
            )}
          </nav>
          <div className="mt-auto flex flex-col gap-1 px-3 pb-3">
            <button
              type="button"
              onClick={toggleNav}
              aria-expanded={!collapsed}
              aria-label={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
              title={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
              className="flex h-10 w-full items-center rounded-lg text-[14px] font-medium text-stage-muted transition-colors duration-150 outline-none hover:bg-stage-raised/60 hover:text-stage-text focus-visible:ring-4 focus-visible:ring-stage-brand/30"
            >
              <span className="flex w-12 shrink-0 items-center justify-center">
                {collapsed ? <PanelLeftOpen size={18} strokeWidth={1.75} aria-hidden /> : <PanelLeftClose size={18} strokeWidth={1.75} aria-hidden />}
              </span>
              <span aria-hidden className={cx('whitespace-nowrap transition-opacity duration-150 motion-reduce:transition-none', collapsed && 'opacity-0')}>접기</span>
            </button>
            <div title={`${user.companyName ?? 'pAIr 운영'} · ${user.role}`} className="flex h-12 items-center">
              <span className="glass-stage flex size-10 shrink-0 items-center justify-center rounded-full mx-1">
                {user.companyName ? <Building2 size={16} className="text-stage-brand" aria-hidden /> : <ShieldCheck size={16} className="text-stage-brand" aria-hidden />}
              </span>
              <span className={cx('ml-2 min-w-0 transition-opacity duration-150 motion-reduce:transition-none', collapsed && 'opacity-0')}>
                <span className="block truncate text-[13px] font-semibold text-stage-text">{user.companyName ?? 'pAIr 운영'}</span>
                <span className="block font-mono text-[12px] text-stage-muted">{user.role}</span>
              </span>
            </div>
          </div>
        </div>
      </StageSection>

      <div className="relative isolate flex min-w-0 flex-1 flex-col">
        <Aurora variant="band" className="h-[360px]" />
        <header className="glass relative z-20 flex h-14 shrink-0 items-center gap-3 rounded-none border-0 border-b border-line/70 px-8 shadow-none">
          <nav aria-label="현재 위치" className="flex items-center gap-2 text-[15px]">
            <Link to={inGrader ? '/grader' : `/console/${section}`} className={cx(crumbs.length ? 'text-text-muted hover:text-text' : 'font-semibold text-text')}>
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

/** MENU·TOOLS 라벨: 접어도 높이는 그대로(아이콘 y 고정), 글자만 투명 */
function Label({ collapsed, className, children }: { collapsed: boolean; className?: string; children: string }) {
  return (
    <p aria-hidden className={cx('px-3 font-mono text-[11px] tracking-[0.12em] text-stage-faint transition-opacity duration-150 motion-reduce:transition-none', collapsed && 'opacity-0', className)}>
      {children}
    </p>
  )
}

/** 메뉴 한 줄. 아이콘 칸(48px)은 항상 72px 레일의 가운데. 접으면 줄 폭이 48px로 줄어 활성 판이 아이콘을 가운데 둔 정사각형에 가까워진다. */
function MenuLink({ item, collapsed }: { item: MenuItem; collapsed: boolean }) {
  const count = item.count != null && item.count > 0 ? item.count : 0
  return (
    <NavLink
      to={item.to}
      title={collapsed ? item.label : undefined}
      aria-label={collapsed ? `${item.label}${count ? `, 검수 대기 ${count}개` : ''}` : undefined}
      className={({ isActive }) =>
        cx(
          'relative flex h-11 items-center rounded-lg text-[15px] font-medium whitespace-nowrap transition-[width,color,background-color] duration-200 ease-out outline-none motion-reduce:transition-none focus-visible:ring-4 focus-visible:ring-stage-brand/30',
          collapsed ? 'w-12' : 'w-[192px]',
          isActive ? 'text-stage-text' : 'text-stage-muted hover:bg-stage-raised/60 hover:text-stage-text',
        )
      }
    >
      {({ isActive }) => (
        <>
          {/* 활성 판: 메뉴 사이를 미끄러진다. 판·아이콘 색·옅은 빛으로만 활성을 보인다 */}
          {isActive && (
            <motion.span
              layoutId="console-menu-active"
              transition={springs.snappy}
              data-testid="menu-active"
              className="absolute inset-0 -z-0 rounded-lg border border-stage-line bg-stage-raised shadow-[0_0_24px_-6px_color-mix(in_srgb,var(--color-stage-brand)_60%,transparent)]"
              aria-hidden
            />
          )}
          <span className="relative flex w-12 shrink-0 items-center justify-center">
            <item.icon size={18} strokeWidth={1.75} className={cx(isActive && 'text-stage-brand')} aria-hidden />
            {collapsed && count > 0 && (
              // 접으면 숫자 알약 대신 아이콘 오른쪽 위의 작은 점
              <span data-testid="menu-dot" aria-hidden className="absolute top-2 right-2.5 size-2.5 rounded-full bg-stage-caution ring-2 ring-stage-bg" />
            )}
          </span>
          <span aria-hidden={collapsed} className={cx('relative transition-opacity duration-150 motion-reduce:transition-none', collapsed && 'opacity-0')}>
            {item.label}
          </span>
          {!collapsed && count > 0 && <span className="tnum relative ml-auto mr-2 rounded-full bg-stage-caution/15 px-2 font-mono text-[12px] font-semibold text-stage-caution">{count}</span>}
        </>
      )}
    </NavLink>
  )
}
