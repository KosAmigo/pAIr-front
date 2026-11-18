import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, Clock, Coins, History as HistoryIcon, Play, Target } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { PageHeader, SelfShell } from '../components/SelfShell'
import { cx } from '../components/cx'
import { ButtonLink, Panel, Sep } from '../components/ui'
import { CountUp, GlowBorder, GradientText, Magnetic, RevealGroup, RevealItem, Spotlight, StageSection } from '../components/fx'
import { MiniHex, StatHex, type HexStat } from '../components/dashboard/StatHex'
import { PROFILE, STAT_HISTORY, STATS, total, type StatScores } from '../data/dashboard'
import { recommended } from '../data/mock'
import { duration, easing } from '../lib/motion'
import { useCredits } from '../data/credits'

// DESIGN.md §7-2 개인 대시보드 (2026-11-19 전면 개편: "역량 시트")
// 위: 다크 무대에 역량 육각형, 총점과 등급, 6개 스탯 막대. 육각형과 막대는 마우스 강조를 함께 쓴다.
// 아래: 성장 곡선, 다음 목표(가장 약한 항목 + 추천 과제), 최근 응시 카드(작은 육각형).

const latest = STAT_HISTORY[STAT_HISTORY.length - 1]
const previous = STAT_HISTORY[STAT_HISTORY.length - 2]
const toHex = (s: StatScores): HexStat[] => STATS.map((st) => ({ key: st.key, name: st.name, score: s[st.key], max: st.max, color: st.color }))

/** 다크 무대 위 스탯 막대 한 줄 (게임 스탯처럼: 이름, 점수/배점, 차오르는 막대, 지난 응시 대비) */
function StatRow({ i, active, onActive }: { i: number; active: boolean; onActive: (on: boolean) => void }) {
  const st = STATS[i]
  const v = latest.scores[st.key]
  const d = v - previous.scores[st.key]
  return (
    <li onMouseEnter={() => onActive(true)} onMouseLeave={() => onActive(false)} className={cx('rounded-md px-3 py-2 transition-colors duration-150', active && 'bg-stage-raised')}>
      <div className="flex items-baseline gap-2">
        <span className="size-2 shrink-0 translate-y-[-1px] rounded-full" style={{ background: st.color, boxShadow: `0 0 10px ${st.color}` }} aria-hidden />
        <span className="text-[15px] font-semibold text-stage-text">{st.name}</span>
        <span className={cx('tnum ml-auto font-mono text-[12px] font-semibold', d > 0 ? 'text-stage-signal' : d < 0 ? 'text-stage-alert' : 'text-stage-faint')}>
          {d > 0 ? `+${d}` : d < 0 ? d : '±0'}
        </span>
        <span className="tnum w-14 text-right font-mono text-[15px] font-semibold text-stage-text">
          {v}
          <span className="text-[12px] text-stage-faint">/{st.max}</span>
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-stage-raised">
        <motion.div
          className="h-full w-full origin-left rounded-full"
          style={{ background: st.color, boxShadow: `0 0 12px ${st.color}` }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: v / st.max }}
          transition={{ duration: duration.crawl, ease: easing.expo, delay: 0.3 + i * 0.06 }}
        />
      </div>
    </li>
  )
}

/** 성장 곡선: 총점 영역 차트. 마우스를 올린 항목이 있으면 그 항목 선(배점 대비 %)을 겹쳐 그린다 */
function GrowthChart({ focus }: { focus: string | null }) {
  const reduce = useReducedMotion()
  const W = 760
  const H = 240
  const pad = { l: 40, r: 20, t: 20, b: 32 }
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / (STAT_HISTORY.length - 1)
  const y = (v: number) => pad.t + ((100 - v) / 60) * (H - pad.t - pad.b) // 40~100
  const totals = STAT_HISTORY.map((h) => total(h.scores))
  const line = totals.map((v, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(v)}`).join(' ')
  const area = `${line} L ${x(totals.length - 1)} ${H - pad.b} L ${x(0)} ${H - pad.b} Z`
  const fst = STATS.find((s) => s.key === focus)
  const fLine = fst ? STAT_HISTORY.map((h, i) => `${i ? 'L' : 'M'} ${x(i)} ${y((h.scores[fst.key] / fst.max) * 100)}`).join(' ') : null
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`총점 성장 곡선: ${STAT_HISTORY.map((h, i) => `${h.date} ${totals[i]}점`).join(', ')}`}>
      <defs>
        <linearGradient id="growth-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: 'var(--color-brand)', stopOpacity: 0.28 }} />
          <stop offset="100%" style={{ stopColor: 'var(--color-brand)', stopOpacity: 0 }} />
        </linearGradient>
        <linearGradient id="growth-line" gradientUnits="userSpaceOnUse" x1={pad.l} x2={W - pad.r} y1="0" y2="0">
          <stop offset="0%" style={{ stopColor: 'var(--color-branch-3)' }} />
          <stop offset="100%" style={{ stopColor: 'var(--color-brand-blue)' }} />
        </linearGradient>
      </defs>
      {[40, 60, 80, 100].map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--color-line)" strokeDasharray={v === 100 ? undefined : '3 5'} />
          <text x={pad.l - 10} y={y(v) + 4} textAnchor="end" className="fill-text-muted font-mono text-[12px]">
            {v}
          </text>
        </g>
      ))}
      {STAT_HISTORY.map((h, i) => (
        <text key={h.date} x={x(i)} y={H - 8} textAnchor="middle" className="fill-text-muted font-mono text-[12px]">
          {h.date}
        </text>
      ))}
      <motion.path d={area} fill="url(#growth-area)" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: duration.crawl, delay: 0.6 }} />
      <motion.path
        d={line}
        fill="none"
        stroke="url(#growth-line)"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ filter: 'drop-shadow(0 4px 10px color-mix(in srgb, var(--color-brand) 40%, transparent))' }}
        initial={reduce ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: duration.crawl * 1.4, ease: easing.expo, delay: 0.2 }}
      />
      {fLine && fst && <path key={fst.key} d={fLine} fill="none" stroke={fst.color} strokeWidth={2} strokeDasharray="6 5" className="fade-in" />}
      {totals.map((v, i) => {
        const last = i === totals.length - 1
        return (
          <g key={i}>
            <motion.circle
              cx={x(i)}
              cy={y(v)}
              r={last ? 7 : 4.5}
              fill="var(--color-panel)"
              stroke="var(--color-brand)"
              strokeWidth={last ? 3 : 2}
              style={{ transformOrigin: `${x(i)}px ${y(v)}px`, filter: last ? 'drop-shadow(0 0 8px color-mix(in srgb, var(--color-brand) 70%, transparent))' : undefined }}
              initial={reduce ? false : { scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: duration.normal, delay: 0.3 + i * 0.12 }}
            />
            <text x={x(i)} y={y(v) - 14} textAnchor="middle" className={cx('tnum font-mono font-semibold', last ? 'fill-brand text-[15px]' : 'fill-text-muted text-[12px]')}>
              {v}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export default function Dashboard() {
  const [active, setActive] = useState<string | null>(null)
  const credits = useCredits()
  const score = total(latest.scores)
  const prevScore = total(previous.scores)
  const delta = score - prevScore
  // 가장 약한 항목 = 배점 대비 비율이 가장 낮은 항목
  const weakest = [...STATS].sort((a, b) => latest.scores[a.key] / a.max - latest.scores[b.key] / b.max)[0]
  const weakPct = Math.round((latest.scores[weakest.key] / weakest.max) * 100)

  return (
    <SelfShell
      header={
        <PageHeader label="SELF-CHECK DASHBOARD" title={`${PROFILE.name}님의 역량 시트`}>
          <Magnetic>
            <ButtonLink to="/tasks" variant="primary">
              <Play size={18} aria-hidden /> 새 과제 응시
            </ButtonLink>
          </Magnetic>
        </PageHeader>
      }
    >
      <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-8 py-6">
        {/* ── 역량 시트: 이 화면의 다크 무대 ── */}
        <StageSection aria-label="역량 시트">
          <div className="grid grid-cols-[300px_minmax(0,1fr)_340px] items-center gap-6 px-10 py-8">
            {/* 왼쪽: 최근 응시, 총점, 크레딧과 응시 수 (기획_결정사항 §3: 크레딧 잔액 표시) */}
            <div className="flex flex-col gap-5">
              <GlowBorder className="w-fit max-w-full rounded-full">
                <span className="glass-stage inline-flex h-9 max-w-full items-center gap-2 rounded-full px-4 text-[13px] font-semibold text-stage-text">
                  <span className="tnum font-mono text-stage-brand">2026.{latest.date}</span>
                  <span className="truncate">{latest.task}</span>
                </span>
              </GlowBorder>
              <div>
                <span className="label text-stage-muted">LATEST SCORE</span>
                <div className="flex items-baseline gap-2">
                  <CountUp
                    value={score}
                    className="font-mono text-[104px] leading-[104px] font-semibold tracking-[-0.04em] text-brand-gradient"
                  />
                  <span className="font-mono text-[18px] text-stage-muted">/100</span>
                </div>
                <p className="mt-1 text-[15px] text-stage-muted">
                  <b className="tnum font-mono font-semibold text-stage-signal">
                    {delta >= 0 ? '+' : ''}
                    {delta}
                  </b>{' '}
                  지난 응시 대비
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-2">
                <div className="glass-stage rounded-lg px-3 py-2.5">
                  <dt className="label text-stage-muted">CREDITS</dt>
                  <dd className="mt-0.5 flex items-center gap-1.5 text-[15px] text-stage-text">
                    <Coins size={16} className="text-stage-caution" aria-hidden />
                    <CountUp value={credits} className="font-mono text-[22px] font-semibold" />
                  </dd>
                </div>
                <div className="glass-stage rounded-lg px-3 py-2.5">
                  <dt className="label text-stage-muted">ATTEMPTS</dt>
                  <dd className="mt-0.5 flex items-center gap-1.5 text-[15px] text-stage-text">
                    <HistoryIcon size={16} className="text-stage-brand" aria-hidden />
                    <CountUp value={STAT_HISTORY.length} className="font-mono text-[22px] font-semibold" />회
                  </dd>
                </div>
              </dl>
            </div>

            {/* 가운데: 육각형 */}
            <div className="flex justify-center">
              <StatHex stats={toHex(latest.scores)} prev={STATS.map((s) => previous.scores[s.key])} total={score} active={active} onActive={setActive} size={500} />
            </div>

            {/* 오른쪽: 6개 스탯 */}
            <div>
              <div className="mb-2 flex items-center justify-between px-3">
                <span className="label text-stage-muted">STATS</span>
                <span className="flex items-center gap-2 text-[12px] text-stage-muted">
                  <span className="inline-block h-0 w-4 border-t-2 border-dashed border-stage-muted" aria-hidden /> 지난 응시
                </span>
              </div>
              <ul className="flex flex-col gap-0.5">
                {STATS.map((st, i) => (
                  <StatRow key={st.key} i={i} active={active === st.key} onActive={(on) => setActive(on ? st.key : null)} />
                ))}
              </ul>
            </div>
          </div>
        </StageSection>

        <div className="grid grid-cols-12 gap-6">
          {/* 성장 곡선 */}
          <Panel
            reveal
            label="GROWTH"
            title="성장 곡선"
            className="col-span-8"
            actions={<span className="text-[13px] text-text-muted">{active ? `${STATS.find((s) => s.key === active)?.name} 선을 겹쳐 보는 중` : '위 스탯에 마우스를 올리면 항목 선이 겹쳐집니다'}</span>}
          >
            <GrowthChart focus={active} />
          </Panel>

          {/* 다음 목표 */}
          <GlowBorder className="col-span-4 rounded-md">
            <Panel reveal label="NEXT GOAL" title="다음 목표" className="h-full" flush>
              <div className="px-5 pt-4 pb-3">
                <div className="flex items-center gap-3">
                  <span className="inline-flex size-11 items-center justify-center rounded-md" style={{ background: `color-mix(in srgb, ${weakest.color} 14%, transparent)`, color: weakest.color }}>
                    <Target size={22} aria-hidden />
                  </span>
                  <div>
                    <p className="text-[19px] font-bold text-text">
                      <GradientText>{weakest.name}</GradientText> 끌어올리기
                    </p>
                    <p className="text-[14px] text-text-muted">{weakest.desc}</p>
                  </div>
                </div>
                <div className="mt-4 flex items-baseline justify-between">
                  <span className="label">지금</span>
                  <span className="tnum font-mono text-[14px] text-text">
                    {latest.scores[weakest.key]} / {weakest.max} <span className="text-text-muted">({weakPct}%)</span>
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-panel-raised">
                  <motion.div
                    className="h-full w-full origin-left rounded-full"
                    style={{ background: weakest.color }}
                    initial={{ scaleX: 0 }}
                    whileInView={{ scaleX: weakPct / 100 }}
                    viewport={{ once: true }}
                    transition={{ duration: duration.crawl, ease: easing.expo }}
                  />
                </div>
              </div>
              <ul className="divide-y divide-line border-t border-line">
                {recommended['개발'].slice(0, 3).map((r) => (
                  <li key={r.title}>
                    <Spotlight as={Link} to="/tasks" className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-panel-raised">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-medium text-text">{r.title}</div>
                        <div className="mt-0.5 flex items-center gap-2 text-[13px] text-text-muted">
                          <span className="flex items-center gap-1 font-mono">
                            <Clock size={14} aria-hidden />
                            {r.minutes}m
                          </span>
                          <Sep />
                          {r.level}
                        </div>
                      </div>
                      <ArrowRight size={18} className="text-text-muted transition-transform duration-150 group-hover:translate-x-1 group-hover:text-brand" aria-hidden />
                    </Spotlight>
                  </li>
                ))}
              </ul>
            </Panel>
          </GlowBorder>
        </div>

        {/* 최근 응시: 작은 육각형 카드 */}
        <section aria-labelledby="recent-h">
          <div className="mb-3 flex items-baseline gap-3">
            <h2 id="recent-h" className="text-h2 font-semibold text-text">
              최근 응시
            </h2>
            <Link to="/history" className="inline-flex items-center gap-1 text-[14px] text-text-muted hover:text-brand">
              내 기록 전체 <ArrowUpRight size={14} aria-hidden />
            </Link>
          </div>
          <RevealGroup className="grid grid-cols-3 gap-3 xl:grid-cols-6">
            {[...STAT_HISTORY].reverse().map((h, i, arr) => {
              const t = total(h.scores)
              const before = arr[i + 1] ? total(arr[i + 1].scores) : null
              return (
                <RevealItem key={h.date} className="flex">
                  <Spotlight
                    as={Link}
                    to="/report/a-1107"
                    className="group flex w-full flex-col items-center gap-2 rounded-xl border border-line bg-panel px-4 py-4 text-center shadow-sm transition-[transform,box-shadow,border-color] duration-150 hover:-translate-y-1 hover:border-brand/50 hover:shadow-md"
                  >
                    <span className="tnum self-start font-mono text-[12px] text-text-muted">2026.{h.date}</span>
                    <MiniHex stats={toHex(h.scores)} size={84} />
                    <span className="tnum font-mono text-[26px] leading-8 font-semibold text-text">{t}</span>
                    {before != null && (
                      <span className={cx('tnum font-mono text-[12px] font-semibold', t - before >= 0 ? 'text-signal' : 'text-alert')}>
                        {t - before >= 0 ? '+' : ''}
                        {t - before}
                      </span>
                    )}
                    <span className="line-clamp-2 text-[13px] leading-5 text-text-muted group-hover:text-text">{h.task}</span>
                  </Spotlight>
                </RevealItem>
              )
            })}
          </RevealGroup>
        </section>
      </div>
    </SelfShell>
  )
}
