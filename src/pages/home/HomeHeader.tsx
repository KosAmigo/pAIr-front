// DESIGN.md §7-1 상단 바: 처음엔 투명, 80px 이상 내리면 유리 표면으로 바뀐다.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { LayoutDashboard } from 'lucide-react'
import { cx } from '../../components/cx'
import { Logo } from '../../components/ui'
import { UserMenu } from '../../components/UserMenu'
import { useAuth } from '../../auth/auth'
import { Magnetic } from '../../components/fx'

export default function HomeHeader() {
  const { signedIn } = useAuth()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={cx(
        'sticky top-0 z-40 transition-[background-color,box-shadow,backdrop-filter] duration-200',
        // 다크 무대 위를 지날 때도 글자 대비가 깨지지 않게 유리 불투명도를 0.85로 올린다
        scrolled ? 'glass bg-white/85! rounded-none! border-x-0! border-t-0!' : 'border-b border-transparent',
      )}
    >
      <div className="mx-auto flex h-16 max-w-[1264px] items-center gap-6 px-8">
        <Logo className="text-[18px]" />
        <div className="ml-auto flex items-center gap-2">
          {/* 콘솔: 관리자는 과제(문제) 만들기, 기업 담당자는 회차와 감독 */}
          <Link
            to="/console"
            title="콘솔: 과제 만들기, 시험 회차와 감독"
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line-strong bg-panel/80 px-4 text-[15px] font-semibold text-text transition-colors duration-150 hover:border-text-muted hover:bg-panel"
          >
            <LayoutDashboard size={16} aria-hidden /> 콘솔
          </Link>
          <Link
            to="/entry"
            className="hidden h-9 items-center rounded-full border border-line-strong bg-panel/80 px-4 text-[15px] font-semibold text-text transition-colors duration-150 hover:border-text-muted hover:bg-panel sm:inline-flex"
          >
            테스트 응시
          </Link>
          <Magnetic>
            <Link
              to="/tasks"
              className="btn-shimmer bg-brand-gradient inline-flex h-9 items-center rounded-full px-4 text-[15px] font-semibold text-on-accent hover:shadow-[0_8px_24px_-6px_rgb(108_71_255/0.45)]"
            >
              자가진단 시작
            </Link>
          </Magnetic>
          {/* 계정: 직접 로그인하지 않았으면 로그인·회원가입, 했으면 아바타 메뉴 */}
          {signedIn ? (
            <span className="ml-1">
              <UserMenu />
            </span>
          ) : (
            <>
              <span aria-hidden className="mx-1 hidden h-5 w-px bg-line-strong sm:block" />
              <Link to="/login" className="hidden h-9 items-center px-2 text-[15px] font-semibold text-text-muted transition-colors duration-150 hover:text-text sm:inline-flex">
                로그인
              </Link>
              <Link
                to="/signup"
                className="inline-flex h-9 items-center rounded-full border border-line-strong bg-panel/80 px-4 text-[15px] font-semibold text-text transition-colors duration-150 hover:border-text-muted hover:bg-panel"
              >
                회원가입
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
