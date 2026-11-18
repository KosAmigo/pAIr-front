// DESIGN.md §7-1 ② 복기: 화면에 붙은 채(sticky) 스크롤로 장면 세 개를 넘긴다.
// 기록 → 되감기 → 분기. 같은 순간 페이지의 척추 선도 b2로 갈라진다.
import { useRef, type CSSProperties } from 'react'
import { useReducedMotion } from 'motion/react'
import { cx } from '../../components/cx'
import SectionHead, { Grad } from './SectionHead'
import { MOTION_OK, gsap, useGSAP } from './motion'

const SCENES = [
  { no: '01', title: '모든 순간이 기록됩니다', body: '코드 수정, 실행, AI와 나눈 대화가 시간 순서대로 남습니다.' },
  { no: '02', title: '아쉬웠던 순간으로 되돌아가', body: '리포트가 짚어 준 결정적 순간을 골라, 그 시점의 파일과 대화로 돌아갑니다.' },
  { no: '03', title: '다른 선택으로 다시 풀어보세요', body: '새 분기에서 다시 풀고, 처음 풀이와 점수를 나란히 비교합니다.' },
]

// SVG 좌표 (viewBox 560 × 360)
const X0 = 40
const X1 = 520
const FORK = 304 // 결정적 순간 = 타임라인 55% 지점
const AXIS_Y = 92
const MAIN_Y = 230
const B2_Y = 290
const AI_DOTS = [84, 150, 214, 262, 352, 418, 470]
const RUNS = [118, 236, 330, 396, 452, 500]
const CHECKS = [X0, 128, 214, FORK, 410]

const clock = (x: number) => {
  const s = Math.round(((x - X0) / (X1 - X0)) * (52 * 60 + 18))
  return `00:${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

function Visual() {
  return (
    <svg viewBox="0 0 560 360" className="w-full" role="img" aria-label="풀이 타임라인을 되감아 결정적 순간에서 새 분기를 만들고, 처음 풀이 72점과 새 풀이 88점을 비교하는 그림">
      {/* 타임라인 */}
      <text x={X0} y={36} className="fill-text-muted font-mono text-[12px] tracking-[0.08em]">
        TIMELINE
      </text>
      <text data-clock x={X1} y={36} textAnchor="end" className="tnum fill-text font-mono text-[14px] font-semibold">
        {clock(X1)}
      </text>
      <line x1={X0} y1={AXIS_Y} x2={X1} y2={AXIS_Y} stroke="var(--color-line)" strokeWidth={4} strokeLinecap="round" />
      <line data-fill x1={X0} y1={AXIS_Y} x2={X1} y2={AXIS_Y} stroke="var(--color-brand)" strokeWidth={4} strokeLinecap="round" />
      {AI_DOTS.map((x) => (
        <circle key={x} data-evt cx={x} cy={AXIS_Y - 18} r={4.5} fill="var(--color-info)" />
      ))}
      {RUNS.map((x) => (
        <rect key={x} data-evt x={x - 3.5} y={AXIS_Y + 14} width={7} height={7} rx={1.5} fill="var(--color-text-muted)" />
      ))}
      {/* 결정적 순간 마커 */}
      <g data-marker transform={`translate(${FORK} ${AXIS_Y - 44})`}>
        <rect x={-8} y={-8} width={16} height={16} rx={2} transform="rotate(45)" fill="var(--color-caution)" className="glow-svg" style={{ '--glow': 'var(--color-caution)' } as CSSProperties} />
        <text y={-18} textAnchor="middle" className="fill-caution font-mono text-[11px] font-semibold">
          00:23:41
        </text>
      </g>
      {/* 재생 머리 */}
      <g data-playhead transform={`translate(${X1} 0)`}>
        <line y1={AXIS_Y - 30} y2={AXIS_Y + 30} stroke="var(--color-text)" strokeWidth={1.5} />
        <circle cy={AXIS_Y} r={7} fill="var(--color-panel)" stroke="var(--color-text)" strokeWidth={2} />
      </g>

      {/* 미니 복기 트리 */}
      <text x={X0} y={MAIN_Y - 44} className="fill-text-muted font-mono text-[12px] tracking-[0.08em]">
        BRANCHES
      </text>
      <line x1={X0} y1={MAIN_Y} x2={X1} y2={MAIN_Y} stroke="var(--color-branch-1)" strokeWidth={3} strokeLinecap="round" />
      {CHECKS.map((x) => (
        <circle key={x} cx={x} cy={MAIN_Y} r={5} fill="var(--color-panel)" stroke="var(--color-branch-1)" strokeWidth={3} />
      ))}
      <text x={X0} y={MAIN_Y + 24} className="fill-text-muted font-mono text-[12px]">
        main
      </text>
      <path
        data-b2
        d={`M ${FORK} ${MAIN_Y} L ${FORK + (B2_Y - MAIN_Y)} ${B2_Y} L ${X1} ${B2_Y}`}
        fill="none"
        stroke="var(--color-branch-2)"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <g data-b2-node>
        <circle cx={FORK} cy={MAIN_Y} r={7} fill="var(--color-branch-2)" className="glow-svg" style={{ '--glow': 'var(--color-branch-2)' } as CSSProperties} />
        <text x={FORK + (B2_Y - MAIN_Y) + 8} y={B2_Y + 24} className="fill-text-muted font-mono text-[12px]">
          b2
        </text>
      </g>
      {[
        { y: MAIN_Y, c: 'var(--color-branch-1)', score: 72, key: 'main' },
        { y: B2_Y, c: 'var(--color-branch-2)', score: 88, key: 'b2' },
      ].map((e) => (
        <g key={e.key} data-chip transform={`translate(${X1} ${e.y})`}>
          <rect x={-2} y={-13} width={40} height={26} rx={6} fill={e.c} />
          <text data-score={e.score} x={18} y={5} textAnchor="middle" className="tnum fill-on-accent font-mono text-[13px] font-semibold">
            {e.score}
          </text>
        </g>
      ))}
      <text data-chip x={X1 + 38} y={B2_Y + 34} textAnchor="end" className="fill-signal font-mono text-[12px] font-semibold">
        +16
      </text>
    </svg>
  )
}

export default function ReplaySection() {
  const reduced = useReducedMotion()
  const root = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION_OK, () => {
        const q = gsap.utils.selector(root)
        const proxy = { x: X0 }
        const fill = root.current!.querySelector<SVGLineElement>('[data-fill]')!
        const head = root.current!.querySelector<SVGGElement>('[data-playhead]')!
        const clockEl = root.current!.querySelector<SVGTextElement>('[data-clock]')!
        const draw = () => {
          fill.setAttribute('x2', String(proxy.x))
          head.setAttribute('transform', `translate(${proxy.x} 0)`)
          clockEl.textContent = clock(proxy.x)
        }
        draw()
        const b2 = root.current!.querySelector<SVGPathElement>('[data-b2]')!
        const len = b2.getTotalLength()
        gsap.set(b2, { strokeDasharray: len, strokeDashoffset: len })
        gsap.set(q('[data-scene]').slice(1), { opacity: 0, y: 28 })
        gsap.set(q('[data-evt]'), { opacity: 0, scale: 0, transformOrigin: 'center' })
        gsap.set(q('[data-marker]'), { opacity: 0, scale: 0.4, transformOrigin: '50% 50%' })
        gsap.set(q('[data-b2-node], [data-chip]'), { opacity: 0 })
        gsap.set(q('[data-bar]'), { scaleX: 0, transformOrigin: 'left' })

        const scores = [...root.current!.querySelectorAll<SVGTextElement>('[data-score]')]
        const count = { v: 0 }
        const tl = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: { trigger: root.current, start: 'top top', end: 'bottom bottom', scrub: 0.8 },
        })
        // 장면 1: 기록
        tl.to(proxy, { x: X1, duration: 1, onUpdate: draw }, 0)
          .to(q('[data-evt]'), { opacity: 1, scale: 1, stagger: 0.07, duration: 0.15 }, 0.05)
          .to(q('[data-bar="0"]'), { scaleX: 1, duration: 1 }, 0)
          // 장면 2: 되감기
          .to(q('[data-scene="0"]'), { opacity: 0, y: -28, duration: 0.2 }, 1)
          .to(q('[data-scene="1"]'), { opacity: 1, y: 0, duration: 0.25 }, 1.1)
          .to(proxy, { x: FORK, duration: 0.7, ease: 'power1.inOut', onUpdate: draw }, 1.1)
          .to(q('[data-marker]'), { opacity: 1, scale: 1.25, duration: 0.3, ease: 'back.out(2)' }, 1.6)
          .to(q('[data-bar="1"]'), { scaleX: 1, duration: 1 }, 1)
          // 장면 3: 분기
          .to(q('[data-scene="1"]'), { opacity: 0, y: -28, duration: 0.2 }, 2)
          .to(q('[data-scene="2"]'), { opacity: 1, y: 0, duration: 0.25 }, 2.1)
          .to(q('[data-b2-node]'), { opacity: 1, duration: 0.15 }, 2.1)
          .to(b2, { strokeDashoffset: 0, duration: 0.5 }, 2.15)
          .to(q('[data-chip]'), { opacity: 1, duration: 0.15, stagger: 0.05 }, 2.6)
          .to(
            count,
            {
              v: 1,
              duration: 0.35,
              onUpdate: () => scores.forEach((s) => (s.textContent = String(Math.round(Number(s.dataset.score) * count.v)))),
            },
            2.6,
          )
          .to(q('[data-bar="2"]'), { scaleX: 1, duration: 1 }, 2)
          .to({}, { duration: 0.25 }) // 마지막 장면을 잠깐 붙잡아 둔다
      })
    },
    { scope: root },
  )

  return (
    <section ref={root} id="replay" className={cx('relative', !reduced && 'h-[320vh]')}>
      <div data-spine="replay" aria-hidden className="h-0" />
      <div aria-hidden data-spine="replay-end" className={cx('absolute left-0', reduced ? 'bottom-0' : 'bottom-[30vh]')} />
      <div className={cx('flex items-center md:pl-[120px]', !reduced && 'sticky top-0 h-screen')}>
        <div className="grid w-full items-center gap-12 py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <div>
            <SectionHead
              compact
              label="REPLAY"
              title={
                <>
                  모든 순간이 기록되고,
                  <br />
                  <Grad>어디로든</Grad> 돌아갈 수 있어요
                </>
              }
            />
            <div className={cx('relative mt-12', reduced ? 'space-y-8' : 'h-[150px]')}>
              {SCENES.map((s, i) => (
                <div key={s.no} data-scene={i} className={cx(!reduced && 'absolute inset-0')}>
                  <p className="font-mono text-[14px] font-semibold text-brand">{s.no}</p>
                  <h3 className="mt-2 text-[28px] leading-9 font-bold tracking-[-0.02em] text-text">{s.title}</h3>
                  <p className="mt-3 max-w-[440px] text-[17px] leading-7 text-text-muted">{s.body}</p>
                </div>
              ))}
            </div>
            {!reduced && (
              <div className="mt-6 flex max-w-[280px] gap-2" aria-hidden>
                {SCENES.map((s, i) => (
                  <span key={s.no} className="h-1 flex-1 overflow-hidden rounded-full bg-line">
                    <span data-bar={i} className="block h-full w-full rounded-full bg-brand-gradient" />
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-[28px] border border-line bg-panel p-6 shadow-lg md:p-8">
            <Visual />
          </div>
        </div>
      </div>
    </section>
  )
}
