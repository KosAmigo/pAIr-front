// DESIGN.md §7-1 상단 바: 처음엔 투명, 80px 이상 내리면 유리 표면으로 바뀐다.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { LayoutDashboard } from 'lucide-react'
import { cx } from '../../components/cx'
import { Logo } from '../../components/ui'
import { scrollToId, useLenis } from './motion'

const LINKS = [
  { id: 'replay', label: '복기' },
  { id: 'report', label: '리포트' },
  { id: 'live', label: '실전 시험' },
  { id: 'create', label: '과제 생성' },
  { id: 'proctor', label: '감독' },
]

export default function HomeHeader() {
  const lenis = useLenis()
  const [scrolled, setScrolled] = useState(false)
  const [current, setCurrent] = useState<string | null>(null)

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 80)
      let cur: string | null = null
      for (const l of LINKS) {
        const el = document.getElementById(l.id)
        if (el && el.getBoundingClientRect().top < window.innerHeight * 0.4) cur = l.id
      }
      setCurrent(cur)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={cx(
        'sticky top-0 z-40 transition-[background-color,box-shadow,backdrop-filter] duration-200',
        scrolled ? 'glass rounded-none! border-x-0! border-t-0!' : 'border-b border-transparent',
      )}
    >
      <div className="mx-auto flex h-16 max-w-[1264px] items-center gap-6 px-8">
        <Logo className="text-[18px]" />
        <nav aria-label="소개 섹션" className="mx-auto hidden items-center gap-8 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.id}
              href={`#${l.id}`}
              onClick={(e) => {
                e.preventDefault()
                scrollToId(lenis, l.id)
              }}
              aria-current={current === l.id ? 'location' : undefined}
              className={cx(
                'relative text-[15px] font-medium transition-colors duration-150',
                current === l.id ? 'text-text' : 'text-text-muted hover:text-text',
              )}
            >
              {l.label}
              <span
                aria-hidden
                className={cx(
                  'absolute -bottom-2 left-1/2 size-1 -translate-x-1/2 rounded-full bg-brand transition-opacity duration-200',
                  current === l.id ? 'opacity-100' : 'opacity-0',
                )}
              />
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 md:ml-0">
          {/* 콘솔: 관리자는 과제(문제) 만들기, 기업 담당자는 회차와 감독 */}
          <Link
            to="/console"
            title="콘솔: 과제 만들기, 시험 회차와 감독"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line bg-panel/60 px-3 text-[15px] font-medium text-text-muted transition-colors duration-150 hover:border-line-strong hover:bg-panel-raised hover:text-text"
          >
            <LayoutDashboard size={16} aria-hidden /> 콘솔
          </Link>
          <Link
            to="/entry"
            className="hidden h-9 items-center rounded-md border border-line-strong bg-panel px-3.5 text-[15px] font-semibold text-text transition-colors duration-150 hover:border-text-muted hover:bg-panel-raised sm:inline-flex"
          >
            테스트 응시
          </Link>
          <Link
            to="/tasks"
            className="bg-brand-gradient inline-flex h-9 items-center rounded-md px-3.5 text-[15px] font-semibold text-on-accent hover:shadow-[0_8px_24px_-6px_rgb(108_71_255/0.45)]"
          >
            자가진단 시작
          </Link>
        </div>
      </div>
    </header>
  )
}
