import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { ButtonLink, Logo } from '../components/ui'
import { Aurora, Glass, GlowBorder, GradientText, Particles, Reveal, RevealGroup, RevealItem } from '../components/fx'
import { examInfo } from '../data/mock'
import { duration, easing } from '../lib/motion'

// DESIGN.md §7 제출 완료 안내 (2026-11-19 개편)
// 오로라 위 유리 카드. 원이 그려지고 체크가 그려진 뒤 입자가 한 번 터진다. 제출 정보는 그 뒤 타일로 올라온다.
// 실전 결과는 응시자에게 보여 주지 않는다(기획_결정사항 §1): 점수나 리포트 링크를 두지 않는다.
export default function Submitted() {
  const reduce = useReducedMotion()
  const [fire, setFire] = useState(false)
  useEffect(() => {
    const t = window.setTimeout(() => setFire(true), 900)
    return () => window.clearTimeout(t)
  }, [])
  const draw = (delay: number) =>
    reduce ? {} : { initial: { pathLength: 0 }, animate: { pathLength: 1 }, transition: { duration: duration.slow, ease: easing.expo, delay } }
  return (
    <div className="relative isolate flex min-h-full flex-col overflow-hidden border-t-2 border-alert">
      <Aurora variant="full" />
      <Particles fire={fire} origin={{ x: 0.5, y: 0.3 }} />
      <header className="glass relative z-10 flex h-16 items-center rounded-none! border-0! border-b! border-line/70! px-8 shadow-none!">
        <Logo />
      </header>
      <main className="relative z-10 flex flex-1 items-center justify-center p-12">
        <GlowBorder className="rounded-3xl">
          <Glass className="w-[600px] rounded-3xl bg-white/85! px-12 py-12 text-center shadow-lg!">
            <svg viewBox="0 0 96 96" className="mx-auto size-24" aria-hidden>
              <motion.circle cx="48" cy="48" r="42" fill="none" stroke="var(--color-signal)" strokeWidth="5" strokeLinecap="round" {...draw(0.1)} style={{ filter: 'drop-shadow(0 0 10px color-mix(in srgb, var(--color-signal) 45%, transparent))' }} />
              <motion.path d="M30 49 L43 62 L67 36" fill="none" stroke="var(--color-signal)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" {...draw(0.55)} />
            </svg>
            <Reveal delay={0.6}>
              <h1 className="mt-6 text-[34px] leading-[44px] font-extrabold tracking-[-0.03em] text-text">
                제출이 <GradientText>완료</GradientText>되었습니다
              </h1>
              <p className="mt-3 text-[16px] leading-7 text-text-muted">
                수고하셨습니다. 결과는 기업을 통해 안내됩니다.
                <br />이 시험은 복기를 제공하지 않습니다.
              </p>
            </Reveal>
            <RevealGroup className="mt-8 grid grid-cols-3 gap-2 text-left">
              {[
                ['SUBMITTED AT', '2026.11.10 16:00:00', true],
                ['SEAT NO.', examInfo.seat, true],
                ['EXAM', examInfo.title, false],
              ].map(([k, v, mono]) => (
                <RevealItem key={k as string} className="rounded-xl border border-line bg-panel px-4 py-3 shadow-sm">
                  <p className="label">{k}</p>
                  <p className={mono ? 'tnum mt-1 font-mono text-[14px] font-semibold text-text' : 'mt-1 line-clamp-2 text-[14px] font-semibold text-text'}>{v}</p>
                </RevealItem>
              ))}
            </RevealGroup>
            <ButtonLink to="/" variant="secondary" size="lg" className="mt-9">
              처음으로 <ArrowRight size={18} aria-hidden />
            </ButtonLink>
          </Glass>
        </GlowBorder>
      </main>
    </div>
  )
}
