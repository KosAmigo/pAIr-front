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
      { label: '회원가입', to: '/signup' },
      { label: '기업 회원가입', to: '/signup?type=company' },
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
      <div className="mx-auto max-w-[1264px] px-8 py-12">
        {/* 한 줄: 왼쪽 워드마크와 소개, 오른쪽 링크 묶음. 워드마크가 따로 줄을 차지하지 않는다 */}
        <div className="flex flex-wrap items-start gap-x-24 gap-y-10">
          <div className="max-w-[360px]">
            <p aria-hidden className="pointer-events-none font-mono text-[length:clamp(64px,8vw,112px)] leading-[0.85] font-semibold tracking-[-0.06em] select-none">
              <span className="text-line-strong">p</span>
              <span className="text-brand-gradient">AI</span>
              <span className="text-line-strong">r</span>
            </p>
            <p className="mt-5 text-[17px] leading-7 font-bold text-text">AI와 일하는 방식까지 평가하는 pAIr</p>
            <p className="mt-1 text-[15px] leading-6 text-text-muted">결과물과 풀이 과정을 함께 보는 AI 활용 역량 진단</p>
          </div>
          <nav aria-label="바닥글" className="ml-auto flex flex-wrap gap-x-20 gap-y-8 pt-2">
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
                          className="text-[15px] text-text-muted transition-colors duration-150 hover:text-text"
                        >
                          {l.label}
                        </a>
                      ) : (
                        <Link to={l.to} className="text-[15px] text-text-muted transition-colors duration-150 hover:text-text">
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

    </footer>
  )
}
