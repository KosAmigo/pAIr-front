// DESIGN.md §7-1 ③ 6가지 역량 리포트: 육각 레이더가 그려지고 총점이 올라간다. 항목은 색으로 구분한다(§1.5).
import { useRef, useState } from 'react'
import { ListTree, Rocket, ShieldCheck, Sparkles, Split, TrendingUp } from 'lucide-react'
import { cx } from '../../components/cx'
import SectionHead, { Grad } from './SectionHead'
import { MOTION_OK, gsap, useGSAP } from './motion'

const ITEMS = [
  { key: 'usage', name: 'AI 활용력', max: 20, score: 18, color: 'var(--color-branch-2)', icon: Sparkles, desc: '필요한 순간에 AI를 불러 맞는 질문을 던지는가' },
  { key: 'control', name: 'AI 통제력', max: 15, score: 13, color: 'var(--color-branch-3)', icon: ShieldCheck, desc: 'AI의 답을 그대로 믿지 않고 확인하는가' },
  { key: 'decomposition', name: '문제 분해력', max: 10, score: 8, color: 'var(--color-branch-4)', icon: ListTree, desc: '큰 문제를 AI에게 맡길 단위로 나누는가' },
  { key: 'delegation', name: '위임 판단력', max: 10, score: 9, color: 'var(--color-comp-7)', icon: Split, desc: '맡길 일과 직접 할 일을 가려내는가' },
  { key: 'delivery', name: 'AI 결과 도출력', max: 30, score: 26, color: 'var(--color-branch-5)', icon: Rocket, desc: '끝내 돌아가는 결과물을 만들어 내는가' },
  { key: 'potential', name: '성과 잠재력', max: 15, score: 14, color: 'var(--color-comp-6)', icon: TrendingUp, desc: '다음에 더 잘할 수 있는 습관을 보였는가' },
]
const TOTAL = ITEMS.reduce((n, i) => n + i.score, 0)

const CX = 220
const CY = 210
const R = 150
const ang = (i: number) => ((-90 + i * 60) * Math.PI) / 180
const pt = (i: number, r: number) => [CX + r * Math.cos(ang(i)), CY + r * Math.sin(ang(i))] as const
const poly = (f: (i: number) => number) => ITEMS.map((_, i) => pt(i, f(i)).join(',')).join(' ')

function Radar({ hover }: { hover: string | null }) {
  return (
    <svg viewBox="0 0 440 420" className="w-full max-w-[480px]" role="img" aria-label={`6가지 역량 점수 레이더 차트, 총점 ${TOTAL}점`}>
      {[1, 2 / 3, 1 / 3].map((k) => (
        <polygon key={k} points={poly(() => R * k)} fill={k === 1 ? 'var(--color-panel)' : 'none'} stroke="var(--color-line)" strokeWidth={1} />
      ))}
      {ITEMS.map((it, i) => {
        const [x, y] = pt(i, R)
        const on = hover === it.key
        return (
          <line
            key={it.key}
            data-axis
            x1={CX}
            y1={CY}
            x2={x}
            y2={y}
            stroke={on ? it.color : 'var(--color-line-strong)'}
            strokeWidth={on ? 3 : 1}
            className="transition-[stroke,stroke-width] duration-200"
          />
        )
      })}
      <polygon
        data-shape
        points={poly((i) => (R * ITEMS[i].score) / ITEMS[i].max)}
        fill="var(--color-brand)"
        fillOpacity={0.16}
        stroke="var(--color-brand)"
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      {ITEMS.map((it, i) => {
        const [x, y] = pt(i, (R * it.score) / it.max)
        return <circle key={it.key} data-pt cx={x} cy={y} r={hover === it.key ? 7 : 5} fill={it.color} stroke="var(--color-panel)" strokeWidth={2} />
      })}
      {ITEMS.map((it, i) => {
        const [x, y] = pt(i, R + 26)
        return (
          <text
            key={it.key}
            x={x}
            y={y + 5}
            textAnchor={Math.abs(x - CX) < 4 ? 'middle' : x > CX ? 'start' : 'end'}
            className={cx('text-[14px] font-semibold transition-colors', hover === it.key ? 'fill-text' : 'fill-text-muted')}
          >
            {it.name}
          </text>
        )
      })}
      <circle cx={CX} cy={CY} r={44} fill="var(--color-panel)" stroke="var(--color-line)" />
      <text data-total x={CX} y={CY + 10} textAnchor="middle" className="tnum fill-text font-mono text-[32px] font-semibold">
        {TOTAL}
      </text>
      <text x={CX} y={CY + 28} textAnchor="middle" className="fill-text-faint font-mono text-[11px]">
        / 100
      </text>
    </svg>
  )
}

export default function ReportSection() {
  const root = useRef<HTMLElement>(null)
  const [hover, setHover] = useState<string | null>(null)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION_OK, () => {
        const q = gsap.utils.selector(root)
        const total = root.current!.querySelector<SVGTextElement>('[data-total]')!
        const n = { v: 0 }
        const tl = gsap.timeline({ scrollTrigger: { trigger: q('[data-radar]')[0], start: 'top 75%' } })
        tl.from(q('[data-axis]'), { scale: 0, svgOrigin: `${CX} ${CY}`, duration: 0.6, stagger: 0.06, ease: 'expo.out' })
          .from(q('[data-shape]'), { scale: 0, svgOrigin: `${CX} ${CY}`, opacity: 0, duration: 1, ease: 'expo.out' }, 0.25)
          .from(q('[data-pt]'), { opacity: 0, scale: 0, transformOrigin: 'center', stagger: 0.06, duration: 0.4, ease: 'back.out(2)' }, 0.6)
          .to(n, { v: TOTAL, duration: 1.2, ease: 'power2.out', onUpdate: () => (total.textContent = String(Math.round(n.v))) }, 0.25)
        gsap.from(q('[data-card]'), {
          y: 40,
          opacity: 0,
          duration: 0.7,
          stagger: 0.08,
          ease: 'expo.out',
          scrollTrigger: { trigger: q('[data-cards]')[0], start: 'top 80%' },
        })
      })
    },
    { scope: root },
  )

  return (
    <section ref={root} id="report" className="relative pt-40 md:pl-[120px]">
      <div data-spine="report" aria-hidden className="h-0" />
      <SectionHead
        label="REPORT"
        title={
          <>
            결과물만이 아니라
            <br />
            <Grad>과정 전체</Grad>를 채점합니다
          </>
        }
        lead="AI와 나눈 대화, 코드 변화, 실행 기록을 근거로 6가지 역량을 100점 만점으로 평가합니다. 감점마다 근거가 된 대화 턴을 함께 보여줍니다."
      />
      <div className="mt-16 grid items-center gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div data-radar className="flex justify-center">
          <Radar hover={hover} />
        </div>
        <ul data-cards className="grid gap-3 sm:grid-cols-2">
          {ITEMS.map((it) => (
            <li
              key={it.key}
              data-card
              onMouseEnter={() => setHover(it.key)}
              onMouseLeave={() => setHover(null)}
              className={cx(
                'glass rounded-2xl p-5 transition-[transform,box-shadow] duration-200',
                hover === it.key && '-translate-y-1 shadow-md',
              )}
            >
              <div className="flex items-center gap-3">
                <span
                  className="inline-flex size-10 items-center justify-center rounded-md"
                  style={{ background: `color-mix(in srgb, ${it.color} 12%, transparent)`, color: it.color }}
                >
                  <it.icon size={22} strokeWidth={1.75} aria-hidden />
                </span>
                <span className="text-[17px] font-bold text-text">{it.name}</span>
                <span className="tnum ml-auto font-mono text-[13px] text-text-muted">{it.max}점</span>
              </div>
              <p className="mt-3 text-[15px] leading-6 text-text-muted">{it.desc}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
