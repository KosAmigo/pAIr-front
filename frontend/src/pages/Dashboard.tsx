import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Coins, History as HistoryIcon, Loader2, Play, Target } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { PageHeader, SelfShell } from '../components/SelfShell'
import { cx } from '../components/cx'
import { ButtonLink, Panel } from '../components/ui'
import { ErrorState } from '../components/ErrorState'
import { CountUp, GlowBorder, GradientText, Magnetic, RevealGroup, RevealItem, StageSection } from '../components/fx'
import { StatHex, type HexStat } from '../components/dashboard/StatHex'
import { loadStatHistory, STATS, total, type StatEntry, type StatScores } from '../data/dashboard'
import { duration, easing } from '../lib/motion'
import { topHabits } from '../lib/habits'
import { useAuth } from '../auth/auth'
import { useCredits } from '../data/credits'
import type { ApiError } from '../api'

// DESIGN.md §7-2 개인 대시보드 (2026-11-19 전면 개편: "역량 시트")
// 위: 다크 무대에 역량 육각형, 총점과 등급, 6개 스탯 막대. 육각형과 막대는 마우스 강조를 함께 쓴다.
// 아래: 성장 곡선, 다음 목표(가장 약한 항목), 자주 깎이는 습관 Top 3 (응시 하나하나는 복기 탭).
// 점수는 백엔드의 채점된 응시(GET /api/attempts + 응시별 리포트 항목)로만 그린다. 추천 과제는 준비 중.
const toHex = (s: StatScores): HexStat[] => STATS.map((st) => ({ key: st.key, name: st.name, score: s[st.key], max: st.max, color: st.color }))

/** 다크 무대 위 스탯 막대 한 줄 (게임 스탯처럼: 이름, 점수/배점, 차오르는 막대, 지난 응시 대비) */
function StatRow({ i, latest, previous, active, onActive }: { i: number; latest: StatEntry; previous?: StatEntry; active: boolean; onActive: (on: boolean) => void }) {
  const st = STATS[i]
  const v = latest.scores[st.key]
  const d = previous ? v - previous.scores[st.key] : 0
  return (
    <li onMouseEnter={() => onActive(true)} onMouseLeave={() => onActive(false)} className={cx('rounded-md px-3 py-2 transition-colors duration-150', active && 'bg-stage-raised')}>
      <div className="flex items-baseline gap-2">
        <span className="size-2 shrink-0 translate-y-[-1px] rounded-full" style={{ background: st.color, boxShadow: `0 0 10px ${st.color}` }} aria-hidden />
        <span className="text-[15px] font-semibold text-stage-text">{st.name}</span>
        <span className={cx('tnum ml-auto font-mono text-[12px] font-semibold', d > 0 ? 'text-stage-signal' : d < 0 ? 'text-stage-alert' : 'text-stage-faint')}>
          {previous ? (d > 0 ? `+${d}` : d < 0 ? d : '±0') : ''}
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
function GrowthChart({ focus, history }: { focus: string | null; history: StatEntry[] }) {
  const reduce = useReducedMotion()
  const W = 760
  const H = 240
  const pad = { l: 40, r: 20, t: 20, b: 32 }
  const x = (i: number) => (history.length < 2 ? (pad.l + W - pad.r) / 2 : pad.l + (i * (W - pad.l - pad.r)) / (history.length - 1))
  const y = (v: number) => pad.t + ((100 - v) / 100) * (H - pad.t - pad.b) // 0~100
  const totals = history.map((h) => total(h.scores))
  const line = totals.map((v, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(v)}`).join(' ')
  const area = `${line} L ${x(totals.length - 1)} ${H - pad.b} L ${x(0)} ${H - pad.b} Z`
  const fst = STATS.find((s) => s.key === focus)
  const fLine = fst ? history.map((h, i) => `${i ? 'L' : 'M'} ${x(i)} ${y((h.scores[fst.key] / fst.max) * 100)}`).join(' ') : null
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`총점 성장 곡선: ${history.map((h, i) => `${h.date} ${totals[i]}점`).join(', ')}`}>
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
      {[0, 25, 50, 75, 100].map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--color-line)" strokeDasharray={v === 100 ? undefined : '3 5'} />
          <text x={pad.l - 10} y={y(v) + 4} textAnchor="end" className="fill-text-muted font-mono text-[12px]">
            {v}
          </text>
        </g>
      ))}
      {history.map((h, i) => (
        <text key={h.id} x={x(i)} y={H - 8} textAnchor="middle" className="fill-text-muted font-mono text-[12px]">
          {h.date.slice(5)}
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
  const { user } = useAuth()
  const [data, setData] = useState<{ entries: StatEntry[]; attempts: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    loadStatHistory()
      .then((d) => {
        if (!alive) return
        setData(d)
        setError(null)
      })
      .catch((e: ApiError) => alive && setError(e.message))
    return () => {
      alive = false
    }
  }, [tick])

  return (
    <SelfShell
      header={
        <PageHeader label="SELF-CHECK DASHBOARD" title={`${user?.name ?? ''}님의 역량 시트`}>
          <Magnetic>
            <ButtonLink to="/tasks" variant="primary">
              <Play size={18} aria-hidden /> 새 과제 응시
            </ButtonLink>
          </Magnetic>
        </PageHeader>
      }
    >
      {error ? (
        <ErrorState message={error} onRetry={() => setTick((t) => t + 1)} className="mt-16" />
      ) : !data ? (
        <p className="m-8 flex items-center gap-2 text-body text-text-muted">
          <Loader2 size={18} className="animate-spin" aria-hidden /> 불러오는 중
        </p>
      ) : data.entries.length === 0 ? (
        <div className="mx-auto mt-16 flex max-w-[560px] flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong bg-panel/60 px-10 py-12 text-center">
          <HistoryIcon size={28} className="text-text-faint" aria-hidden />
          <p className="text-[17px] font-semibold text-text">아직 데이터가 없습니다</p>
          <p className="text-[14px] text-text-muted">과제를 풀고 채점이 끝나면 역량 시트가 채워집니다.</p>
          <ButtonLink to="/tasks" variant="primary" className="mt-2">
            <Play size={18} aria-hidden /> 과제 보러 가기
          </ButtonLink>
        </div>
      ) : (
        <DashboardBody history={data.entries} attempts={data.attempts} />
      )}
    </SelfShell>
  )
}

function DashboardBody({ history, attempts }: { history: StatEntry[]; attempts: number }) {
  const { state: credits } = useCredits()
  const unlimited = useAuth().user?.role === 'ADMIN'
  const [active, setActive] = useState<string | null>(null)
  const latest = history[history.length - 1]
  const previous = history.length > 1 ? history[history.length - 2] : undefined
  const score = total(latest.scores)
  const delta = previous ? score - total(previous.scores) : null
  // 가장 약한 항목 = 배점 대비 비율이 가장 낮은 항목
  const weakest = [...STATS].sort((a, b) => latest.scores[a.key] / a.max - latest.scores[b.key] / b.max)[0]
  const weakPct = Math.round((latest.scores[weakest.key] / weakest.max) * 100)
  const habits = topHabits(history)

  return (
      <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-8 py-6">
        {/* ── 역량 시트: 이 화면의 다크 무대 ── */}
        <StageSection aria-label="역량 시트">
          <div className="grid grid-cols-[300px_minmax(0,1fr)_340px] items-center gap-6 px-10 py-8">
            {/* 왼쪽: 최근 응시, 총점, 크레딧과 응시 수 (기획_결정사항 §3: 크레딧 잔액 표시) */}
            <div className="flex flex-col gap-5">
              <GlowBorder className="w-fit max-w-full rounded-full">
                <span className="glass-stage inline-flex h-9 max-w-full items-center gap-2 rounded-full px-4 text-[13px] font-semibold text-stage-text">
                  <span className="tnum font-mono text-stage-brand">{latest.date}</span>
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
                {delta != null && (
                  <p className="mt-1 text-[15px] text-stage-muted">
                    <b className={cx('tnum font-mono font-semibold', delta >= 0 ? 'text-stage-signal' : 'text-stage-alert')}>
                      {delta >= 0 ? '+' : ''}
                      {delta}
                    </b>{' '}
                    지난 응시 대비
                  </p>
                )}
              </div>
              <dl className={cx('grid gap-2', unlimited ? 'grid-cols-1' : 'grid-cols-2')}>
                {/* 관리자는 크레딧 제한 없이 쓰므로 잔액을 보여 주지 않는다 */}
                {!unlimited && <div className="glass-stage rounded-lg px-3 py-2.5">
                  <dt className="label text-stage-muted">CREDITS</dt>
                  <dd className="mt-0.5 flex items-center gap-1.5 text-[15px] text-stage-text">
                    <Coins size={16} className="text-stage-caution" aria-hidden />
                    <span role="status" className="text-[14px] font-semibold text-stage-muted">
                      {credits.status === 'loading' ? '조회 중' : credits.status === 'error' ? '조회 실패' : credits.balance.toLocaleString()}
                    </span>
                  </dd>
                </div>}
                <div className="glass-stage rounded-lg px-3 py-2.5">
                  <dt className="label text-stage-muted">ATTEMPTS</dt>
                  <dd className="mt-0.5 flex items-center gap-1.5 text-[15px] text-stage-text">
                    <HistoryIcon size={16} className="text-stage-brand" aria-hidden />
                    <CountUp value={attempts} className="font-mono text-[22px] font-semibold" />회
                  </dd>
                </div>
              </dl>
            </div>

            {/* 가운데: 육각형 */}
            <div className="flex justify-center">
              <StatHex stats={toHex(latest.scores)} prev={previous ? STATS.map((s) => previous.scores[s.key]) : undefined} total={score} active={active} onActive={setActive} size={500} />
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
                  <StatRow key={st.key} i={i} latest={latest} previous={previous} active={active === st.key} onActive={(on) => setActive(on ? st.key : null)} />
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
            actions={active ? <span className="text-[13px] text-text-muted">{`${STATS.find((s) => s.key === active)?.name} 선을 겹쳐 보는 중`}</span> : undefined}
          >
            <GrowthChart focus={active} history={history} />
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
              {/* 추천 과제: 추천 API 가 아직 없어 준비 중 */}
              <p className="border-t border-line px-5 py-4 text-[14px] text-text-muted">맞춤 추천 과제는 준비 중인 기능입니다.</p>
            </Panel>
          </GlowBorder>
        </div>

        {/* 자주 깎이는 습관 Top 3 (DESIGN.md §7-2). 응시 하나하나는 복기 탭에서 본다 */}
        <section aria-labelledby="habits-h">
          <div className="mb-3 flex items-baseline gap-3">
            <span className="label">HABITS</span>
            <h2 id="habits-h" className="text-h2 font-semibold text-text">
              자주 깎이는 습관 Top 3
            </h2>
          </div>
          {habits.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line-strong bg-panel/60 px-5 py-6 text-[14px] text-text-muted">아직 반복해서 깎이는 습관이 없어요.</p>
          ) : (
            <RevealGroup className="flex flex-col gap-2">
              {habits.map((h, i) => {
                const st = STATS.find((s) => s.key === h.itemKey)
                return (
                  <RevealItem key={h.code}>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line bg-panel px-5 py-3.5 shadow-sm">
                      <span className="tnum w-5 font-mono text-[15px] font-semibold text-text-faint">{i + 1}</span>
                      {st && (
                        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-semibold" style={{ color: st.color, background: `color-mix(in srgb, ${st.color} 12%, transparent)` }}>
                          {st.name}
                        </span>
                      )}
                      <span className="min-w-0 flex-1 text-[15px] font-semibold text-text">{h.label}</span>
                      <span className="tnum font-mono text-[14px] text-text-muted">
                        {h.of}번 중 {h.hits}번
                      </span>
                      <span className="tnum font-mono text-[14px] font-semibold text-alert">−{h.sum}점</span>
                      <Link
                        to={`/review?task=${encodeURIComponent(h.latestTaskId)}&b=${encodeURIComponent(h.latestAttemptId)}`}
                        className="inline-flex items-center gap-1 text-[14px] text-text-muted hover:text-brand"
                      >
                        복기에서 보기 <ArrowUpRight size={14} aria-hidden />
                      </Link>
                    </div>
                  </RevealItem>
                )
              })}
            </RevealGroup>
          )}
        </section>
      </div>
  )
}
