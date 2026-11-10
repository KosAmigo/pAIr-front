import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { FileBarChart2, GitBranch, LayoutGrid, SquareTerminal } from 'lucide-react'
import { cx, Logo } from './ui'
import { user } from '../data/mock'

// DESIGN.md §7 공통 셸: 자가진단 화면(2·4·5)의 왼쪽 아이콘 레일 56px
const items = [
  { to: '/dashboard', label: '대시보드', icon: LayoutGrid },
  { to: '/exam/t-order-api?mode=self', label: '과제 응시', icon: SquareTerminal, match: '/exam' },
  { to: '/report/a-1107', label: '결과 리포트', icon: FileBarChart2, match: '/report' },
  { to: '/replay/t-order-api', label: '복기 트리', icon: GitBranch, match: '/replay' },
]

export function RailShell({ children, header }: { children: ReactNode; header?: ReactNode }) {
  const { pathname } = useLocation()
  return (
    <div className="flex h-full">
      <nav aria-label="주 메뉴" className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-line bg-panel py-3">
        <div className="mb-4">
          <Logo className="[&>span]:hidden" />
        </div>
        {items.map(({ to, label, icon: Icon, match }) => (
          <NavLink
            key={label}
            to={to}
            aria-label={label}
            title={label}
            className={({ isActive }) => {
              const active = isActive || (match && pathname.startsWith(match))
              return cx(
                'relative flex size-10 items-center justify-center rounded-md transition-colors duration-[120ms]',
                active ? 'bg-panel-raised text-text' : 'text-text-muted hover:bg-panel-raised hover:text-text',
              )
            }}
          >
            {({ isActive }) => (
              <>
                {(isActive || (match && pathname.startsWith(match))) && (
                  <span className="absolute top-2 bottom-2 -left-2 w-0.5 rounded-full bg-signal" aria-hidden />
                )}
                <Icon size={22} strokeWidth={1.75} aria-hidden />
              </>
            )}
          </NavLink>
        ))}
        <div
          className="mt-auto flex size-8 items-center justify-center rounded-full bg-panel-raised text-[14px] font-semibold text-text"
          title={`${user.name} (자가진단)`}
          aria-label={`${user.name} 프로필`}
        >
          {user.name.slice(0, 1)}
        </div>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        {header}
        <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      </div>
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
