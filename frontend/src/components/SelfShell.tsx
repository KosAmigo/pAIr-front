import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { cx } from './cx'
import { Logo, ModeBadge } from './ui'
import { user } from '../data/mock'

// DESIGN.md §7 공통 셸: 자가진단 화면은 상단 탭(과제 / 대시보드 / 내 기록)으로 이동한다.
// 왼쪽 아이콘 레일은 응시 화면 전용이다 (components/ActivityRail.tsx).
const tabs = [
  { to: '/tasks', label: '과제', match: ['/tasks'] },
  { to: '/dashboard', label: '대시보드', match: ['/dashboard'] },
  { to: '/history', label: '내 기록', match: ['/history', '/report', '/replay'] },
]

export function SelfShell({ children, header }: { children: ReactNode; header?: ReactNode }) {
  const { pathname } = useLocation()
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-stretch border-b border-line bg-panel px-8">
        <div className="flex items-center gap-3">
          <Logo />
          <ModeBadge mode="self" />
        </div>
        <nav aria-label="자가진단 메뉴" className="ml-10 flex items-stretch gap-6">
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
                <span
                  className={cx('absolute inset-x-0 -bottom-px h-0.5 bg-signal transition-opacity duration-[180ms]', active ? 'opacity-100' : 'opacity-0')}
                  aria-hidden
                />
              </NavLink>
            )
          })}
        </nav>
        <div className="ml-auto flex items-center">
          <div
            className="flex size-8 items-center justify-center rounded-full bg-panel-raised text-[14px] font-semibold text-text"
            title={`${user.name} (자가진단)`}
            aria-label={`${user.name} 프로필`}
          >
            {user.name.slice(0, 1)}
          </div>
        </div>
      </header>
      {header}
      <main className="min-h-0 flex-1 overflow-auto">{children}</main>
    </div>
  )
}


export function PageHeader({ label, title, children }: { label: string; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-line px-8">
      <div className="flex flex-col">
        <span className="label">{label}</span>
        <h1 className="text-[21px] leading-7 font-bold text-text">{title}</h1>
      </div>
      <div className="ml-auto flex items-center gap-2">{children}</div>
    </header>
  )
}
