// DESIGN.md §7-1 ⑤ 마무리: 척추 선이 두 갈래로 나뉘어 두 카드에 닿는다.
// 카드는 마우스를 따라 기울고(Motion), 마우스 위치에 빛이 따라다닌다.
import type { MouseEvent, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react'
import { ArrowRight, History, TicketCheck } from 'lucide-react'
import { cx } from '../../components/cx'
import { Sep } from '../../components/ui'
import SectionHead, { Grad } from './SectionHead'

const MotionLink = motion.create(Link)

function TiltCard({
  to,
  className,
  children,
}: {
  to: string
  className?: string
  children: ReactNode
}) {
  const reduced = useReducedMotion()
  const mx = useMotionValue(0.5)
  const my = useMotionValue(0.5)
  const rx = useSpring(useTransform(my, [0, 1], [6, -6]), { stiffness: 200, damping: 20 })
  const ry = useSpring(useTransform(mx, [0, 1], [-6, 6]), { stiffness: 200, damping: 20 })

  const onMove = (e: MouseEvent<HTMLAnchorElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    const y = (e.clientY - r.top) / r.height
    mx.set(x)
    my.set(y)
    e.currentTarget.style.setProperty('--spot-x', `${x * 100}%`)
    e.currentTarget.style.setProperty('--spot-y', `${y * 100}%`)
    e.currentTarget.style.setProperty('--spot-o', '1')
  }
  const onLeave = (e: MouseEvent<HTMLAnchorElement>) => {
    mx.set(0.5)
    my.set(0.5)
    e.currentTarget.style.setProperty('--spot-o', '0')
  }

  return (
    <MotionLink
      to={to}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={reduced ? undefined : { rotateX: rx, rotateY: ry, transformPerspective: 1000 }}
      whileHover={reduced ? undefined : { y: -6 }}
      className={cx(
        'spotlight group relative flex min-h-[320px] flex-col rounded-[28px] p-9 shadow-md transition-shadow duration-300 hover:shadow-lg',
        className,
      )}
    >
      {children}
    </MotionLink>
  )
}

export default function Finale() {
  return (
    <section className="relative pt-40 pb-32">
      <div data-spine="finale" aria-hidden className="h-0" />
      <SectionHead
        center
        label="GET STARTED"
        title={
          <>
            지금, <Grad>어느 쪽</Grad>으로 시작할까요?
          </>
        }
      />
      <div className="mt-32 grid gap-6 md:grid-cols-2 md:pl-[120px]">
        <div className="relative">
          <div data-spine="card-self" aria-hidden className="absolute top-0 left-12" />
          <TiltCard to="/tasks" className="border-gradient">
            <div className="flex items-center justify-between">
              <span className="label text-info">SELF-CHECK</span>
              <History size={24} strokeWidth={1.75} className="text-brand" aria-hidden />
            </div>
            <h3 className="mt-8 text-[34px] leading-10 font-extrabold tracking-[-0.02em] text-text">자가진단</h3>
            <p className="mt-3 text-[17px] leading-7 text-text-muted">
              혼자 바로 응시하고 결과 리포트를 받습니다.
              <br />
              원하는 시점으로 되돌아가 다시 풀어볼 수 있습니다.
            </p>
            <div className="mt-auto flex items-center gap-3 pt-8 font-mono text-[13px] text-text-muted">
              복기 가능 <Sep /> 리포트 제공
              <span className="bg-brand-gradient ml-auto inline-flex size-11 items-center justify-center rounded-full text-on-accent transition-transform duration-200 group-hover:translate-x-1">
                <ArrowRight size={20} aria-hidden />
              </span>
            </div>
          </TiltCard>
        </div>
        <div className="relative">
          <div data-spine="card-live" aria-hidden className="absolute top-0 left-12" />
          <TiltCard to="/entry" className="border-[1.5px] border-alert/50 bg-panel">
            <div className="flex items-center justify-between">
              <span className="label text-alert">LIVE EXAM</span>
              <TicketCheck size={24} strokeWidth={1.75} className="text-alert" aria-hidden />
            </div>
            <h3 className="mt-8 text-[34px] leading-10 font-extrabold tracking-[-0.02em] text-text">테스트 응시</h3>
            <p className="mt-3 text-[17px] leading-7 text-text-muted">
              기업이 발급한 입장 코드나 메일 링크로 입장합니다.
              <br />
              감독 환경에서 다른 응시자와 동시에 진행됩니다.
            </p>
            <div className="mt-auto flex items-center gap-3 pt-8 font-mono text-[13px] text-text-muted">
              입장 코드 또는 메일 링크 <Sep /> 감독 진행
              <span className="ml-auto inline-flex size-11 items-center justify-center rounded-full bg-alert text-on-accent transition-transform duration-200 group-hover:translate-x-1">
                <ArrowRight size={20} aria-hidden />
              </span>
            </div>
          </TiltCard>
        </div>
      </div>
      <p className="mt-10 text-center text-[15px] text-text-muted md:pl-[120px]">기업 담당자이신가요? 시험 만들기는 준비 중입니다.</p>
    </section>
  )
}
