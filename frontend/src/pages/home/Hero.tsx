// DESIGN.md §7-1 ① 히어로: 큰 제목(글자 단위 등장) + 기울어진 시험 화면 데모가 스크롤에 따라 똑바로 선다.
import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BarChart3, Bug, ClipboardCheck, FileText, FlaskConical, MessageSquareText, Search, Wrench } from 'lucide-react'
import DemoWindow from './DemoWindow'
import { MOTION_OK, SplitText, gsap, useGSAP } from './motion'

const KINDS = [
  { label: '장애 분석', icon: Bug },
  { label: '기능 구현', icon: Wrench },
  { label: '리팩터링', icon: FlaskConical },
  { label: '테스트 작성', icon: ClipboardCheck },
  { label: '기획서', icon: FileText },
  { label: '데이터 해석', icon: BarChart3 },
  { label: '리서치 요약', icon: Search },
  { label: '고객 응대 문서', icon: MessageSquareText },
]

const FLOAT_CHIPS = [
  { text: 'AI 질문', meta: '#T07', cls: 'left-[-2%] top-[18%]', speed: 1.4, dot: 'bg-info' },
  { text: '테스트 통과', meta: '12 / 12', cls: 'right-[-3%] top-[8%]', speed: 0.8, dot: 'bg-signal' },
  { text: '역량 점수', meta: '88', cls: 'right-[4%] bottom-[14%]', speed: 1.8, dot: 'bg-brand' },
]

export const pillPrimary =
  'bg-brand-gradient inline-flex h-14 items-center gap-2 rounded-full px-7 text-[16px] font-semibold text-on-accent shadow-[0_12px_32px_-10px_rgb(108_71_255/0.6)] transition-[box-shadow,transform,background-position] hover:shadow-[0_16px_40px_-8px_rgb(108_71_255/0.7)] active:scale-[0.98]'
export const pillSecondary =
  'inline-flex h-14 items-center gap-2 rounded-full border border-line-strong bg-panel/80 px-7 text-[16px] font-semibold text-text backdrop-blur transition-colors hover:border-text-muted hover:bg-panel active:scale-[0.98]'

export default function Hero() {
  const root = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION_OK, () => {
        const splits = gsap.utils.toArray<HTMLElement>('[data-split]').map((el) => SplitText.create(el, { type: 'words,chars' }))
        const chars = splits.flatMap((s) => s.chars)
        const tl = gsap.timeline({
          defaults: { ease: 'expo.out' },
          onComplete: () => splits.forEach((s) => s.revert()),
        })
        tl.from(
            [...chars, '[data-hero-grad]'],
            { yPercent: 60, rotateX: -50, opacity: 0, duration: 0.9, stagger: 0.022, transformOrigin: '50% 100%' },
            0.1,
          )
          .from('[data-hero-sub] > *', { y: 24, opacity: 0, duration: 0.8, stagger: 0.08 }, 0.45)
          .from('[data-hero-demo]', { y: 80, opacity: 0, duration: 1.2 }, 0.55)

        // 데모 창: 기울어진 상태 → 스크롤하면 똑바로
        gsap.fromTo(
          '[data-hero-tilt]',
          { rotateX: 24, scale: 0.88 },
          {
            rotateX: 0,
            scale: 1,
            ease: 'none',
            scrollTrigger: { trigger: '[data-hero-demo]', start: 'top 90%', end: 'top 12%', scrub: 0.6 },
          },
        )
        // 떠 있는 칩: 서로 다른 속도 (패럴랙스)
        gsap.utils.toArray<HTMLElement>('[data-float]').forEach((el) => {
          gsap.to(el, {
            yPercent: -60 * Number(el.dataset.float),
            ease: 'none',
            scrollTrigger: { trigger: root.current, start: 'top top', end: 'bottom top', scrub: true },
          })
        })
      })
    },
    { scope: root },
  )

  return (
    <section ref={root} className="relative pt-16 md:pt-24">
      <div data-spine="hero" aria-hidden className="h-0" />
      <div className="flex flex-col items-center text-center">
        <h1 className="mt-4 text-[length:var(--text-mega)] leading-[1.02] font-extrabold tracking-[-0.045em] text-text [perspective:800px]">
          <span data-split>AI와 </span>
          <span data-hero-grad className="text-brand-gradient inline-block pb-[0.08em]">
            일하는 방식
          </span>
          <span data-split>까지</span>
          <br />
          <span data-split>평가합니다</span>
        </h1>

        <div data-hero-sub className="flex flex-col items-center">
          <p className="mt-7 max-w-[600px] text-[20px] leading-8 text-text-muted">
            결과물만이 아니라 AI 활용, 통제, 판단까지 풀이 과정 전체를 기록합니다.
            <br className="max-md:hidden" />
            실전 시험 전에 같은 환경에서 먼저 연습해 보세요.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link to="/tasks" className={pillPrimary}>
              자가진단 시작 <ArrowRight size={18} aria-hidden />
            </Link>
            <Link to="/entry" className={pillSecondary}>
              테스트 응시
            </Link>
          </div>
        </div>
      </div>

      {/* 시험 화면 데모 */}
      <div data-hero-demo className="relative mx-auto mt-20 w-full md:w-[min(1080px,calc(100%-160px))] [perspective:1600px]">
        <div aria-hidden className="absolute inset-x-[8%] top-[10%] bottom-0 rounded-full bg-brand/25 blur-[100px]" />
        <div data-hero-tilt className="relative origin-[50%_0%] will-change-transform">
          <DemoWindow />
        </div>
        {FLOAT_CHIPS.map((c) => (
          <div
            key={c.text}
            data-float={c.speed}
            aria-hidden
            className={`glass absolute z-10 hidden items-center gap-2 rounded-full px-4 py-2 text-[14px] font-medium text-text md:flex ${c.cls}`}
          >
            <span className={`size-2 rounded-full ${c.dot}`} />
            {c.text}
            <span className="font-mono text-[13px] font-semibold text-text-muted">{c.meta}</span>
          </div>
        ))}
      </div>

      {/* 과제 형태 띠 */}
      <div className="mt-24 md:pl-[120px]">
        <div className="marquee overflow-hidden" aria-label="과제 형태">
          <ul className="marquee-track gap-3 pr-3">
            {[...KINDS, ...KINDS].map((k, i) => (
              <li
                key={i}
                aria-hidden={i >= KINDS.length}
                className="glass inline-flex shrink-0 items-center gap-2 rounded-full px-5 py-2.5 text-[15px] font-medium text-text"
              >
                <k.icon size={16} className="text-brand" aria-hidden />
                {k.label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
