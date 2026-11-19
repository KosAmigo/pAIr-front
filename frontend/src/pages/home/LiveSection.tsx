// DESIGN.md §7-1 ④ 실전 시험: 입장 링크 → 녹화 시작 → 타이머 임박 → 이탈 감지 경고가 차례로 나온다.
// 전체 폭 다크 무대(§3.6). 흰 화면 그림이 어둠 속에 떠 있다. 빨강은 "녹화 중", "시간 임박" 같은 상태에만 쓴다.
import { useRef } from 'react'
import { Camera, Mail, MonitorUp, ShieldAlert, TriangleAlert } from 'lucide-react'
import SectionHead, { Grad } from './SectionHead'
import Points from './Points'
import { floatCard, mockFrame } from './homeStyles'
import { GlowBorder } from '../../components/fx'
import { MOTION_OK, gsap, useGSAP } from './motion'

const TOKEN = 'inv_8f3a'
const FEATURES = [
  { icon: Mail, title: '메일로 받는 개인별 입장 링크', body: '회원가입 없이, 응시자마다 다른 링크 하나로 정해진 시간에 함께 입장합니다.' },
  { icon: Camera, title: '카메라와 화면 공유 감독', body: '응시 내내 카메라와 화면을 확인하고, 연결이 끊기면 바로 알려 줍니다.' },
  { icon: ShieldAlert, title: '이탈 감지와 기록', body: '창 이탈, 전체 화면 해제를 감지해 경고하고 감독 기록에 남깁니다.' },
]

const fmt = (s: number) => `00:${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

export default function LiveSection() {
  const root = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION_OK, () => {
        const q = gsap.utils.selector(root)
        const timer = q('[data-timer]')[0] as HTMLElement
        const t = { s: 599 }
        const tl = gsap.timeline({ scrollTrigger: { trigger: q('[data-console]')[0], start: 'top 70%' } })
        gsap.set(q('[data-rec]'), { opacity: 0.25 })
        gsap.set(q('[data-toast]'), { y: 40, opacity: 0, scale: 0.96 })
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
          .to(q('[data-toast]'), { y: 0, opacity: 1, scale: 1, duration: 0.8, ease: 'expo.out' }, '-=0.6')
        gsap.from(q('[data-point]'), { y: 32, opacity: 0, duration: 0.7, stagger: 0.1, ease: 'expo.out', scrollTrigger: { trigger: q('[data-points]')[0], start: 'top 80%' } })
      })
    },
    { scope: root },
  )

  return (
    <section ref={root} id="live" className="relative pt-40 md:pl-[160px]">
      <div data-spine="live" aria-hidden className="h-0" />
      <SectionHead
        label="LIVE EXAM"
        title={
          <>
            기업 시험은 <Grad>실전처럼</Grad>,
            <br />
            감독까지 한 번에
          </>
        }
        lead="같은 시험장, 같은 시간, 같은 규칙. 자가진단에서 연습한 그 화면 그대로 기업 시험을 치릅니다."
      />

      <div className="mt-16 grid items-start gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        {/* 실전 시험 화면 축소판 */}
        <div data-console className="relative" role="img" aria-label="실전 시험 화면: 입장 링크, 녹화 표시, 남은 시간 3분, 브라우저 이탈 감지 경고">
          <GlowBorder className="rounded-[28px]">
          <div className={mockFrame}>
            <div className="flex flex-wrap items-center gap-4 border-b border-line px-6 py-4">
              <span className="rounded-sm bg-alert/10 px-1.5 font-mono text-[12px] font-semibold tracking-[0.08em] text-alert">LIVE EXAM</span>
              <span className="text-[15px] font-semibold text-text">2026 하반기 백엔드 개발자 역량평가</span>
              <span data-rec className="ml-auto inline-flex items-center gap-2 font-mono text-[13px] font-semibold text-alert">
                <i data-rec-dot className="size-2.5 rounded-full bg-alert" aria-hidden /> REC
              </span>
            </div>
            <div className="grid gap-8 p-6 sm:grid-cols-2">
              <div>
                <p className="label">INVITE LINK</p>
                <div className="mt-3 flex h-14 items-center gap-2 overflow-hidden whitespace-nowrap rounded-md border border-line-strong bg-panel-sunken px-3 font-mono text-[15px] [perspective:600px]">
                  <Mail size={16} className="shrink-0 text-info" aria-hidden />
                  <span className="text-text-muted">invite=</span>
                  <span className="flex font-semibold text-text">
                    {TOKEN.split('').map((c, i) => (
                      <span key={i} data-cell className="inline-block">
                        {c}
                      </span>
                    ))}
                  </span>
                </div>
              </div>
              <div>
                <p className="label">REMAINING</p>
                <p
                  data-timer
                  data-tone="alert"
                  className="tnum mt-2 font-mono text-[44px] leading-[56px] font-semibold text-text transition-colors duration-300 data-[tone=alert]:text-alert data-[tone=caution]:text-caution"
                >
                  {fmt(178)}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-6 border-t border-line bg-panel-sunken px-6 py-4 text-[14px] text-text-muted">
              <span className="inline-flex items-center gap-2">
                <Camera size={16} aria-hidden /> 카메라 <b className="font-semibold text-signal">정상</b>
              </span>
              <span className="inline-flex items-center gap-2">
                <MonitorUp size={16} aria-hidden /> 화면 공유 <b className="font-semibold text-signal">정상</b>
              </span>
            </div>
          </div>
          </GlowBorder>

          {/* 이탈 감지 경고: 다른 섹션처럼 그림 오른쪽 아래에 떠오른다 */}
          <div data-toast className={floatCard}>
            <div className="flex gap-3">
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-alert/10 text-alert">
                <TriangleAlert size={18} aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-bold text-text">브라우저 이탈 감지</p>
                <p className="mt-0.5 text-[13px] text-text-muted">시험 창을 벗어났습니다. 감독 기록에 남습니다.</p>
              </div>
            </div>
          </div>
        </div>

        <Points items={FEATURES} className="lg:pt-6" />
      </div>
      <div data-spine="live-end" aria-hidden className="absolute bottom-0 left-0" />
    </section>
  )
}
