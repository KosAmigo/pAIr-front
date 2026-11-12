import { Link } from 'react-router-dom'
import { ArrowRight, FlaskConical, History, TicketCheck } from 'lucide-react'
import { cx, Logo, Sep } from '../components/ui'

// DESIGN.md §7-1 초기화면
const tiles = [
  {
    to: '/tasks',
    over: 'SELF-CHECK',
    overCls: 'text-info',
    hover: 'hover:border-info focus-visible:border-info',
    title: '자가진단',
    desc: ['혼자 바로 응시하고 결과 리포트를 받습니다.', '원하는 시점으로 되돌아가 다시 풀어볼 수 있습니다.'],
    meta: ['복기 가능', '리포트 제공'],
    icon: History,
  },
  {
    to: '/entry',
    over: 'LIVE EXAM',
    overCls: 'text-alert',
    hover: 'hover:border-alert focus-visible:border-alert',
    title: '테스트 응시',
    desc: ['기업이 발급한 입장 코드나 메일 링크로 입장합니다.', '감독 환경에서 다른 응시자와 동시에 진행됩니다.'],
    meta: ['입장 코드 또는 메일 링크', '감독 진행'],
    icon: TicketCheck,
  },
]

export default function Home() {
  return (
    <div className="dot-grid flex min-h-full flex-col">
      <header className="flex h-14 items-center px-12">
        <Logo />
        {/* 채점 툴: 아이콘만 */}
        <Link
          to="/grader"
          aria-label="채점 툴"
          title="채점 툴"
          className="ml-auto inline-flex size-9 items-center justify-center rounded-md border border-line text-text-muted transition-colors duration-[120ms] hover:border-line-strong hover:bg-panel-raised hover:text-text"
        >
          <FlaskConical size={18} aria-hidden />
        </Link>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-12 pb-24">
        <h1 className="text-center text-hero font-bold tracking-[-0.02em] text-text">
          AI와 함께 일하는 방식까지
          <br />
          평가합니다
        </h1>
        <p className="mt-4 max-w-[560px] text-center text-[16px] leading-6 text-text-muted">
          결과물만이 아니라 AI 활용, 통제, 재현성까지 과정 전체를 기록합니다.
          <br />
          실전 시험 전에 같은 환경에서 먼저 연습해 보세요.
        </p>

        <div className="mt-12 flex gap-4">
          {tiles.map((t) => (
            <Link
              key={t.title}
              to={t.to}
              className={cx(
                'group flex h-[280px] w-[440px] flex-col rounded-lg border border-line bg-panel p-8 transition-colors duration-[120ms] ease-out',
                t.hover,
              )}
            >
              <div className="flex items-center justify-between">
                <span className={cx('label', t.overCls)}>{t.over}</span>
                <t.icon size={22} strokeWidth={1.75} className="text-text-muted" aria-hidden />
              </div>
              <h2 className="mt-6 text-h1 font-bold text-text">{t.title}</h2>
              <p className="mt-2 text-[16px] leading-6 text-text-muted">
                {t.desc[0]}
                <br />
                {t.desc[1]}
              </p>
              <div className="mt-auto flex items-center gap-3 border-t border-line pt-4">
                {t.meta.map((m, i) => (
                  <span key={m} className="flex items-center gap-3 font-mono text-[13px] text-text-muted">
                    {i > 0 && <Sep />}
                    {m}
                  </span>
                ))}
                <ArrowRight
                  size={20}
                  className="ml-auto text-text-muted transition-transform duration-[120ms] group-hover:translate-x-1 group-hover:text-text"
                  aria-hidden
                />
              </div>
            </Link>
          ))}
        </div>
      </main>

      <footer className="flex h-12 items-center gap-6 border-t border-line px-12 font-mono text-[13px] text-text-faint">
        <span>v0.1 PROTOTYPE</span>
        <span className="ml-auto">© 2026 pAIr</span>
      </footer>
    </div>
  )
}
