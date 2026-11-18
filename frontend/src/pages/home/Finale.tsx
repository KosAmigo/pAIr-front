// DESIGN.md §7-1 ⑤ 마무리 (2026-11-18 2차 개편): 밝은 배경 위 화면 폭을 채우는 큰 글자 줄 버튼 두 개.
// 마우스를 올리면 색이 왼쪽에서 오른쪽으로 차오르고, 글자가 밀리며 흰색이 된다.
// 척추 선은 줄기를 따라 내려오다 각 줄의 가운데 높이에서 오른쪽으로 꺾여 줄에 닿는다.
import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { cx } from '../../components/cx'
import SectionHead, { Grad } from './SectionHead'
import { MOTION_OK, gsap, useGSAP } from './motion'

const ROWS = [
  {
    to: '/tasks',
    anchor: 'card-self',
    no: '01',
    over: 'SELF-CHECK',
    text: '자가진단 시작하기',
    desc: '혼자 바로 풀고 리포트를 받습니다. 아쉬운 시점으로 되돌아가 다시 풀 수 있습니다.',
    fill: 'bg-brand-gradient',
    accent: 'text-brand',
  },
  {
    to: '/entry',
    anchor: 'card-live',
    no: '02',
    over: 'LIVE EXAM',
    text: '테스트 응시하기',
    desc: '기업이 보낸 입장 코드나 메일 링크로 들어갑니다. 감독 환경에서 동시에 진행됩니다.',
    fill: 'bg-ink',
    accent: 'text-alert',
  },
]

export default function Finale() {
  const root = useRef<HTMLElement>(null)
  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION_OK, () => {
        gsap.from('[data-row-inner]', {
          yPercent: 60,
          opacity: 0,
          duration: 1,
          stagger: 0.15,
          ease: 'expo.out',
          scrollTrigger: { trigger: '[data-rows]', start: 'top 80%' },
        })
        gsap.from('[data-row-line]', {
          scaleX: 0,
          transformOrigin: 'left',
          duration: 1.2,
          stagger: 0.15,
          ease: 'expo.out',
          scrollTrigger: { trigger: '[data-rows]', start: 'top 85%' },
        })
      })
    },
    { scope: root },
  )

  return (
    <section ref={root} className="relative pt-40 pb-32">
      <div data-spine="finale" aria-hidden className="h-0" />
      <SectionHead
        className="md:pl-[120px]"
        label="GET STARTED"
        title={
          <>
            지금, <Grad>어느 쪽</Grad>으로
            <br />
            시작할까요?
          </>
        }
      />

      <ul data-rows className="mt-20 md:pl-[120px]">
        {ROWS.map((r, i) => (
          <li key={r.to} className="relative">
            <div data-spine={r.anchor} aria-hidden className="absolute top-1/2 left-0" />
            <span data-row-line aria-hidden className="absolute inset-x-0 top-0 h-px bg-line-strong" />
            {i === ROWS.length - 1 && <span data-row-line aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-line-strong" />}
            <Link to={r.to} className="group relative block overflow-hidden">
              {/* 호버하면 왼쪽에서 차오르는 색 */}
              <span
                aria-hidden
                className={cx(
                  'absolute inset-0 origin-left scale-x-0 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-x-100 group-focus-visible:scale-x-100',
                  r.fill,
                )}
              />
              <span data-row-inner className="relative flex items-center gap-6 py-10 pr-4 pl-2 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-6 md:py-12">
                <span className="flex w-28 shrink-0 flex-col gap-1 max-md:hidden">
                  <span className="tnum font-mono text-[14px] font-semibold text-text-faint transition-colors group-hover:text-white/60">{r.no}</span>
                  <span className={cx('font-mono text-[12px] font-semibold tracking-[0.1em] transition-colors group-hover:text-white/80', r.accent)}>{r.over}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[length:clamp(44px,6.4vw,104px)] leading-[1] font-extrabold tracking-[-0.05em] text-text transition-colors duration-300 group-hover:text-on-accent">
                    {r.text}
                  </span>
                  <span className="mt-4 block max-w-[560px] text-[17px] leading-7 text-text-muted transition-colors duration-300 group-hover:text-white/80">{r.desc}</span>
                </span>
                <span className="inline-flex size-20 shrink-0 items-center justify-center rounded-full border border-line-strong text-text transition-[transform,background-color,color,border-color] duration-500 group-hover:rotate-45 group-hover:border-transparent group-hover:bg-white group-hover:text-text max-md:size-14">
                  <ArrowUpRight size={34} strokeWidth={1.75} aria-hidden />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-10 text-[15px] text-text-muted md:pl-[120px]">
        기업 담당자이신가요? 시험 회차와 감독은{' '}
        <Link to="/console" className="font-semibold text-brand underline-offset-4 hover:underline">
          콘솔
        </Link>
        에서 다룹니다.
      </p>
    </section>
  )
}
