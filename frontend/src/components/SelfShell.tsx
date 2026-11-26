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
    <div className="self-shell relative isolate flex h-full flex-col overflow-hidden">
      <Aurora variant="band" className="h-[360px]" />
      {/* 휴대폰 폭(md 미만): 첫 줄은 로고와 오른쪽 버튼, 탭은 둘째 줄로 내려 화면이 옆으로 밀리지 않게 한다 */}
      <header className="glass relative z-20 flex shrink-0 flex-wrap items-stretch rounded-none border-0 border-b border-line/70 px-4 shadow-none md:h-14 md:flex-nowrap md:px-8">
        <div className="flex h-14 items-center gap-3">
          <Logo />
          {selfUse && <span className="hidden sm:inline-flex"><ModeBadge mode="self" /></span>}
        </div>
        {selfUse && <nav aria-label="자가진단 메뉴" className="order-last flex h-11 w-full items-stretch gap-6 border-t border-line/50 md:order-none md:ml-10 md:h-auto md:w-auto md:border-t-0">
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
        <div className="ml-auto flex h-14 min-w-0 items-center">
          {selfUse && <div className="mr-2 md:mr-3"><CreditPill /></div>}
          {selfUse && user?.role !== 'ADMIN' && <Link to="/credits" className="mr-2 shrink-0 md:mr-3 inline-flex h-8 items-center rounded-md border border-line px-3 text-[14px] font-medium text-brand hover:bg-panel-raised">
            충전
          </Link>}
          {user && user.role !== 'USER' && (
            <Link
              to="/console"
              title="콘솔: 과제 만들기, 시험 회차와 감독"
              aria-label="콘솔"
              className="mr-2 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-line px-2 text-[14px] font-medium text-text-muted transition-colors hover:border-line-strong hover:bg-panel-raised hover:text-text md:mr-3 md:px-3"
            >
              <LayoutDashboard size={15} aria-hidden /> <span className="hidden sm:inline">콘솔</span>
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
    <header className="relative z-10 flex min-h-16 shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-line/70 px-4 py-2 md:px-8">
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
