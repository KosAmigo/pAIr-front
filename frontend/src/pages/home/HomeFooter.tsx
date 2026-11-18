// DESIGN.md §7-1 푸터 (2026-11-18 개편): 링크 묶음 + 화면 폭을 꽉 채우는 큰 pAIr 글자
import { Link } from 'react-router-dom'
import { scrollToId, useLenis } from './motion'

const GROUPS = [
  {
    title: '시작하기',
    links: [
      { label: '자가진단', to: '/tasks' },
      { label: '테스트 응시', to: '/entry' },
      { label: '내 기록', to: '/history' },
    ],
  },
  {
    title: '둘러보기',
    links: [
      { label: '복기', anchor: 'replay' },
      { label: '리포트', anchor: 'report' },
      { label: '과제 생성', anchor: 'create' },
      { label: '감독', anchor: 'proctor' },
    ],
  },
  {
    title: '운영',
    links: [
      { label: '콘솔', to: '/console' },
      { label: '채점 툴', to: '/grader' },
    ],
  },
] as const

export default function HomeFooter() {
  const lenis = useLenis()
  return (
    <footer className="relative z-10 overflow-hidden border-t border-line bg-panel/70 backdrop-blur">
      <div className="mx-auto max-w-[1264px] px-8 pt-12">
        <div className="flex flex-wrap gap-x-24 gap-y-10">
          <div className="max-w-[320px]">
            <p className="text-[20px] leading-7 font-bold tracking-[-0.02em] text-text">
              AI와 일하는 방식까지
              <br />
              평가하는 pAIr
            </p>
            <p className="mt-3 text-[15px] leading-6 text-text-muted">결과물과 풀이 과정을 함께 보는 AI 활용 역량 진단</p>
          </div>
          <nav aria-label="바닥글" className="ml-auto flex flex-wrap gap-x-20 gap-y-8">
            {GROUPS.map((g) => (
              <div key={g.title}>
                <p className="text-[14px] font-bold text-text">{g.title}</p>
                <ul className="mt-3 flex flex-col gap-2">
                  {g.links.map((l) => (
                    <li key={l.label}>
                      {'anchor' in l ? (
                        <a
                          href={`#${l.anchor}`}
                          onClick={(e) => {
                            e.preventDefault()
                            scrollToId(lenis, l.anchor)
                          }}
                          className="text-[15px] text-text-muted transition-colors hover:text-brand"
                        >
                          {l.label}
                        </a>
                      ) : (
                        <Link to={l.to} className="text-[15px] text-text-muted transition-colors hover:text-brand">
                          {l.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
      </div>

      {/* 큰 워드마크: 아래가 살짝 잘리게 */}
      <div aria-hidden className="mt-10 -mb-[0.2em] text-center font-mono text-[length:clamp(72px,12vw,176px)] leading-[0.9] font-semibold tracking-[-0.06em] select-none">
        <span className="bg-[linear-gradient(180deg,var(--color-line-strong),transparent_85%)] bg-clip-text text-transparent">p</span>
        <span className="text-brand-gradient">AI</span>
        <span className="bg-[linear-gradient(180deg,var(--color-line-strong),transparent_85%)] bg-clip-text text-transparent">r</span>
      </div>

      <div className="relative border-t border-line bg-panel">
        <div className="mx-auto flex h-12 max-w-[1264px] items-center gap-4 px-8 font-mono text-[13px] text-text-faint">
          <span>v0.1 PROTOTYPE</span>
          <span className="ml-auto">© 2026 pAIr</span>
        </div>
      </div>
    </footer>
  )
}
