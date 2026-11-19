import { useEffect, useState } from 'react'
import { ArrowRight, Building2, Check, Hourglass, Sparkles } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { cx } from '../components/cx'
import { ButtonLink, Logo } from '../components/ui'
import { Aurora, Glass, GlowBorder, GradientText, Particles, Reveal, RevealGroup, RevealItem } from '../components/fx'
import { examInfo } from '../data/mock'
import { duration, easing } from '../lib/motion'

// DESIGN.md §7 제출 완료 안내 (2026-11-19 2차 개편)
// 체크 배지 뒤로 물결 고리가 퍼지고, 원과 체크가 그려진 뒤 입자가 터진다. 아래는 과제별 제출 영수증과 "다음 단계" 줄.
// 실전 결과는 응시자에게 보여 주지 않는다(기획_결정사항 §1): 점수나 리포트 링크를 두지 않는다.
// 응시자는 기업이 등록한 이름과 이메일로만 구분한다(exam_participants). 수험번호는 없다.
const SUBMITTED_AT = ['2026.11.10 15:41:08', '2026.11.10 15:58:42']

const NEXT: { label: string; hint: string; icon: typeof Check; state: 'done' | 'now' | 'later' }[] = [
  { label: '제출 완료', hint: '과제와 후속 질문 답변이 저장됐습니다', icon: Check, state: 'done' },
  { label: 'AI 채점', hint: '풀이 과정 전체를 6가지 역량으로 채점합니다', icon: Sparkles, state: 'now' },
  { label: '기업이 결과 안내', hint: `${examInfo.company}에서 직접 연락드립니다`, icon: Building2, state: 'later' },
]

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
    <div className="relative isolate flex min-h-full flex-col overflow-hidden">
      <Aurora variant="full" />
      <Particles fire={fire} origin={{ x: 0.5, y: 0.26 }} />
      <header className="glass relative z-10 flex h-16 items-center justify-between rounded-none! border-0! border-b! border-line/70! px-8 shadow-none!">
        <Logo />
        <span className="truncate text-[13px] font-medium text-text-muted">
          {examInfo.company} │ {examInfo.title}
        </span>
      </header>

      <main className="relative z-10 flex flex-1 flex-col items-center px-8 pt-14 pb-16">
        {/* 체크 배지: 뒤로 물결 고리 3개가 번갈아 퍼진다 */}
        <div className="relative flex size-40 items-center justify-center">
          {!reduce && [0, 1, 2].map((i) => <span key={i} aria-hidden className="submit-ripple absolute inset-4 rounded-full border-2 border-signal/40" style={{ animationDelay: `${i * 0.9}s` }} />)}
          <span aria-hidden className="absolute inset-6 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--color-signal)_22%,transparent),transparent_70%)]" />
          <GlowBorder className="rounded-full">
            <span className="relative flex size-28 items-center justify-center rounded-full bg-white/90 shadow-lg">
              <svg viewBox="0 0 96 96" className="size-24" aria-hidden>
                <motion.circle cx="48" cy="48" r="42" fill="none" stroke="var(--color-signal)" strokeWidth="5" strokeLinecap="round" {...draw(0.1)} />
                <motion.path d="M30 49 L43 62 L67 36" fill="none" stroke="var(--color-signal)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" {...draw(0.55)} />
              </svg>
            </span>
          </GlowBorder>
        </div>

        <Reveal delay={0.6} className="mt-6 text-center">
          <p className="label text-signal">SUBMITTED</p>
          <h1 className="mt-2 text-[44px] leading-[54px] font-extrabold tracking-[-0.035em] text-text">
            제출이 <GradientText>완료</GradientText>되었습니다
          </h1>
          <p className="mt-3 text-[17px] leading-7 text-text-muted">
            {examInfo.applicant.name}님, 수고하셨습니다. 결과는 기업을 통해 안내됩니다.
            <br />이 시험은 복기를 제공하지 않습니다.
          </p>
        </Reveal>

        {/* 제출 영수증: 과제별 제출 줄 + 응시자, 아래 끝은 톱니 모양으로 찢긴 종이 */}
        <Reveal delay={0.9} className="mt-10 w-[640px] max-w-full">
          <Glass className="submit-receipt rounded-t-2xl bg-white/90! px-8 pt-7 pb-10 shadow-lg!">
            <div className="flex items-baseline justify-between gap-4">
              <p className="label text-brand">SUBMISSION RECEIPT</p>
              <p className="tnum font-mono text-[12px] text-text-faint">{examInfo.start}</p>
            </div>
            <p className="mt-2 text-[18px] leading-7 font-bold text-text">{examInfo.title}</p>
            <p className="text-[14px] text-text-muted">{examInfo.company}</p>

            <RevealGroup as="ul" className="mt-5 flex flex-col gap-2">
              {examInfo.taskTitles.map((t, i) => (
                <RevealItem as="li" key={t} className="flex items-center gap-3 rounded-xl border border-signal/25 bg-signal/5 px-4 py-3">
                  <span aria-hidden className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-signal text-white">
                    <Check size={16} strokeWidth={3} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-text">
                      <span className="mr-2 font-mono text-[12px] text-text-faint">과제 {i + 1}</span>
                      {t}
                    </span>
                    <span className="text-[13px] text-text-muted">제출 │ 후속 질문 답변 완료</span>
                  </span>
                  <span className="tnum shrink-0 font-mono text-[13px] text-text-muted">{SUBMITTED_AT[i]?.slice(11)}</span>
                </RevealItem>
              ))}
            </RevealGroup>

            <div aria-hidden className="my-6 border-t-2 border-dashed border-line-strong" />
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 text-[14px]">
              <dt className="label self-center">APPLICANT</dt>
              <dd className="font-semibold text-text">{examInfo.applicant.name}</dd>
              <dt className="label self-center">EMAIL</dt>
              <dd className="truncate font-mono text-[13px] text-text">{examInfo.applicant.email}</dd>
              <dt className="label self-center">LAST SUBMIT</dt>
              <dd className="tnum font-mono text-[13px] text-text">{SUBMITTED_AT[SUBMITTED_AT.length - 1]}</dd>
            </dl>
          </Glass>
        </Reveal>

        {/* 다음 단계: 제출 완료 → AI 채점(지금) → 기업이 결과 안내 */}
        <Reveal delay={1.2} className="mt-10 w-[760px] max-w-full">
          <p className="label text-center">WHAT&apos;S NEXT</p>
          <ol className="mt-4 grid grid-cols-3">
            {NEXT.map((n, i) => (
              <li key={n.label} className="relative flex flex-col items-center px-3 text-center">
                {i > 0 && (
                  <span aria-hidden className={cx('absolute top-[21px] right-[calc(50%+30px)] left-[calc(-50%+30px)] h-[3px] rounded-full', n.state === 'later' ? 'bg-line' : 'bg-brand-gradient')} />
                )}
                <span className="relative">
                  {n.state === 'now' && <span aria-hidden className="rec-pulse absolute -inset-2 rounded-full border-2 border-brand/35" />}
                  <span
                    className={cx(
                      'relative flex size-11 items-center justify-center rounded-full',
                      n.state === 'done' && 'bg-signal text-white shadow-md',
                      n.state === 'now' && 'glow bg-panel text-brand [--glow:var(--color-brand)]',
                      n.state === 'later' && 'border border-line-strong bg-panel text-text-faint',
                    )}
                  >
                    {n.state === 'now' ? <Hourglass size={19} aria-hidden /> : <n.icon size={19} strokeWidth={n.state === 'done' ? 3 : 1.9} aria-hidden />}
                  </span>
                </span>
                <span className={cx('mt-3 text-[15px] font-semibold', n.state === 'later' ? 'text-text-muted' : 'text-text')}>{n.label}</span>
                <span className="mt-1 text-[13px] leading-5 break-keep text-text-muted">{n.hint}</span>
              </li>
            ))}
          </ol>
        </Reveal>

        <ButtonLink to="/" variant="secondary" size="lg" className="mt-12">
          처음으로 <ArrowRight size={18} aria-hidden />
        </ButtonLink>
      </main>
    </div>
  )
}
