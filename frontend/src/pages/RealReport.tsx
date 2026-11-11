import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Bot, ChevronDown, CircleAlert, CircleCheck, Loader2, RotateCcw, User } from 'lucide-react'
import { PageHeader, SelfShell } from '../components/SelfShell'
import { Button, ButtonLink, cx, Panel, Sep } from '../components/ui'
import { COMPETENCIES } from '../data/mock'
import { api, ApiError, type CheckResult, type Report, type ReportResponse, type Turn } from '../api'

// 실제 응시 결과 리포트. 감점식 채점(docs/evaluation/채점_기준표.md): 5개 항목, 총점 100점.

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

const statusView: Record<CheckResult['status'], { text: string; cls: string }> = {
  DEDUCTED: { text: '감점', cls: 'text-alert' },
  PASSED: { text: '통과', cls: 'text-signal' },
  SKIPPED: { text: '적용 안 함', cls: 'text-text-faint' },
  NO_EVIDENCE: { text: '근거 없음', cls: 'text-caution' },
  SPLIT: { text: '판정 엇갈림', cls: 'text-caution' },
}

function CheckRow({ c, onEvidence }: { c: CheckResult; onEvidence: (turn: number) => void }) {
  const s = statusView[c.status]
  const deducted = c.status === 'DEDUCTED'
  return (
    <tr className="border-t border-line align-top">
      <td className="py-2.5 pr-3 pl-7 font-mono text-[12px] text-text-muted">{c.code}</td>
      <td className={cx('py-2.5 pr-4 text-[14px] leading-6', deducted ? 'text-text' : 'text-text-muted')}>{c.label}</td>
      <td className="py-2.5 pr-4 font-mono text-[12px] text-text-faint">{c.method === 'AUTO' ? '자동' : '판정'}</td>
      <td className="tnum py-2.5 pr-4 text-right font-mono text-[14px] whitespace-nowrap">
        {deducted ? <span className="font-semibold text-alert">-{c.deducted}</span> : <span className={s.cls}>{s.text}</span>}
      </td>
      <td className="py-2.5 pr-4">
        {c.reason && <p className="text-[14px] leading-6 text-text-muted">{c.reason}</p>}
        {c.evidence.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {c.evidence.map((e) => {
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
        {c.judges && c.judges.length > 1 && (c.status === 'SPLIT' || c.status === 'DEDUCTED' || c.status === 'NO_EVIDENCE') && (
          <ul className="mt-1.5 space-y-0.5 border-l border-line pl-2.5">
            {c.judges.map((j) => (
              <li key={j.judge} className="text-[13px] leading-5 text-text-faint">
                <span className="font-mono">{j.model}</span>{' '}
                <span className={j.violated ? 'text-alert' : 'text-signal'}>{j.violated ? '걸림' : '안 걸림'}</span>
                {j.reason && <> · {j.reason}</>}
              </li>
            ))}
          </ul>
        )}
      </td>
    </tr>
  )
}

function Done({ r }: { r: Report }) {
  const [selected, setSelected] = useState<number | null>(null)
  const [open, setOpen] = useState<Set<string>>(() => new Set(r.items.map((i) => i.key)))
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
        <div className="flex flex-col items-end">
          <span className="label">TOTAL SCORE</span>
          <div className="flex items-baseline gap-2">
            <span className="tnum font-mono text-display font-semibold">{r.total}</span>
            <span className="font-mono text-[16px] text-text-muted">/{r.max}</span>
          </div>
          <span className="text-[14px] text-text-muted">감점식, 5개 항목</span>
        </div>
      </section>

      <Panel label="BREAKDOWN" title="항목별 점수와 감점 내역" className="col-span-12" flush>
        <ul className="divide-y divide-line">
          {COMPETENCIES.map((c) => {
            const it = items[c.key]
            if (!it) return null
            const lost = it.checks.filter((k) => k.status === 'DEDUCTED')
            const isOpen = open.has(c.key)
            return (
              <li key={c.key}>
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() =>
                    setOpen((o) => {
                      const n = new Set(o)
                      if (n.has(c.key)) n.delete(c.key)
                      else n.add(c.key)
                      return n
                    })
                  }
                  className="grid w-full grid-cols-[180px_280px_96px_1fr_24px] items-center gap-6 px-4 py-3 text-left hover:bg-panel-raised"
                >
                  <span className="text-[15px] font-medium">{c.name}</span>
                  <div className="h-1.5 rounded-full bg-panel-raised">
                    <div className="h-full rounded-full" style={{ width: `${(it.score / it.max) * 100}%`, background: c.color }} />
                  </div>
                  <span className="tnum text-right font-mono text-[16px]">
                    <span className="font-semibold">{it.score}</span>
                    <span className="text-text-muted"> / {it.max}</span>
                  </span>
                  <span className="text-[14px] text-text-muted">{lost.length === 0 ? '감점 없음' : `감점 ${lost.length}건, -${it.max - it.score}점`}</span>
                  <ChevronDown size={16} className={cx('text-text-muted transition-transform duration-[180ms]', isOpen && 'rotate-180')} aria-hidden />
                </button>
                {isOpen && (
                  <div className="bg-panel-sunken pb-1">
                    <table className="w-full">
                      <thead>
                        <tr>
                          {['CODE', '체크 항목', '판정', '결과', '이유와 근거'].map((h, i) => (
                            <th
                              key={h}
                              className={cx('label h-8 pr-4 text-left font-medium', i === 0 && 'w-16 pl-7', i === 2 && 'w-14', i === 3 && 'w-24 text-right')}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {it.checks.map((k) => (
                          <CheckRow key={k.code} c={k} onEvidence={showTurn} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
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
          <Panel label="R1 REPLAY" title="재현성: 다시 실행 판정">
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
                      <td className="py-0.5">
                        {k === 'assistant' ? '어시스턴트' : k === 'r2Replay' ? '다시 실행(R1)' : v.model ? `채점 ${v.model}` : '채점'}
                      </td>
                      <td className="tnum text-right">
                        in {v.input.toLocaleString()}
                        {v.cachedInput ? <span className="text-text-faint"> (캐시 {v.cachedInput.toLocaleString()})</span> : null}
                      </td>
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
    <SelfShell
      header={
        <PageHeader label="SELF-CHECK REPORT" title="결과 리포트">
          <ButtonLink to="/history" variant="secondary">
            내 기록
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
      {data && data.status === 'DONE' && data.report && (data.report.version ?? 1) >= 2 && <Done r={data.report} />}
      {data && data.status === 'DONE' && data.report && (data.report.version ?? 1) < 2 && (
        <div className="mx-auto mt-16 max-w-[640px] rounded-md border border-line bg-panel p-8">
          <span className="label">LEGACY REPORT</span>
          <h2 className="mt-2 text-h2 font-semibold">이전 채점 방식으로 만든 리포트입니다</h2>
          <p className="mt-3 text-[15px] leading-6 text-text-muted">
            채점 기준이 감점식(5개 항목, 총점 100점)으로 바뀌었습니다. 같은 응시 기록으로 다시 채점하면 새 리포트를 볼 수 있습니다.
          </p>
          <Button variant="primary" className="mt-6" onClick={() => void rescore()}>
            <RotateCcw size={18} aria-hidden /> 새 기준으로 다시 채점
          </Button>
        </div>
      )}
      {data && (data.status === 'SCORING' || data.status === 'FOLLOWUP' || data.status === 'SOLVING') && (
        <div className="mx-auto mt-16 max-w-[640px] rounded-md border border-line bg-panel p-8">
          <span className="label">SCORING</span>
          <h2 className="mt-2 flex items-center gap-2 text-h2 font-semibold">
            <Loader2 size={20} className="animate-spin text-signal" aria-hidden /> 채점하고 있습니다
          </h2>
          <ul className="mt-4 space-y-1 text-[15px] leading-6 text-text-muted">
            <li>숨은 테스트 실행 (개발 과제)</li>
            <li>핵심 AI 답변을 같은 모델로 다시 실행해 출력 안정성 측정</li>
            <li>채점 모델이 대화 기록, 결과물, 후속 답변을 보고 감점표의 체크 항목을 판정</li>
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
    </SelfShell>
  )
}
