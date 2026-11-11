import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Clock, FileBarChart2, GitBranch, Play } from 'lucide-react'
import { PageHeader, RailShell } from '../components/RailShell'
import { ButtonLink, cx, MetricTile, Panel, ScoreChip, Sep, Tabs } from '../components/ui'
import { attempts, COMPETENCIES, recommended, trend, user, type CompetencyKey } from '../data/mock'

// DESIGN.md §7-2 개인 대시보드

function TrendChart() {
  const [hover, setHover] = useState<number | null>(null)
  const [hidden, setHidden] = useState<Set<CompetencyKey>>(new Set())
  // 패널 실제 크기에 맞춰 그린다 (비율 고정 축소로 글자가 작아지는 것 방지)
  const boxRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 720, h: 260 })
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect
      if (width > 0 && height > 0) setBox({ w: Math.round(width), h: Math.round(height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const W = box.w
  const H = box.h
  const pad = { l: 36, r: 16, t: 12, b: 28 }
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / (trend.length - 1)
  // y축 40~100 범위
  const yy = (v: number) => pad.t + ((100 - v) / 60) * (H - pad.t - pad.b)

  return (
    <div className="flex h-full flex-col">
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1" aria-label="범례">
        {COMPETENCIES.map((c) => {
          const off = hidden.has(c.key)
          return (
            <li key={c.key}>
              <button
                type="button"
                aria-pressed={!off}
                onClick={() => {
                  const n = new Set(hidden)
                  if (off) n.delete(c.key)
                  else n.add(c.key)
                  setHidden(n)
                }}
                className={cx('flex items-center gap-1.5 text-[14px] transition-opacity duration-[120ms]', off ? 'opacity-40' : 'text-text')}
              >
                <span className="h-0.5 w-3 rounded-full" style={{ background: c.color }} aria-hidden />
                {c.name}
              </button>
            </li>
          )
        })}
      </ul>
      <div ref={boxRef} className="relative min-h-0 flex-1">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="absolute inset-0" role="img" aria-label="역량 항목별 점수 추이 차트" onMouseLeave={() => setHover(null)}>
          {[40, 60, 80, 100].map((v) => (
            <g key={v}>
              <line x1={pad.l} x2={W - pad.r} y1={yy(v)} y2={yy(v)} stroke="var(--color-line)" strokeOpacity={0.6} />
              <text x={pad.l - 8} y={yy(v) + 4} textAnchor="end" className="fill-text-muted font-mono text-[12px]">
                {v}
              </text>
            </g>
          ))}
          {trend.map((p, i) => (
            <text key={p.date} x={x(i)} y={H - 8} textAnchor="middle" className="fill-text-muted font-mono text-[12px]">
              {p.date}
            </text>
          ))}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="var(--color-line-strong)" />}
          {COMPETENCIES.filter((c) => !hidden.has(c.key)).map((c) => (
            <g key={c.key}>
              <polyline
                fill="none"
                stroke={c.color}
                strokeWidth={2}
                strokeLinejoin="round"
                points={trend.map((p, i) => `${x(i)},${yy(p.scores[c.key])}`).join(' ')}
              />
              {trend.map((p, i) => (
                <circle
                  key={i}
                  cx={x(i)}
                  cy={yy(p.scores[c.key])}
                  r={hover === i ? 4 : i === trend.length - 1 ? 3 : 0}
                  fill="var(--color-panel)"
                  stroke={c.color}
                  strokeWidth={2}
                />
              ))}
            </g>
          ))}
          {trend.map((_, i) => (
            <rect
              key={i}
              x={x(i) - (W - pad.l - pad.r) / (trend.length - 1) / 2}
              y={0}
              width={(W - pad.l - pad.r) / (trend.length - 1)}
              height={H}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          ))}
        </svg>
        {hover !== null && (
          <div
            className="pointer-events-none absolute top-2 z-10 w-44 rounded-md border border-line bg-panel-raised p-3 shadow-modal"
            style={{ left: `calc(${(x(hover) / W) * 100}% + ${hover > trend.length / 2 ? -188 : 12}px)` }}
          >
            <div className="font-mono text-[13px] text-text-muted">2026.{trend[hover].date}</div>
            <ul className="mt-2 space-y-1">
              {COMPETENCIES.map((c) => (
                <li key={c.key} className="flex items-center gap-2 text-[14px]">
                  <span className="size-2 rounded-full" style={{ background: c.color }} aria-hidden />
                  {c.name}
                  <span className="tnum ml-auto font-mono font-semibold">{trend[hover].scores[c.key]}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

function LatestBars() {
  const last = trend[trend.length - 1].scores
  const prev = trend[trend.length - 2].scores
  return (
    <ul className="flex h-full flex-col justify-between gap-1.5">
      {COMPETENCIES.map((c) => {
        const d = last[c.key] - prev[c.key]
        return (
          <li key={c.key}>
            <div className="flex items-baseline leading-5">
              <span className="text-[14px]">{c.name}</span>
              <span className={cx('tnum ml-auto font-mono text-[13px]', d >= 0 ? 'text-signal' : 'text-alert')}>
                {d >= 0 ? '+' : ''}
                {d}
              </span>
              <span className="tnum ml-3 w-7 text-right font-mono text-[16px] font-semibold">{last[c.key]}</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-panel-raised">
              <div className="h-full rounded-full" style={{ width: `${last[c.key]}%`, background: c.color }} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

const RECENT = 4

export default function Dashboard() {
  const [track, setTrack] = useState<'개발' | '비개발'>('개발')
  const latest = trend[trend.length - 1].scores
  const avg = Math.round(Object.values(latest).reduce((a, b) => a + b, 0) / COMPETENCIES.length)
  const sorted = [...COMPETENCIES].sort((a, b) => latest[b.key] - latest[a.key])
  const weakest = sorted[sorted.length - 1]

  return (
    <RailShell
      header={
        <PageHeader label="SELF-CHECK DASHBOARD" title={`${user.name}님의 역량 현황`}>
          <div className="flex gap-2">
            <ButtonLink to="/exam/new?track=biz" variant="secondary">
              <Play size={18} aria-hidden /> 비개발 과제 응시
            </ButtonLink>
            <ButtonLink to="/exam/new?track=dev" variant="primary">
              <Play size={18} aria-hidden /> 개발 과제 응시
            </ButtonLink>
          </div>
        </PageHeader>
      }
    >
      {/* 한 화면에 맞춤: 지표 행과 하단 행은 내용 높이, 차트 행이 남은 높이를 채운다 */}
      <div className="mx-auto grid h-full max-w-[1440px] grid-cols-12 grid-rows-[auto_minmax(0,1fr)_auto] gap-2 px-8 py-5">
        <div className="col-span-3">
          <MetricTile label="TOTAL ATTEMPTS" value={attempts.length + 7} unit="회" sub="최근 30일 4회" />
        </div>
        <div className="col-span-3">
          <MetricTile label="LATEST SCORE" value={avg} unit="/100" delta={5} deltaText="지난 응시 대비" />
        </div>
        <div className="col-span-3">
          <MetricTile label="STRONGEST" value={<span className="font-sans text-[24px]">{sorted[0].name}</span>} sub={<span className="font-mono">{latest[sorted[0].key]}점, 상위 12%</span>} />
        </div>
        <div className="col-span-3">
          <MetricTile
            label="NEEDS WORK"
            value={<span className="font-sans text-[24px] text-caution">{weakest.name}</span>}
            sub={<span className="font-mono">{latest[weakest.key]}점, 추천 과제 2개</span>}
          />
        </div>

        <Panel label="SCORE TREND" title="역량 항목별 점수 추이" className="col-span-8">
          <TrendChart />
        </Panel>
        <Panel label="LATEST" title="최근 응시 항목별 점수" className="col-span-4">
          <LatestBars />
        </Panel>

        <Panel
          label="HISTORY"
          title="최근 응시 기록"
          className="col-span-8"
          flush
          actions={<span className="font-mono text-[13px] text-text-muted">최근 {RECENT}건 / 전체 {attempts.length + 7}건</span>}
        >
          <table className="w-full text-[14px]">
            <thead>
              <tr className="border-b border-line text-left">
                {['DATE', 'TASK', 'TYPE', 'SCORE', ''].map((h) => (
                  <th key={h} className="label h-9 px-4 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {attempts.slice(0, RECENT).map((a) => (
                <tr key={a.id} className="border-b border-line last:border-b-0 hover:bg-panel-raised">
                  <td className="tnum h-10 px-4 font-mono text-text-muted">{a.date}</td>
                  <td className="px-4 text-[15px] text-text">{a.task}</td>
                  <td className="px-4 text-text-muted">{a.type}</td>
                  <td className="px-4">
                    <ScoreChip score={a.score} />
                  </td>
                  <td className="px-4">
                    <div className="flex justify-end gap-1">
                      <Link to="/report/a-1107" className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[14px] text-text-muted hover:bg-panel hover:text-text">
                        <FileBarChart2 size={16} aria-hidden /> 리포트
                      </Link>
                      {a.replay ? (
                        <Link to="/replay/t-order-api" className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[14px] text-text-muted hover:bg-panel hover:text-text">
                          <GitBranch size={16} aria-hidden /> 복기
                        </Link>
                      ) : (
                        <span className="inline-flex h-7 items-center px-2 text-[14px] text-text-faint">복기 없음</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel label="RECOMMENDED" title="유형별 추천 과제" className="col-span-4" flush>
          <div className="border-b border-line px-4">
            <Tabs
              value={track}
              onChange={setTrack}
              tabs={[
                { value: '개발', label: '개발' },
                { value: '비개발', label: '비개발' },
              ]}
            />
          </div>
          <ul key={track} className="fade-in divide-y divide-line">
            {recommended[track].map((r) => (
              <li key={r.title}>
                <Link
                  to={`/exam/t-order-api?mode=self${track === '비개발' ? '&track=biz' : ''}`}
                  className="group flex items-center gap-3 px-4 py-2 hover:bg-panel-raised"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-medium">{r.title}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-[13px] text-text-muted">
                      <span className="text-caution">{r.focus} 강화</span>
                      <Sep />
                      <span className="flex items-center gap-1 font-mono">
                        <Clock size={14} aria-hidden />
                        {r.minutes}m
                      </span>
                      <Sep />
                      {r.level}
                    </div>
                  </div>
                  <ArrowRight size={18} className="text-text-faint transition-transform duration-[120ms] group-hover:translate-x-0.5 group-hover:text-text" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </RailShell>
  )
}
