// DESIGN.md §7-1 ② 복기: 보통 섹션(2026-11-19: 화면 고정을 없앴다). 그림이 화면에 들어오면 한 번 재생된다(기록 → 되감기 → 분기).
// 왼쪽 단계 3줄은 늘 보이고, 그림이 그 단계에 이르면 번호 칸이 켜진다. 움직임 줄이기는 마지막 장면으로 멈춘다. 척추 선은 여기서 b2로 갈라진다.
import { useRef, useState, type CSSProperties } from 'react'
import { cx } from '../../components/cx'
import { GlowBorder } from '../../components/fx'
import SectionHead, { Grad } from './SectionHead'
import { mockFrame } from './homeStyles'
import { MOTION_OK, ScrollTrigger, gsap, useGSAP } from './motion'

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
  const root = useRef<HTMLElement>(null)
  const tlRef = useRef<gsap.core.Timeline | null>(null)
  // 연출이 꺼진 환경(움직임 줄이기)에서는 모든 단계가 켜진 마지막 장면을 보여 준다
  const [animated, setAnimated] = useState(false)
  const [step, setStep] = useState(-1)
  const shown = animated ? step : SCENES.length - 1

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      const q = gsap.utils.selector(root)
      mm.add(MOTION_OK, () => {
        setAnimated(true)
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
        gsap.set(q('[data-evt]'), { opacity: 0, scale: 0, transformOrigin: 'center' })
        gsap.set(q('[data-marker]'), { opacity: 0, scale: 0.4, transformOrigin: '50% 50%' })
        gsap.set(q('[data-b2-node], [data-chip]'), { opacity: 0 })

        const scores = [...root.current!.querySelectorAll<SVGTextElement>('[data-score]')]
        const count = { v: 0 }
        const tl = gsap.timeline({ defaults: { ease: 'none' }, paused: true })
        // 1: 기록
        tl.to(proxy, { x: X1, duration: 1.6, ease: 'power1.inOut', onUpdate: draw }, 0).to(q('[data-evt]'), { opacity: 1, scale: 1, stagger: 0.1, duration: 0.2 }, 0.1)
        // 2: 되감기
        tl.to(proxy, { x: FORK, duration: 0.9, ease: 'power2.inOut', onUpdate: draw }, 1.9).to(q('[data-marker]'), { opacity: 1, scale: 1.25, duration: 0.4, ease: 'back.out(2)' }, 2.7)
        // 3: 분기
        tl.to(q('[data-b2-node]'), { opacity: 1, duration: 0.2 }, 3.3)
          .to(b2, { strokeDashoffset: 0, duration: 0.8, ease: 'power1.inOut' }, 3.35)
          .to(q('[data-chip]'), { opacity: 1, duration: 0.2, stagger: 0.08 }, 4.1)
          .to(count, { v: 1, duration: 0.6, ease: 'power2.out', onUpdate: () => scores.forEach((s) => (s.textContent = String(Math.round(Number(s.dataset.score) * count.v)))) }, 4.1)
        tlRef.current = tl
        return () => {
          tlRef.current = null
          setAnimated(false)
        }
      })
      // 그림이 화면에 들어오면 끝까지 한 번 재생하고 단계도 차례로 켠다
      mm.add(MOTION_OK, () => {
        ScrollTrigger.create({
          trigger: q('[data-visual]')[0],
          start: 'top 70%',
          once: true,
          onEnter: () => {
            tlRef.current?.play()
            ;[0, 1.9, 3.3].forEach((at, i) => gsap.delayedCall(at, () => setStep(i)))
          },
        })
      })
    },
    { scope: root },
  )

  return (
    <section ref={root} id="replay" className="relative pt-40 md:pl-[160px]">
      <div data-spine="replay" aria-hidden className="h-0" />
      <div className="relative">
      <SectionHead
        label="REPLAY"
        title={
          <>
            모든 순간이 기록되고,
            <br />
            <Grad>어디로든</Grad> 돌아갈 수 있어요
          </>
        }
        lead="풀이가 끝나도 끝이 아닙니다. 아쉬웠던 순간으로 돌아가 다른 선택으로 다시 풀어 볼 수 있습니다."
      />

      <div className="mt-16 grid items-start gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <ol className="grid gap-8 lg:pt-6">
          {SCENES.map((s, i) => (
            <li
              key={s.no}
              data-step={i}
              data-on={i <= shown}
              className="group flex gap-4 opacity-45 transition-opacity duration-300 data-[on=true]:opacity-100"
            >
              <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-md bg-brand-dim font-mono text-[15px] font-semibold text-brand transition-colors duration-300 group-data-[on=true]:bg-brand group-data-[on=true]:text-on-accent">
                {s.no}
              </span>
              <div>
                <p className="text-[19px] font-bold text-text">{s.title}</p>
                <p className="mt-1 text-[16px] leading-7 text-text-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div data-visual className="relative">
          <GlowBorder className="rounded-[28px]">
            <div className={cx(mockFrame, 'p-6 md:p-8')}>
              <Visual />
            </div>
          </GlowBorder>
        </div>
      </div>
      </div>
      <div data-spine="replay-end" aria-hidden className="absolute bottom-0 left-0" />
    </section>
  )
}
