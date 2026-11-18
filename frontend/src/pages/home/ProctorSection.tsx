// DESIGN.md §7-1 ⑥ 감독관 콘솔: 기업 담당자가 보는 실시간 현황 + 감독 판단 화면을 줄여서 보여준다.
// 화면에 보이는 동안 응시자 상태와 이벤트 피드가 몇 초마다 바뀌고, 이벤트 카드 하나에 "부정 의심" 판단이 찍힌다.
import { useEffect, useRef, useState, type RefObject } from 'react'
import { Camera, ClipboardPaste, ShieldAlert, ShieldCheck, Users } from 'lucide-react'
import { cx } from '../../components/cx'
import SectionHead, { Grad } from './SectionHead'
import Points, { Glow } from './Points'
import { floatCard, mockFrame } from './homeStyles'
import { MOTION_OK, gsap, prefersReducedMotion, useGSAP } from './motion'

type St = 'solving' | 'followup' | 'submitted' | 'lost'
const ST: Record<St, { label: string; dot: string; text: string }> = {
  solving: { label: '응시 중', dot: 'bg-brand', text: 'text-brand' },
  followup: { label: '후속 질문', dot: 'bg-info', text: 'text-info' },
  submitted: { label: '제출', dot: 'bg-signal', text: 'text-signal' },
  lost: { label: '연결 끊김', dot: 'bg-alert', text: 'text-alert' },
}
const PEOPLE: { name: string; st: St; turns: number; ev: number }[] = [
  { name: '윤태호', st: 'solving', turns: 4, ev: 1 },
  { name: '강다은', st: 'followup', turns: 9, ev: 0 },
  { name: '서준혁', st: 'lost', turns: 2, ev: 1 },
  { name: '임채원', st: 'solving', turns: 5, ev: 0 },
]
const FEED = [
  { who: '윤태호', what: '탭 전환', cam: false, at: '14:09:12' },
  { who: '서준혁', what: '얼굴 없음', cam: true, at: '14:17:40' },
  { who: '임채원', what: '외부 붙여넣기', cam: false, at: '14:21:03' },
  { who: '임채원', what: '고개 돌림', cam: true, at: '14:23:55' },
  { who: '윤태호', what: '창 이탈', cam: false, at: '14:26:18' },
]

const POINTS = [
  { icon: Users, title: '전원의 상태를 한눈에', body: '입장, 응시 중, 후속 질문, 제출, 연결 끊김을 5초마다 갱신합니다.' },
  { icon: Camera, title: '영상 대신 의심 순간만', body: '영상은 저장하지 않습니다. 탭 이탈이나 얼굴 없음 같은 순간과 사진 1장만 남깁니다.' },
  { icon: ShieldCheck, title: '판단은 사람이', body: '자동 탈락은 없습니다. 담당자가 이벤트마다 문제 없음, 부정 의심을 메모와 함께 남깁니다.' },
]

/** 화면에 보이는 동안 몇 초마다 한 걸음씩 진행되는 장면 번호 */
function useTicker(ref: RefObject<HTMLElement | null>, every: number, max: number) {
  const [n, setN] = useState(() => (prefersReducedMotion() ? max : 0))
  useEffect(() => {
    if (prefersReducedMotion() || !ref.current) return
    let id = 0
    const io = new IntersectionObserver(([e]) => {
      window.clearInterval(id)
      if (e.isIntersecting) id = window.setInterval(() => setN((v) => (v >= max ? 0 : v + 1)), every)
    })
    io.observe(ref.current)
    return () => {
      io.disconnect()
      window.clearInterval(id)
    }
  }, [ref, every, max])
  return n
}

export default function ProctorSection() {
  const root = useRef<HTMLElement>(null)
  const board = useRef<HTMLDivElement>(null)
  const step = useTicker(board, 2200, FEED.length + 2)

  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION_OK, () => {
        gsap.from('[data-board]', { y: 80, opacity: 0, duration: 1.1, ease: 'expo.out', scrollTrigger: { trigger: '[data-board]', start: 'top 85%' } })
        gsap.from('[data-point]', { y: 32, opacity: 0, duration: 0.7, stagger: 0.1, ease: 'expo.out', scrollTrigger: { trigger: '[data-points]', start: 'top 80%' } })
      })
    },
    { scope: root },
  )

  // 장면에 따라 바뀌는 값
  const feed = FEED.slice(0, Math.min(FEED.length, step + 1)).reverse()
  const people = PEOPLE.map((p, i) => {
    if (i === 1 && step >= 3) return { ...p, st: 'submitted' as St }
    if (i === 2 && step >= 2) return { ...p, st: 'solving' as St }
    return { ...p, turns: p.turns + Math.floor((step + i) / 3), ev: p.ev + (FEED.slice(0, step + 1).filter((f) => f.who === p.name).length > p.ev ? 1 : 0) }
  })
  const reviewed = step >= FEED.length
  const left = 35 * 60 - step * 37

  return (
    <section ref={root} id="proctor" className="relative pt-40 pb-12 md:pl-[160px]">
      <div data-spine="proctor" aria-hidden className="h-0" />
      <SectionHead
        label="PROCTOR"
        title={
          <>
            감독은 <Grad>한 화면</Grad>에서,
            <br />
            판단은 사람이
          </>
        }
        lead="기업 담당자는 콘솔에서 회차를 열고, 시험 중에는 실시간 현황을, 끝나면 응시자별 리포트와 감독 기록을 봅니다."
      />

      <div className="mt-16 grid items-start gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      {/* 콘솔 실시간 현황 축소판 */}
      <div ref={board} data-board className="relative" role="img" aria-label="감독관 콘솔: 응시자 상태 표, 남은 시간, 최신 감독 이벤트, 이벤트에 부정 의심 판단을 남기는 카드">
        <Glow />
        <div className={mockFrame}>
          <div className="flex items-center gap-3 border-b border-line px-6 py-4">
            <span className="inline-flex h-[22px] items-center gap-1.5 rounded-sm bg-alert/10 px-2 text-[12px] font-semibold text-alert">
              <i className="rec-pulse size-1.5 rounded-full bg-alert" aria-hidden /> 진행 중
            </span>
            <span className="min-w-0 truncate text-[15px] font-semibold text-text">2026 하반기 백엔드 경력 실전 2차</span>
            <span className="tnum ml-auto font-mono text-[22px] leading-none font-semibold text-text">
              00:{String(Math.floor(left / 60)).padStart(2, '0')}:{String(left % 60).padStart(2, '0')}
            </span>
          </div>

          <div>
            <table className="w-full text-[14px]">
              <thead>
                <tr className="h-10 border-b border-line text-left text-[13px] font-semibold text-text-muted">
                  <th className="px-6 font-semibold">이름</th>
                  <th className="px-4 font-semibold">상태</th>
                  <th className="px-4 text-right font-semibold">AI 질문</th>
                  <th className="px-6 text-right font-semibold">이벤트</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.name} className="h-12 border-b border-line last:border-0">
                    <td className="px-6 font-semibold text-text">{p.name}</td>
                    <td className="px-4">
                      <span className={cx('inline-flex items-center gap-1.5 font-semibold transition-colors duration-500', ST[p.st].text)}>
                        <i className={cx('size-2 rounded-full transition-colors duration-500', ST[p.st].dot, p.st === 'solving' && 'rec-pulse')} aria-hidden />
                        {ST[p.st].label}
                      </span>
                    </td>
                    <td className="tnum px-4 text-right font-mono text-text">{p.turns}</td>
                    <td className="px-6 text-right">
                      {p.ev ? <span className="tnum rounded-sm bg-caution/12 px-1.5 py-0.5 font-mono text-[12px] font-semibold text-caution">{p.ev}</span> : <span className="text-text-faint">0</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* 최신 감독 이벤트 한 줄: 새 이벤트가 들어오면 바뀌며 잠깐 강조된다 */}
            <div key={feed[0].at} className={cx('flex items-center gap-3 border-t border-line px-6 py-3 transition-colors duration-700', step < FEED.length ? 'bg-brand-dim' : 'bg-panel-sunken')}>
              <span className="text-[13px] font-semibold text-text-muted">최신 이벤트</span>
              <i className={cx('size-2 shrink-0', feed[0].cam ? 'rounded-full bg-alert' : 'rotate-45 bg-caution')} aria-hidden />
              <span className="min-w-0 truncate text-[14px] text-text">
                <b className="font-semibold">{feed[0].who}</b> {feed[0].what}
              </span>
              <span className="tnum ml-auto font-mono text-[12px] text-text-muted">{feed[0].at}</span>
            </div>
          </div>
        </div>

        {/* 감독 판단 카드: 보드 위에 떠 있다 */}
        <div className={floatCard}>
          <div className="flex gap-3">
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-caution/10 text-caution">
              <ClipboardPaste size={18} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[15px] font-bold text-text">임채원 외부 붙여넣기</p>
              <p className="tnum font-mono text-[12px] text-text-muted">00:21:03 │ 840자</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <span className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-line-strong bg-panel text-[13px] font-semibold text-text-muted">
              <ShieldCheck size={14} aria-hidden /> 문제 없음
            </span>
            <span
              className={cx(
                'inline-flex h-8 items-center justify-center gap-1.5 rounded-md border text-[13px] font-semibold transition-all duration-500',
                reviewed ? 'scale-100 border-alert bg-alert/10 text-alert' : 'border-line-strong bg-panel text-text-muted',
              )}
            >
              <ShieldAlert size={14} aria-hidden /> 부정 의심
            </span>
          </div>
          {/* 판단 메모: 판단이 찍힐 때만 펼쳐진다 (미리 빈칸을 두지 않는다) */}
          <div className={cx('grid transition-[grid-template-rows,opacity] duration-500', reviewed ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}>
            <p className="overflow-hidden text-[12px] text-text-muted">
              <span className="block pt-2">예시테크 담당자 │ 리포트 대화와 대조 필요</span>
            </p>
          </div>
        </div>
      </div>

      <Points items={POINTS} className="lg:pt-6" />
      </div>
      <div data-spine="proctor-end" aria-hidden className="absolute bottom-12 left-0" />
      <div data-spine="finale" aria-hidden className="mt-16 h-0" />
    </section>
  )
}
