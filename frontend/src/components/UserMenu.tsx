// 상단 바 오른쪽 아바타 메뉴 (DESIGN.md §7-8): 이름, 이메일, 로그아웃
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, UserRound } from 'lucide-react'
import { useAuth } from '../auth/auth'

export function UserMenu() {
  // 현재 인증된 회원 정보를 보여 주고, 로그아웃 시 서버 세션도 함께 폐기한다.
  const { user, logout } = useAuth()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!user) return null
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${user.name} 계정 메뉴`}
        title={user.name}
        className="flex size-8 items-center justify-center rounded-full bg-brand-dim text-[14px] font-semibold text-brand transition-shadow hover:shadow-[0_0_0_3px_rgb(108_71_255/0.15)]"
      >
        {user.name.slice(0, 1)}
      </button>
      {open && (
        <div role="menu" className="fade-in absolute top-10 right-0 z-50 w-60 rounded-md border border-line bg-panel p-1.5 shadow-modal">
          <div className="px-3 py-2">
            <p className="text-[15px] font-semibold text-text">{user.name}</p>
            <p className="truncate font-mono text-[12px] text-text-muted">{user.email}</p>
          </div>
          <div className="my-1 h-px bg-line" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              nav('/mypage')
            }}
            className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-[14px] text-text hover:bg-panel-raised"
          >
            <UserRound size={16} aria-hidden /> 마이페이지
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              try {
                await logout()
                nav('/login', { replace: true })
              } catch {
                nav('/login', { replace: true, state: { logoutError: true } })
              }
            }}
            className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-[14px] text-text hover:bg-panel-raised"
          >
            <LogOut size={16} aria-hidden /> 로그아웃
          </button>
        </div>
      )}
    </div>
  )
}
