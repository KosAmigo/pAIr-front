import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CircleAlert, FileBarChart2, GitBranch, Loader2, Play, Trophy } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { PageHeader, SelfShell } from '../components/SelfShell'
import { ButtonLink, StatusDot } from '../components/ui'
import { CountUp, Glass, GradientText, RevealGroup, RevealItem, Spotlight } from '../components/fx'
import { api, ApiError, type AttemptStatus, type AttemptSummary } from '../api'
import { attempts as mockAttempts } from '../data/mock'
import { duration, easing } from '../lib/motion'

// DESIGN.md §7-2b 내 기록 — "풀이 타임라인" (2026-11-19 전면 개편)
// 위: 요약 숫자 4개(유리 카드). 아래: 복기 트리처럼 세로 줄기를 따라 응시가 노드로 매달린다.
// 실제 응시(백엔드) 줄기가 먼저, 예시(목업) 줄기가 그 아래. 노드 색은 점수 구간(signal/info/caution/alert)이고 숫자를 함께 쓴다.

const statusLabel: Record<AttemptStatus, { s: 'ok' | 'check' | 'down'; t: string }> = {
  SOLVING: { s: 'check', t: '응시 중' },
  FOLLOWUP: { s: 'check', t: '후속 질문 중' },
  SCORING: { s: 'check', t: '채점 중' },
  DONE: { s: 'ok', t: '채점 완료' },
  ERROR: { s: 'down', t: '채점 실패' },
}

function tone(score: number | null | undefined) {
  if (score == null) return 'var(--color-line-strong)'
  if (score >= 80) return 'var(--color-signal)'
  if (score >= 60) return 'var(--color-info)'
  if (score >= 40) return 'var(--color-caution)'
  return 'var(--color-alert)'
}

type Node = {
  id: string
  date: string
  title: string
  type: string
  score: number | null
  status?: ReactNode
  actions: ReactNode
  example?: boolean
}

/** 세로 줄기 하나: 줄기는 위에서 아래로 그려지고, 노드 카드는 차례로 나온다 */
function Trunk({ label, title, nodes, empty }: { label: string; title: string; nodes: Node[]; empty?: ReactNode }) {
  const reduce = useReducedMotion()
  return (
    <section aria-label={title}>
      <div className="mb-4 flex items-baseline gap-3">
        <span className="label">{label}</span>
        <h2 className="text-h2 font-semibold text-text">{title}</h2>
        <span className="tnum font-mono text-[13px] text-text-muted">{nodes.length}건</span>
      </div>
      {empty ?? (
        <div className="relative pl-12">
          {/* 줄기 */}
          <motion.span
            aria-hidden
            className="bg-brand-gradient absolute top-2 bottom-2 left-[19px] w-[3px] origin-top rounded-full"
            initial={reduce ? false : { scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ duration: duration.crawl, ease: easing.expo }}
          />
          <RevealGroup as="ul" className="flex flex-col gap-3">
            {nodes.map((n) => (
              <RevealItem as="li" key={n.id} className="relative">
                {/* 노드: 줄기에서 카드로 이어지는 가지 + 점수 색 점 */}
                <span aria-hidden className="absolute top-1/2 -left-[29px] h-[2px] w-[29px] -translate-y-1/2 bg-line-strong" />
                <span
                  aria-hidden
                  className="glow absolute top-1/2 -left-[37px] size-4 -translate-y-1/2 rounded-full border-[3px] border-panel"
                  style={{ background: tone(n.score), '--glow': tone(n.score) } as CSSProperties}
                />
                <Spotlight className="flex items-center gap-6 rounded-xl border border-line bg-panel px-5 py-4 shadow-sm transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-md">
                  <span className="tnum w-28 shrink-0 font-mono text-[13px] text-text-muted">{n.date}</span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-[16px] font-semibold text-text">
                      {n.title}
                      {n.example && <span className="rounded-sm bg-panel-raised px-1.5 font-mono text-[11px] font-medium text-text-faint">예시</span>}
                    </p>
                    <p className="mt-0.5 flex items-center gap-3 text-[13px] text-text-muted">
                      {n.type}
                      {n.status}
                    </p>
                  </div>
                  <div className="w-24 text-right">
                    {n.score == null ? (
                      <span className="font-mono text-[14px] text-text-faint">점수 없음</span>
                    ) : (
                      <span className="tnum font-mono text-[30px] leading-9 font-semibold" style={{ color: tone(n.score) }}>
                        <CountUp value={n.score} />
                      </span>
                    )}
                  </div>
                  <div className="flex w-[200px] shrink-0 justify-end gap-1">{n.actions}</div>
                </Spotlight>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      )}
    </section>
  )
}

const linkCls = 'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[14px] font-medium text-text-muted transition-colors hover:bg-brand-dim hover:text-brand'

function Stat({ label, value, unit, icon }: { label: string; value: number | null; unit: string; icon?: ReactNode }) {
  return (
    <Glass className="flex flex-col gap-1 rounded-xl px-5 py-4">
      <span className="label flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      <span className="flex items-baseline gap-1">
        {value == null ? <span className="font-mono text-[32px] leading-10 text-text-faint">-</span> : <CountUp value={value} className="font-mono text-[32px] leading-10 font-semibold text-text" />}
        <span className="text-[14px] text-text-muted">{unit}</span>
      </span>
    </Glass>
  )
}

export default function History() {
  const [rows, setRows] = useState<AttemptSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    api.list().then(setRows).catch((e: ApiError) => setError(e.message))
  }, [])

  // 요약: 백엔드가 응답하면 실제 응시로(0건이면 0), 백엔드에 닿지 못하면 예시로 계산하고 그렇다고 밝힌다
  const fromExamples = rows === null
  const scored = !fromExamples ? rows.filter((r) => r.total != null && !r.legacyReport).map((r) => Math.round(r.total!)) : mockAttempts.map((a) => a.score)
  const count = !fromExamples ? rows.length : mockAttempts.length
  const best = scored.length ? Math.max(...scored) : null
  const avg = scored.length ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : null
  const latest = scored.length ? scored[0] : null

  const realNodes: Node[] = (rows ?? []).map((r) => ({
    id: r.id,
    date: new Date(r.startedAt).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' }),
    title: r.taskTitle,
    type: r.taskType === 'dev' ? '개발' : '비개발',
    score: r.legacyReport || r.total == null ? null : Math.round(r.total),
    status: <StatusDot status={statusLabel[r.status].s} label={statusLabel[r.status].t} />,
    actions:
      r.status === 'SOLVING' || r.status === 'FOLLOWUP' ? (
        <Link to={`/exam/${r.id}`} className={linkCls}>
          <Play size={16} aria-hidden /> 이어서 풀기
        </Link>
      ) : (
        <Link to={`/report/${r.id}`} className={linkCls}>
          <FileBarChart2 size={16} aria-hidden /> 리포트
        </Link>
      ),
  }))
  const exampleNodes: Node[] = mockAttempts.map((a) => ({
    id: a.id,
    date: a.date,
    title: a.task,
    type: a.type,
    score: a.score,
    example: true,
    actions: (
      <>
        <Link to="/report/a-1107" className={linkCls}>
          <FileBarChart2 size={16} aria-hidden /> 리포트
        </Link>
        {a.replay ? (
          <Link to="/replay/t-order-api" className={linkCls}>
            <GitBranch size={16} aria-hidden /> 복기
          </Link>
        ) : (
          <span className="inline-flex h-8 items-center px-2.5 text-[14px] text-text-faint">복기 없음</span>
        )}
      </>
    ),
  }))

  const realEmpty = error ? (
    <p className="flex items-center gap-2 rounded-xl border border-alert/30 bg-alert/5 px-5 py-4 text-[15px] text-alert">
      <CircleAlert size={18} aria-hidden /> 응시 기록을 불러오지 못했습니다 ({error})
    </p>
  ) : !rows ? (
    <p className="flex items-center gap-2 px-1 py-4 text-[15px] text-text-muted">
      <Loader2 size={16} className="animate-spin" aria-hidden /> 불러오는 중
    </p>
  ) : rows.length === 0 ? (
    <p className="rounded-xl border border-dashed border-line-strong px-5 py-6 text-[15px] text-text-muted">
      아직 응시한 과제가 없습니다.{' '}
      <Link to="/tasks" className="font-semibold text-brand underline-offset-4 hover:underline">
        과제
      </Link>
      에서 첫 기록을 남겨 보세요.
    </p>
  ) : undefined

  return (
    <SelfShell
      header={
        <PageHeader label="HISTORY" title="내 기록">
          <ButtonLink to="/tasks" variant="primary">
            <Play size={18} aria-hidden /> 새 과제 응시
          </ButtonLink>
        </PageHeader>
      }
    >
      <div className="mx-auto flex max-w-[1200px] flex-col gap-10 px-8 py-8">
        <div>
          <p className="text-[28px] leading-9 font-bold tracking-[-0.02em] text-text">
            {count > 0 ? (
              <>
                지금까지 <GradientText>{count}번</GradientText> 풀었어요
              </>
            ) : (
              <>
                아직 <GradientText>첫 기록</GradientText>을 기다리고 있어요
              </>
            )}
          </p>
          {error && <p className="mt-1 text-[14px] text-text-muted">응시 기록을 불러오지 못해 아래 예시 기록으로 계산했습니다.</p>}
          <RevealGroup className="mt-5 grid grid-cols-4 gap-3">
            <RevealItem>
              <Stat label="ATTEMPTS" value={count} unit="회" />
            </RevealItem>
            <RevealItem>
              <Stat label="BEST" value={best} unit="점" icon={<Trophy size={13} className="text-caution" aria-hidden />} />
            </RevealItem>
            <RevealItem>
              <Stat label="AVERAGE" value={avg} unit="점" />
            </RevealItem>
            <RevealItem>
              <Stat label="LATEST" value={latest} unit="점" />
            </RevealItem>
          </RevealGroup>
        </div>

        <Trunk label="MY ATTEMPTS" title="응시 기록" nodes={realNodes} empty={realEmpty} />
        <Trunk label="EXAMPLES" title="예시 기록" nodes={exampleNodes} />
      </div>
    </SelfShell>
  )
}
