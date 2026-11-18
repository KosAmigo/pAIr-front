// DESIGN.md §7-1 ④ 실전 시험과 감독: 페이지 유일의 어두운 영역(다크 아일랜드).
// 입장 코드 → 녹화 시작 → 타이머 임박 → 이탈 감지 경고가 차례로 나온다.
import { useRef } from 'react'
import { Camera, Mail, MonitorUp, ShieldAlert, TriangleAlert } from 'lucide-react'
import SectionHead from './SectionHead'
import { MOTION_OK, gsap, useGSAP } from './motion'

const CODE = 'K7Q2M9'
const FEATURES = [
  { icon: Mail, title: '입장 코드와 메일 링크', body: '기업이 발급한 6자리 코드나 응시자별 링크로 정해진 시간에 함께 입장합니다.' },
  { icon: Camera, title: '카메라와 화면 공유 감독', body: '응시 내내 카메라와 화면을 녹화하고, 연결이 끊기면 바로 알려 줍니다.' },
  { icon: ShieldAlert, title: '이탈 감지와 기록', body: '창 이탈, 전체 화면 해제를 감지해 경고하고 결과 리포트에 남깁니다.' },
]

const fmt = (s: number) => `00:${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

export default function LiveSection() {
  const root = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION_OK, () => {
        const q = gsap.utils.selector(root)
        // 섬이 다가오며 커진다
        gsap.fromTo(
          q('[data-island]'),
          { scale: 0.92, borderRadius: 56 },
          { scale: 1, borderRadius: 28, ease: 'none', scrollTrigger: { trigger: root.current, start: 'top bottom', end: 'top 20%', scrub: 0.6 } },
        )
        const timer = q('[data-timer]')[0] as HTMLElement
        const t = { s: 599 }
        const tl = gsap.timeline({ scrollTrigger: { trigger: q('[data-console]')[0], start: 'top 70%' } })
        gsap.set(q('[data-rec]'), { opacity: 0.25 })
        gsap.set(q('[data-toast]'), { x: 60, opacity: 0 })
        tl.from(q('[data-cell]'), { rotateX: -90, opacity: 0, duration: 0.5, stagger: 0.09, ease: 'back.out(1.6)', transformOrigin: '50% 50% -20px' })
          .to(q('[data-rec]'), { opacity: 1, duration: 0.3 }, '+=0.2')
          .add(() => q('[data-rec-dot]')[0]?.classList.add('rec-pulse'))
          .to(
            t,
            {
              s: 178,
              duration: 2.2,
              ease: 'power2.in',
              onUpdate: () => {
                const s = Math.round(t.s)
                timer.textContent = fmt(s)
                timer.dataset.tone = s <= 180 ? 'alert' : s <= 600 ? 'caution' : 'ok'
              },
            },
            '+=0.2',
          )
          .to(q('[data-toast]'), { x: 0, opacity: 1, duration: 0.6, ease: 'expo.out' }, '-=0.6')
          .from(q('[data-feature]'), { y: 24, opacity: 0, stagger: 0.1, duration: 0.6, ease: 'expo.out' }, 0)
      })
    },
    { scope: root },
  )

  return (
    <section ref={root} id="live" className="relative mt-40">
      <div data-spine="live" aria-hidden className="h-0" />
      <div data-island className="relative overflow-hidden rounded-[28px] bg-ink px-6 py-24 md:pr-16 md:pl-[120px]">
        <div aria-hidden className="absolute -top-40 right-0 size-[520px] rounded-full bg-ink-alert/15 blur-[120px]" />
        <div aria-hidden className="absolute -bottom-40 left-1/4 size-[420px] rounded-full bg-brand/25 blur-[120px]" />
        <div className="relative">
          <SectionHead
            dark
            label="LIVE EXAM"
            labelCls="text-ink-alert"
            title={
              <>
                기업 시험은 <span className="text-ink-alert">실전처럼</span>,
                <br />
                감독까지 한 번에
              </>
            }
            lead="같은 시험장, 같은 시간, 같은 규칙. 자가진단에서 연습한 그 화면 그대로 기업 시험을 치릅니다."
          />

          <div className="mt-16 grid items-center gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            {/* 실전 콘솔 */}
            <div data-console className="relative">
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] shadow-[0_40px_80px_-20px_rgb(0_0_0/0.6)]">
                <div className="h-0.5 bg-ink-alert" />
                <div className="flex flex-wrap items-center gap-4 border-b border-white/10 px-5 py-4">
                  <span className="rounded-sm bg-ink-alert/15 px-1.5 font-mono text-[12px] font-semibold tracking-[0.08em] text-ink-alert">LIVE EXAM</span>
                  <span className="text-[15px] font-semibold text-ink-text">2026 하반기 백엔드 개발자 역량평가</span>
                  <span data-rec className="ml-auto inline-flex items-center gap-2 font-mono text-[13px] font-semibold text-ink-alert">
                    <i data-rec-dot className="size-2.5 rounded-full bg-ink-alert" aria-hidden /> REC
                  </span>
                </div>
                <div className="grid gap-8 p-6 sm:grid-cols-2">
                  <div>
                    <p className="label text-ink-muted">ENTRY CODE</p>
                    <div className="mt-3 flex gap-2 [perspective:600px]">
                      {CODE.split('').map((c, i) => (
                        <span
                          key={i}
                          data-cell
                          className="inline-flex h-14 w-11 items-center justify-center rounded-md border border-white/15 bg-white/[0.06] font-mono text-[24px] font-semibold text-ink-text"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="label text-ink-muted">REMAINING</p>
                    <p
                      data-timer
                      data-tone="alert"
                      className="tnum mt-2 font-mono text-[44px] leading-[56px] font-semibold text-ink-text transition-colors duration-300 data-[tone=alert]:text-ink-alert data-[tone=caution]:text-ink-caution"
                    >
                      {fmt(178)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-6 border-t border-white/10 px-6 py-4 text-[14px] text-ink-muted">
                  <span className="inline-flex items-center gap-2">
                    <Camera size={16} aria-hidden /> 카메라 <b className="font-semibold text-ink-text">정상</b>
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <MonitorUp size={16} aria-hidden /> 화면 공유 <b className="font-semibold text-ink-text">정상</b>
                  </span>
                </div>
              </div>
              <div
                data-toast
                role="presentation"
                className="absolute -top-6 -right-4 flex max-w-[300px] items-start gap-3 rounded-xl border border-ink-alert/40 bg-ink px-4 py-3 shadow-[0_20px_40px_-12px_rgb(0_0_0/0.7)] md:-right-10"
              >
                <TriangleAlert size={18} className="mt-0.5 shrink-0 text-ink-alert" aria-hidden />
                <div>
                  <p className="text-[14px] font-semibold text-ink-text">브라우저 이탈 감지</p>
                  <p className="mt-0.5 text-[13px] text-ink-muted">시험 창을 벗어났습니다. 기록에 남습니다.</p>
                </div>
              </div>
            </div>

            {/* 기능 목록 */}
            <ul className="space-y-8">
              {FEATURES.map((f) => (
                <li key={f.title} data-feature className="flex gap-4">
                  <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-white/[0.08] text-ink-text">
                    <f.icon size={22} strokeWidth={1.75} aria-hidden />
                  </span>
                  <div>
                    <p className="text-[18px] font-bold text-ink-text">{f.title}</p>
                    <p className="mt-1 text-[15px] leading-6 text-ink-muted">{f.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <div data-spine="live-end" aria-hidden className="absolute bottom-24 left-0" />
    </section>
  )
}
