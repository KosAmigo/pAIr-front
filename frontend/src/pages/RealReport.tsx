import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Bot, CircleAlert, CircleCheck, Loader2, RotateCcw, User } from 'lucide-react'
import { PageHeader, RailShell } from '../components/RailShell'
import { Button, ButtonLink, cx, Panel, Sep } from '../components/ui'
import { COMPETENCIES } from '../data/mock'
import { api, ApiError, type Report, type ReportResponse, type SubScore, type Turn } from '../api'

// 실제 응시 결과 리포트. 재현성, AI 결과 도출력 두 항목만 채점한다 (파일럿 범위).

const MEASURED = new Set(['reproducibility', 'delivery'])

function fmtDuration(sec: number | null) {
  if (sec == null) return '-'
  return [Math.floor(sec / 3600), Math.floor((sec % 3600) / 60), sec % 60].map((n) => String(n).padStart(2, '0')).join(':')
}

function Quote({ m, selected }: { m: Turn; selected: boolean }) {
  const ai = m.role === 'ai'
  return (
    <blockquote
      id={`turn-${m.turn}`}
      className={cx(
        'rounded-sm border-l-2 px-4 py-3 transition-colors duration-[180ms]',
        ai ? 'border-info' : 'border-text-muted',
        selected ? 'bg-panel-raised ring-1 ring-signal' : 'bg-panel-raised/60',
      )}
    >
      <div className="flex items-center gap-2 font-mono text-[12px] text-text-muted">
        {ai ? <Bot size={14} className="text-info" aria-hidden /> : <User size={14} aria-hidden />}
        <span>#T{String(m.turn).padStart(2, '0')}</span>
        <span className={ai ? 'text-info' : 'text-text'}>{ai ? 'AI' : '응시자'}</span>
        <span>{m.time}</span>
      </div>
      <p className="mt-1 max-h-64 overflow-auto text-[15px] leading-6 whitespace-pre-wrap text-text">{m.text}</p>
    </blockquote>
  )
}

function SubRow({ s, color, onEvidence }: { s: SubScore; color: string; onEvidence: (turn: number) => void }) {
  return (
    <li className="grid grid-cols-[180px_220px_48px_1fr] items-start gap-6 px-4 py-3">
      <span className="flex items-baseline gap-2 pl-3 text-[14px]">
        <span className="font-mono text-[12px] text-text-muted">{s.code}</span>
        {s.name}
        <span className="tnum font-mono text-[12px] text-text-faint">{s.weight}%</span>
      </span>
      <div className="mt-2 h-1 rounded-full bg-panel-raised">
        {s.score != null && <div className="h-full rounded-full opacity-80" style={{ width: `${s.score}%`, background: color }} />}
      </div>
      <span className="tnum text-right font-mono text-[15px] font-semibold">{s.score ?? '-'}</span>
      <div className="min-w-0">
        <p className="text-[14px] leading-6 text-text-muted">{s.note}</p>
        {s.evidence.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {s.evidence.map((e) => {
              const m = /^#T(\d+)$/.exec(e.trim())
              return m ? (
                <button
                  key={e}
                  type="button"
                  onClick={() => onEvidence(Number(m[1]))}
                  className="rounded-sm bg-info/12 px-1.5 font-mono text-[12px] text-info hover:bg-info/20"
                >
                  {e}
                </button>
              ) : (
                <span key={e} className="rounded-sm bg-panel-raised px-1.5 font-mono text-[12px] text-text-muted">
                  {e}
                </span>
              )
            })}
          </div>
        )}
      </div>
    </li>
  )
}

function Done({ r }: { r: Report }) {
  const [selected, setSelected] = useState<number | null>(null)
  const showTurn = (t: number) => {
    setSelected(t)
    document.getElementById(`turn-${t}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
  const items = Object.fromEntries(r.items.map((i) => [i.key, i]))
  const tokens = Object.entries(r.tokens ?? {})
  return (
    <div className="mx-auto grid max-w-[1440px] grid-cols-12 gap-2 p-8">
      <section className="col-span-12 flex items-end gap-10 rounded-md border border-line bg-panel px-6 py-5">
        <div className="min-w-0 flex-1">
          <span className="label">{r.taskType === 'dev' ? 'DEV TASK' : 'BIZ TASK'}</span>
          <h2 className="mt-1 text-h1 font-bold">{r.taskTitle}</h2>
          <div className="tnum mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[14px] text-text-muted">
            <span>{new Date(r.startedAt).toLocaleString('ko-KR')}</span>
            <Sep />
            <span>소요 {fmtDuration(r.durationSec)}</span>
            <Sep />
            <span>AI 대화 {r.chatTurns}턴</span>
            <Sep />
            <span>어시스턴트 {r.assistant}</span>
            <Sep />
            <span>채점 {r.judgeModel}</span>
          </div>
        </div>
        {['reproducibility', 'delivery'].map((k) => (
          <div key={k} className="flex flex-col items-end">
            <span className="label">{k === 'reproducibility' ? 'REPRODUCIBILITY' : 'DELIVERY'}</span>
            <div className="flex items-baseline gap-2">
              <span className="tnum font-mono text-display font-semibold">{items[k]?.score ?? '-'}</span>
              <span className="font-mono text-[16px] text-text-muted">/100</span>
            </div>
            <span className="text-[14px] text-text-muted">{items[k]?.name}</span>
          </div>
        ))}
      </section>

      <Panel label="BREAKDOWN" title="항목별 점수" className="col-span-12" flush>
        <ul className="divide-y divide-line">
          {COMPETENCIES.map((c) => {
            const it = items[c.key]
            if (!MEASURED.has(c.key) || !it) {
              return (
                <li key={c.key} className="grid grid-cols-[180px_220px_48px_1fr] items-center gap-6 px-4 py-3 opacity-60">
                  <span className="text-[15px] font-medium">{c.name}</span>
                  <div className="h-1.5 rounded-full bg-panel-raised" />
                  <span className="text-right font-mono text-[16px] text-text-faint">-</span>
                  <span className="text-[14px] text-text-muted">이번 파일럿 범위 아님</span>
                </li>
              )
            }
            return (
              <li key={c.key}>
                <div className="grid grid-cols-[180px_220px_48px_1fr] items-center gap-6 px-4 py-3">
                  <span className="text-[15px] font-medium">{c.name}</span>
                  <div className="h-1.5 rounded-full bg-panel-raised">
                    {it.score != null && <div className="h-full rounded-full" style={{ width: `${it.score}%`, background: c.color }} />}
                  </div>
                  <span className="tnum text-right font-mono text-[16px] font-semibold">{it.score ?? '-'}</span>
                  <span className="text-[14px] text-text-muted">하위 기준 {it.sub.length}개, 가중 평균</span>
                </div>
                <ul className="border-t border-line bg-panel-sunken">
                  {it.sub.map((s) => (
                    <SubRow key={s.code} s={s} color={c.color} onEvidence={showTurn} />
                  ))}
                </ul>
              </li>
            )
          })}
        </ul>
      </Panel>

      <Panel label="TRANSCRIPT" title="AI 대화 기록" className="col-span-7" bodyClassName="max-h-[720px] overflow-auto space-y-2">
        {r.transcript.length === 0 ? (
          <p className="text-[15px] text-text-muted">AI와 나눈 대화가 없습니다.</p>
        ) : (
          r.transcript.map((t) => <Quote key={t.turn} m={t} selected={selected === t.turn} />)
        )}
      </Panel>

      <div className="col-span-5 flex flex-col gap-2">
        {r.r2KeyTurns && r.r2KeyTurns.length > 0 && (
          <Panel label="R2 REPLAY" title="출력 안정성 다시 실행">
            <ul className="space-y-3">
              {r.r2KeyTurns.map((k) => (
                <li key={k.turn}>
                  <div className="flex items-center gap-2 text-[14px]">
                    <button type="button" onClick={() => showTurn(k.turn)} className="rounded-sm bg-info/12 px-1.5 font-mono text-[12px] text-info hover:bg-info/20">
                      #T{String(k.turn).padStart(2, '0')}
                    </button>
                    <span className="text-text-muted">최종 결과물 반영률</span>
                    <span className="tnum font-mono">{Math.round(k.adoption * 100)}%</span>
                  </div>
                  <ul className="mt-1 space-y-1 pl-2">
                    {k.verdicts.map((v) => (
                      <li key={v.replay} className="flex items-start gap-2 text-[14px] leading-6">
                        {v.same ? <CircleCheck size={16} className="mt-1 shrink-0 text-signal" aria-label="같은 해결책" /> : <CircleAlert size={16} className="mt-1 shrink-0 text-caution" aria-label="다른 해결책" />}
                        <span className="text-text-muted">
                          다시 실행 {v.replay}: {v.reason}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {r.hiddenTests && (
          <Panel label="HIDDEN TESTS" title="숨은 테스트 결과">
            <ul className="space-y-1 font-mono text-[13px]">
              {r.hiddenTests.map((t) => (
                <li key={t.name} className={t.passed ? 'text-signal' : 'text-alert'}>
                  {t.passed ? '[OK]' : '[X] '} {t.name}
                </li>
              ))}
            </ul>
          </Panel>
        )}

        <Panel label="NOTES" title="채점 메모">
          <ul className="space-y-2">
            {r.notes.map((n) => (
              <li key={n} className="border-l-2 border-line-strong pl-3 text-[14px] leading-5 text-text-muted">
                {n}
              </li>
            ))}
          </ul>
          {tokens.length > 0 && (
            <>
              <h3 className="label mt-4">TOKENS</h3>
              <table className="mt-2 w-full font-mono text-[13px]">
                <tbody>
                  {tokens.map(([k, v]) => (
                    <tr key={k} className="text-text-muted">
                      <td className="py-0.5">{k === 'assistant' ? '어시스턴트' : k === 'r2Replay' ? 'R2 다시 실행' : '채점'}</td>
                      <td className="tnum text-right">in {v.input.toLocaleString()}</td>
                      <td className="tnum text-right">out {v.output.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Panel>
      </div>
    </div>
  )
}

export default function RealReport() {
  const { attemptId = '' } = useParams()
  const [data, setData] = useState<ReportResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let alive = true
    api
      .report(attemptId)
      .then((d) => {
        if (!alive) return
        setData(d)
        setError(null)
        if (d.status === 'SCORING' || d.status === 'FOLLOWUP' || d.status === 'SOLVING') {
          timer.current = setTimeout(() => setTick((t) => t + 1), 2000)
        }
      })
      .catch((e: ApiError) => alive && setError(e.message))
    return () => {
      alive = false
      if (timer.current) clearTimeout(timer.current)
    }
  }, [attemptId, tick])

  const rescore = async () => {
    try {
      await api.rescore(attemptId)
      setData((d) => (d ? { ...d, status: 'SCORING', error: null } : d))
      setTick((t) => t + 1)
    } catch (e) {
      setError((e as ApiError).message)
    }
  }

  return (
    <RailShell
      header={
        <PageHeader label="SELF-CHECK REPORT" title="결과 리포트">
          <ButtonLink to="/dashboard" variant="secondary">
            대시보드
          </ButtonLink>
        </PageHeader>
      }
    >
      {error && <p className="m-8 rounded-md border border-alert/40 bg-alert/10 p-4 text-[15px] text-alert">{error}</p>}
      {!data && !error && (
        <p className="m-8 flex items-center gap-2 text-body text-text-muted">
          <Loader2 size={18} className="animate-spin" aria-hidden /> 불러오는 중
        </p>
      )}
      {data && data.status === 'DONE' && data.report && <Done r={data.report} />}
      {data && (data.status === 'SCORING' || data.status === 'FOLLOWUP' || data.status === 'SOLVING') && (
        <div className="mx-auto mt-16 max-w-[640px] rounded-md border border-line bg-panel p-8">
          <span className="label">SCORING</span>
          <h2 className="mt-2 flex items-center gap-2 text-h2 font-semibold">
            <Loader2 size={20} className="animate-spin text-signal" aria-hidden /> 채점하고 있습니다
          </h2>
          <ul className="mt-4 space-y-1 text-[15px] leading-6 text-text-muted">
            <li>숨은 테스트 실행 (개발 과제)</li>
            <li>핵심 AI 답변을 같은 모델로 다시 실행해 출력 안정성 측정</li>
            <li>채점 모델이 대화 기록, 결과물, 후속 답변을 기준표로 채점</li>
          </ul>
          <p className="mt-4 text-[14px] text-text-faint">보통 1~3분 걸립니다. 이 화면은 2초마다 자동으로 새로 고칩니다.</p>
        </div>
      )}
      {data && data.status === 'ERROR' && (
        <div className="mx-auto mt-16 max-w-[640px] rounded-md border border-alert/40 bg-panel p-8">
          <span className="label text-alert">SCORING FAILED</span>
          <h2 className="mt-2 text-h2 font-semibold">채점하지 못했습니다</h2>
          <p className="mt-3 text-[15px] leading-6 text-text">{data.error}</p>
          <Button variant="secondary" className="mt-6" onClick={() => void rescore()}>
            <RotateCcw size={18} aria-hidden /> 다시 채점
          </Button>
        </div>
      )}
    </RailShell>
  )
}
