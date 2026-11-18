import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileBarChart2, GitBranch, Loader2, Play } from 'lucide-react'
import { PageHeader, SelfShell } from '../components/SelfShell'
import { ButtonLink, ScoreChip, StatusDot } from '../components/ui'
import { BranchLine, Reveal, RevealGroup, RevealItem } from '../components/fx'
import { stagger } from '../lib/motion'
import { api, ApiError, type AttemptStatus, type AttemptSummary } from '../api'
import { attempts as mockAttempts } from '../data/mock'

// DESIGN.md §7-2b 내 기록: 실제 응시(백엔드) 위에, 목업 예시를 아래에 둔다. 기록마다 리포트와 복기로 들어간다.
// 연출: 표 행은 순차 등장(첫 10행), 표 안쪽은 깨끗하게. 두 묶음 사이 구분선은 BranchLine.

/** 첫 10행만 순서대로 등장하고 나머지는 바로 보인다 */
const STAGGER_ROWS = 10

const statusLabel: Record<AttemptStatus, { s: 'ok' | 'check' | 'down'; t: string }> = {
  SOLVING: { s: 'check', t: '응시 중' },
  FOLLOWUP: { s: 'check', t: '후속 질문 중' },
  SCORING: { s: 'check', t: '채점 중' },
  DONE: { s: 'ok', t: '채점 완료' },
  ERROR: { s: 'down', t: '채점 실패' },
}

const linkCls = 'inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[14px] text-text-muted hover:bg-panel-raised hover:text-text'
const th = 'label h-9 px-4 text-left font-medium'

function Score({ v }: { v?: number | null }) {
  return v == null ? <span className="font-mono text-text-faint">-</span> : <ScoreChip score={Math.round(v)} />
}

function Row({ stagger: on, children }: { stagger: boolean; children: React.ReactNode }) {
  const cls = 'border-b border-line last:border-b-0 hover:bg-panel-raised'
  return on ? (
    <RevealItem as="tr" className={cls}>
      {children}
    </RevealItem>
  ) : (
    <tr className={cls}>{children}</tr>
  )
}

export default function History() {
  const [rows, setRows] = useState<AttemptSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    api.list().then(setRows).catch((e: ApiError) => setError(e.message))
  }, [])

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
      <div className="mx-auto max-w-[1440px] space-y-6 px-8 py-6">
        <Reveal as="section" className="rounded-md border border-line bg-panel shadow-sm">
          <header className="flex h-10 items-center gap-3 border-b border-line px-4">
            <span className="label">MY ATTEMPTS</span>
            <span className="text-[16px] font-semibold">응시 기록</span>
            {rows && <span className="ml-auto font-mono text-[13px] text-text-muted">{rows.length}건</span>}
          </header>
          {error && <p className="px-4 py-6 text-[15px] text-alert">{error}</p>}
          {!rows && !error && (
            <p className="flex items-center gap-2 px-4 py-6 text-[15px] text-text-muted">
              <Loader2 size={16} className="animate-spin" aria-hidden /> 불러오는 중
            </p>
          )}
          {rows && rows.length === 0 && (
            <p className="px-4 py-6 text-[15px] text-text-muted">
              아직 응시한 과제가 없습니다.{' '}
              <Link to="/tasks" className="text-brand underline-offset-4 hover:underline">
                과제 탭
              </Link>
              에서 시작하세요.
            </p>
          )}
          {rows && rows.length > 0 && (
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-line">
                  {['DATE', 'TASK', 'TYPE', 'STATUS', 'TOTAL', ''].map((h) => (
                    <th key={h} className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <RevealGroup as="tbody" gap={stagger.tight}>
                {rows.map((r, i) => (
                  <Row key={r.id} stagger={i < STAGGER_ROWS}>
                    <td className="tnum h-11 px-4 font-mono text-text-muted">{new Date(r.startedAt).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td className="px-4 text-[15px] text-text">{r.taskTitle}</td>
                    <td className="px-4 text-text-muted">{r.taskType === 'dev' ? '개발' : '비개발'}</td>
                    <td className="px-4">
                      <StatusDot status={statusLabel[r.status].s} label={statusLabel[r.status].t} />
                    </td>
                    <td className="px-4">
                      {r.legacyReport ? (
                        <span className="text-[13px] text-text-faint" title="이전 채점 방식입니다. 리포트에서 다시 채점하세요.">이전 방식</span>
                      ) : (
                        <Score v={r.total} />
                      )}
                    </td>
                    <td className="px-4">
                      <div className="flex justify-end gap-1">
                        {r.status === 'SOLVING' || r.status === 'FOLLOWUP' ? (
                          <Link to={`/exam/${r.id}`} className={linkCls}>
                            <Play size={16} aria-hidden /> 이어서 풀기
                          </Link>
                        ) : (
                          <Link to={`/report/${r.id}`} className={linkCls}>
                            <FileBarChart2 size={16} aria-hidden /> 리포트
                          </Link>
                        )}
                        <span className={`${linkCls} cursor-not-allowed opacity-40 hover:bg-transparent`} title="실제 응시의 복기 트리는 준비 중입니다">
                          <GitBranch size={16} aria-hidden /> 복기
                        </span>
                      </div>
                    </td>
                  </Row>
                ))}
              </RevealGroup>
            </table>
          )}
        </Reveal>

        <BranchLine branches={[0.18]} className="text-line" />

        <Reveal as="section" delay={0.1} className="rounded-md border border-line bg-panel shadow-sm">
          <header className="flex h-10 items-center gap-3 border-b border-line px-4">
            <span className="label">EXAMPLES</span>
            <span className="text-[16px] font-semibold">예시 기록</span>
            <span className="ml-auto text-[13px] text-text-muted">목업 데이터입니다. 리포트와 복기 화면 예시를 볼 수 있습니다.</span>
          </header>
          <table className="w-full text-[14px]">
            <thead>
              <tr className="border-b border-line">
                {['DATE', 'TASK', 'TYPE', 'SCORE', ''].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <RevealGroup as="tbody" gap={stagger.tight}>
              {mockAttempts.map((a, i) => (
                <Row key={a.id} stagger={i < STAGGER_ROWS}>
                  <td className="tnum h-11 px-4 font-mono text-text-muted">{a.date}</td>
                  <td className="px-4 text-[15px] text-text">
                    {a.task}
                    <span className="ml-2 rounded-sm bg-panel-raised px-1.5 font-mono text-[12px] text-text-faint">예시</span>
                  </td>
                  <td className="px-4 text-text-muted">{a.type}</td>
                  <td className="px-4">
                    <ScoreChip score={a.score} />
                  </td>
                  <td className="px-4">
                    <div className="flex justify-end gap-1">
                      <Link to="/report/a-1107" className={linkCls}>
                        <FileBarChart2 size={16} aria-hidden /> 리포트
                      </Link>
                      {a.replay ? (
                        <Link to="/replay/t-order-api" className={linkCls}>
                          <GitBranch size={16} aria-hidden /> 복기
                        </Link>
                      ) : (
                        <span className="inline-flex h-7 items-center px-2 text-[14px] text-text-faint">복기 없음</span>
                      )}
                    </div>
                  </td>
                </Row>
              ))}
            </RevealGroup>
          </table>
        </Reveal>
      </div>
    </SelfShell>
  )
}
