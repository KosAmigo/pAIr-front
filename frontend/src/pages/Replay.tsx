import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Bot, FileBarChart2, GitBranch, Loader2, User } from 'lucide-react'
import { StageSection } from '../components/fx'
import { PageHeader, SelfShell } from '../components/SelfShell'
import { cx } from '../components/cx'
import { ButtonLink } from '../components/ui'
import { ErrorState } from '../components/ErrorState'
import { api, ApiError, type ReportResponse, type Turn } from '../api'

// DESIGN.md §7-5 복기 화면
// 분기(체크포인트에서 다시 풀기) API 가 아직 백엔드에 없어 복기 트리는 준비 중으로 두고,
// 오른쪽에는 리포트(GET /api/attempts/{id}/report)에 담긴 실제 AI 대화 기록을 보여 준다.

function TurnItem({ t }: { t: Turn }) {
  const ai = t.role === 'ai'
  return (
    <li className={cx('rounded-sm border-l-2 bg-panel-raised px-4 py-3', ai ? 'border-info' : 'border-text-muted')}>
      <div className="flex items-center gap-2 font-mono text-[12px] text-text-muted">
        {ai ? <Bot size={14} className="text-info" aria-hidden /> : <User size={14} aria-hidden />}
        <span>#T{String(t.turn).padStart(2, '0')}</span>
        <span className={ai ? 'text-info' : 'text-text'}>{ai ? 'AI' : '응시자'}</span>
        <span>{t.time}</span>
      </div>
      <p className="mt-1 text-[15px] leading-6 break-words whitespace-pre-wrap text-text">{t.text}</p>
    </li>
  )
}

export default function Replay() {
  const { attemptId = '' } = useParams()
  const [data, setData] = useState<ReportResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    api
      .report(attemptId)
      .then((d) => {
        if (!alive) return
        setData(d)
        setError(null)
      })
      .catch((e: ApiError) => alive && setError(e.message))
    return () => {
      alive = false
    }
  }, [attemptId, tick])

  const report = data?.report ?? null
  const turns = report?.transcript ?? []

  return (
    <SelfShell
      header={
        <PageHeader label="SELF-CHECK REPLAY" title={report ? `${report.taskTitle} — 복기` : '복기'}>
          <ButtonLink to={`/report/${attemptId}`} variant="secondary">
            <FileBarChart2 size={18} aria-hidden /> 리포트
          </ButtonLink>
        </PageHeader>
      }
    >
      {error ? (
        <ErrorState message={error} onRetry={() => setTick((t) => t + 1)} className="mt-16" />
      ) : !data ? (
        <p className="m-8 flex items-center gap-2 text-body text-text-muted">
          <Loader2 size={18} className="animate-spin" aria-hidden /> 불러오는 중
        </p>
      ) : (
        <div className="grid h-full min-h-0 grid-cols-12">
          <div className="col-span-7 min-h-0 p-4 pr-2">
            <StageSection className="h-full" aria-label="분기 그래프">
              <div className="flex h-full flex-col items-center justify-center gap-3 px-10 py-16 text-center">
                <GitBranch size={28} className="text-stage-muted" aria-hidden />
                <p className="text-[17px] font-semibold text-stage-text">복기 트리는 준비 중인 기능입니다</p>
                <p className="text-[14px] text-stage-muted">체크포인트에서 다시 풀기와 분기 비교는 아직 백엔드와 연결되지 않았습니다.</p>
              </div>
            </StageSection>
          </div>
          <section className="col-span-5 my-4 mr-4 ml-2 flex min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-sm" aria-label="AI 대화 기록">
            <header className="flex h-10 shrink-0 items-center border-b border-line px-4">
              <span className="label">TRANSCRIPT</span>
              <span className="ml-3 text-[16px] font-semibold">AI 대화 기록</span>
              <span className="tnum ml-auto font-mono text-[13px] text-text-muted">{turns.length}턴</span>
            </header>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              {turns.length > 0 ? (
                <ol className="flex flex-col gap-2">
                  {turns.map((t) => (
                    <TurnItem key={`${t.turn}-${t.role}`} t={t} />
                  ))}
                </ol>
              ) : (
                <p className="py-10 text-center text-[15px] text-text-muted">
                  {report ? '아직 데이터가 없습니다. 이 응시에는 AI 대화 기록이 없습니다.' : '채점이 끝나면 대화 기록을 볼 수 있습니다.'}
                </p>
              )}
            </div>
          </section>
        </div>
      )}
    </SelfShell>
  )
}
