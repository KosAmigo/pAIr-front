// DESIGN.md §7-1 푸터: 낮은 한 줄. 왼쪽 pAIr 글자와 소개, 오른쪽 링크. 링크는 다른 화면으로 가는 것만 둔다
import { Link } from 'react-router-dom'

const GROUPS = [
  {
    title: '시작하기',
    links: [
      { label: '자가진단', to: '/tasks' },
      { label: '테스트 응시', to: '/entry' },
      { label: '내 기록', to: '/history' },
      { label: '회원가입', to: '/signup' },
      { label: '기업 도입 문의', to: '/signup?type=company' },
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
  return (
    <footer className="relative z-10 border-t border-line bg-panel/70 backdrop-blur">
      {/* 낮은 한 줄: 왼쪽 pAIr 글자와 한 줄 소개, 오른쪽 링크를 가로로. 묶음 사이는 세로 구분선 */}
      <div className="mx-auto flex max-w-[1264px] flex-wrap items-center gap-x-10 gap-y-5 px-8 py-8">
        <div className="flex items-center gap-4">
          <p aria-hidden className="pointer-events-none font-mono text-[40px] leading-none font-semibold tracking-[-0.06em] select-none">
            <span className="text-line-strong">p</span>
            <span className="text-brand-gradient">AI</span>
            <span className="text-line-strong">r</span>
          </p>
          <p className="text-[14px] leading-5 text-text-muted">
            <b className="font-semibold text-text">AI와 일하는 방식까지 평가합니다</b>
            <br />
            결과물과 풀이 과정을 함께 보는 AI 활용 역량 진단
          </p>
        </div>
        <nav aria-label="바닥글" className="ml-auto flex flex-wrap items-center gap-x-6 gap-y-3">
          {GROUPS.map((g, gi) => (
            <ul key={g.title} aria-label={g.title} className="flex flex-wrap items-center gap-x-5 gap-y-2">
              {gi > 0 && <li aria-hidden className="mr-1 h-4 w-px bg-line-strong" />}
              {g.links.map((l) => (
                <li key={l.label}>
                  <Link to={l.to} className="text-[14px] font-medium text-text-muted transition-colors duration-150 hover:text-text">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          ))}
        </nav>
      </div>
    </footer>
  )
}
