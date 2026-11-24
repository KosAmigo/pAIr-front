import type { ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { LayoutDashboard } from 'lucide-react'
import { motion } from 'motion/react'
import { canUseSelfDiagnosis, useAuth } from '../auth/auth'
import { springs } from '../lib/motion'
import { cx } from './cx'
import { Aurora, PageTransition, Reveal, ScrambleText } from './fx'
import { Logo, ModeBadge } from './ui'
import { UserMenu } from './UserMenu'
import { CreditPill } from './CreditPill'

// DESIGN.md §7 공통 셸: 자가진단 화면은 상단 탭(과제 / 대시보드 / 복기)으로 이동한다.
// 왼쪽 아이콘 레일은 응시 화면 전용이다 (components/ActivityRail.tsx).
// 표현 무대(DESIGN.md §0-1): 위쪽에 오로라 띠, 상단 바는 유리, 화면 내용은 PageTransition 으로 들어온다.
const tabs = [
  { to: '/tasks', label: '과제', match: ['/tasks'] },
  { to: '/dashboard', label: '대시보드', match: ['/dashboard'] },
  { to: '/review', label: '복기', match: ['/review', '/report', '/replay', '/history'] },
]

export function SelfShell({ children, header }: { children: ReactNode; header?: ReactNode }) {
  const { pathname } = useLocation()
  const { user } = useAuth()
  // 기업 계정은 마이페이지 같은 계정 화면만 이 셸을 쓴다. 자가진단 메뉴와 크레딧·충전은 보이지 않는다
  const selfUse = canUseSelfDiagnosis(user?.role)
  return (
    <div className="relative isolate flex h-full flex-col overflow-hidden">
      <Aurora variant="band" className="h-[360px]" />
      <header className="glass relative z-20 flex h-14 shrink-0 items-stretch rounded-none border-0 border-b border-line/70 px-8 shadow-none">
        <div className="flex items-center gap-3">
          <Logo />
          {selfUse && <ModeBadge mode="self" />}
        </div>
        {selfUse && <nav aria-label="자가진단 메뉴" className="ml-10 flex items-stretch gap-6">
          {tabs.map((t) => {
            const active = t.match.some((m) => pathname.startsWith(m))
            return (
              <NavLink
                key={t.to}
                to={t.to}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'relative inline-flex items-center text-[15px] font-medium transition-colors duration-[180ms]',
                  active ? 'text-text' : 'text-text-muted hover:text-text',
                )}
              >
                {t.label}
                {active && (
                  <motion.span
                    layoutId="self-shell-tab"
                    transition={springs.snappy}
                    className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand-gradient"
                    aria-hidden
                  />
                )}
              </NavLink>
            )
          })}
        </nav>}
        <div className="ml-auto flex items-center">
          {selfUse && <div className="mr-3"><CreditPill /></div>}
          {selfUse && <Link to="/credits" className="mr-3 inline-flex h-8 items-center rounded-md border border-line px-3 text-[14px] font-medium text-brand hover:bg-panel-raised">
            충전
          </Link>}
          {user && user.role !== 'USER' && (
            <Link
              to="/console"
              title="콘솔: 과제 만들기, 시험 회차와 감독"
              className="mr-3 inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-3 text-[14px] font-medium text-text-muted transition-colors hover:border-line-strong hover:bg-panel-raised hover:text-text"
            >
              <LayoutDashboard size={15} aria-hidden /> 콘솔
            </Link>
          )}
          <UserMenu />
        </div>
      </header>
      <PageTransition routeKey={pathname} className="relative z-10 flex min-h-0 flex-1 flex-col">
        {header}
        <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      </PageTransition>
    </div>
  )
}

export function PageHeader({ label, title, children }: { label: string; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="relative z-10 flex h-16 shrink-0 items-center gap-4 border-b border-line/70 px-8">
      <div className="flex flex-col">
        <ScrambleText text={label} className="label" />
        <Reveal y={8}>
          <h1 className="text-[21px] leading-7 font-bold text-text">{title}</h1>
        </Reveal>
      </div>
      <div className="ml-auto flex items-center gap-2">{children}</div>
    </header>
  )
}
