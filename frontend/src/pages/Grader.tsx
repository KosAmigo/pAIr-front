import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Download, ExternalLink, Loader2, Play, Save, Square, Star } from 'lucide-react'
import { Button, cx, Logo, Tabs } from '../components/ui'
import {
  ApiError,
  grader,
  type GraderAttempt,
  type GraderEstimate,
  type GraderRef,
  type GraderResult,
  type GraderRubric,
  type GraderRun,
  type PromptVersion,
  type PromptVersionRow,
} from '../api'

// 채점 툴 (임시 기능, DESIGN.md §7-9). 프롬프트 버전 편집, 실험 채점(여러 응시 × N번), 결과 분석.
// 프롬프트 버전과 샘플 응시는 grader/ 폴더로 git 공유, 실험 결과는 각자 PC(pilot-data/grader)에 쌓인다.

type Tab = 'versions' | 'run' | 'results'

const AUTHOR_KEY = 'pair.grader.author'
function loadAuthor() {
  try {
    return localStorage.getItem(AUTHOR_KEY) ?? ''
  } catch {
    return ''
  }
}
function saveAuthor(v: string) {
  try {
    localStorage.setItem(AUTHOR_KEY, v)
  } catch {
    // 저장 못 해도 동작에는 문제 없음
  }
}

const fmtDate = (s: string | null | undefined) => (s ? new Date(s).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-')
const usd = (v: number) => `$${v < 0.1 ? v.toFixed(3) : v.toFixed(2)}`
const refKey = (r: GraderRef) => `${r.source}:${r.id}`
const inputCls = 'h-9 rounded-md border border-line-strong bg-panel-raised px-3 text-[15px] text-text outline-none focus:border-signal'
const areaCls = 'w-full rounded-md border border-line-strong bg-panel-raised p-3 font-mono text-[13px] leading-5 text-text outline-none focus:border-signal'
const th = 'label h-9 px-3 text-left font-medium'

function Box({ label, title, actions, children, className }: { label: string; title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-md border border-line bg-panel', className)}>
      <header className="flex h-10 items-center gap-3 border-b border-line px-4">
        <span className="label">{label}</span>
        {title && <h2 className="truncate text-[16px] font-semibold">{title}</h2>}
        {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
      </header>
      {children}
    </section>
  )
}

function Loading() {
  return (
    <p className="flex items-center gap-2 px-4 py-6 text-[15px] text-text-muted">
      <Loader2 size={16} className="animate-spin" aria-hidden /> 불러오는 중
    </p>
  )
}

// ══ 1. 프롬프트 버전 ══════════════════════

function VersionsTab({ rubric, author, onChanged }: { rubric: GraderRubric; author: string; onChanged: () => void }) {
  const [rows, setRows] = useState<PromptVersionRow[] | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [v, setV] = useState<PromptVersion | null>(null)
  const [draft, setDraft] = useState<PromptVersion | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    grader
      .versions()
      .then((r) => {
        setRows(r)
        setSel((s) => s ?? r.find((x) => x.active)?.id ?? r[0]?.id ?? null)
      })
      .catch((e: ApiError) => setErr(e.message))
  }, [])
  useEffect(load, [load])
  useEffect(() => {
    if (!sel) return
    setV(null)
    grader.version(sel).then(setV).catch((e: ApiError) => setErr(e.message))
  }, [sel])

  const editing = draft !== null
  const shown = draft ?? v
  const parent = v

  const startEdit = () => {
    if (!v) return
    setDraft({ ...v, name: '', note: '', author, parent: v.id, checks: structuredClone(v.checks) })
    setErr(null)
  }
  const save = async () => {
    if (!draft) return
    setBusy(true)
    setErr(null)
    try {
      const { id: _id, createdAt: _c, ...body } = draft
      void _id
      void _c
      const saved = await grader.createVersion({ ...body, author })
      setDraft(null)
      setSel(saved.id)
      load()
      onChanged()
    } catch (e) {
      setErr((e as ApiError).message)
    } finally {
      setBusy(false)
    }
  }
  const activate = async (id: string) => {
    setErr(null)
    try {
      await grader.setActive(id)
      load()
      onChanged()
    } catch (e) {
      setErr((e as ApiError).message)
    }
  }
  const setCheck = (key: string, patch: Partial<{ hint: string | null; points: number }>) =>
    setDraft((d) => (d ? { ...d, checks: { ...d.checks, [key]: { ...d.checks[key], ...patch } } } : d))

  const activeRow = rows?.find((r) => r.id === sel)

  return (
    <div className="grid min-h-0 grid-cols-[320px_minmax(0,1fr)] gap-4">
      <Box label="VERSIONS" title="버전 목록" className="self-start">
        {!rows ? (
          <Loading />
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  disabled={editing}
                  onClick={() => setSel(r.id)}
                  className={cx('block w-full px-4 py-2.5 text-left disabled:opacity-50', sel === r.id ? 'bg-panel-raised' : 'hover:bg-panel-raised/60')}
                >
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-semibold">{r.name}</span>
                    {r.active && (
                      <span className="inline-flex items-center gap-1 rounded-sm bg-signal/12 px-1.5 font-mono text-[11px] text-signal">
                        <Star size={11} aria-hidden /> 실제 채점
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[12px] text-text-faint">
                    {r.author} · {fmtDate(r.createdAt)}
                  </div>
                  {r.note && <div className="mt-0.5 truncate text-[13px] text-text-muted">{r.note}</div>}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="border-t border-line px-4 py-3 text-[13px] leading-5 text-text-faint">
          버전 파일은 <span className="font-mono">grader/versions/</span>에 생깁니다. 커밋하고 push하면 팀원이 pull받아 같이 씁니다. 실제 채점 버전 지정은 각자 PC에만 저장됩니다.
        </p>
      </Box>

      <div className="min-w-0 space-y-4">
        {err && <p className="rounded-md border border-alert/40 bg-alert/10 px-4 py-2 text-[14px] text-alert">{err}</p>}
        {!shown ? (
          <Box label="VERSION">
            <Loading />
          </Box>
        ) : (
          <>
            <Box
              label={editing ? 'NEW VERSION' : 'VERSION'}
              title={editing ? `새 버전 (${parent?.name} 바탕)` : shown.name}
              actions={
                editing ? (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => setDraft(null)} disabled={busy}>
                      취소
                    </Button>
                    <Button variant="primary" size="sm" onClick={() => void save()} disabled={busy || !author.trim()}>
                      {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Save size={14} aria-hidden />} 새 버전으로 저장
                    </Button>
                  </>
                ) : (
                  <>
                    {activeRow && !activeRow.active && (
                      <Button variant="secondary" size="sm" onClick={() => void activate(shown.id)}>
                        <Star size={14} aria-hidden /> 실제 채점에 사용
                      </Button>
                    )}
                    <Button variant="primary" size="sm" onClick={startEdit} disabled={!author.trim()} title={author.trim() ? '' : '오른쪽 위에 작성자 이름을 먼저 입력하세요'}>
                      이 버전을 고쳐 새로 만들기
                    </Button>
                  </>
                )
              }
            >
              <div className="space-y-4 p-4">
                {editing ? (
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3">
                    <label className="flex flex-col gap-1">
                      <span className="label">이름</span>
                      <input className={inputCls} value={draft.name} maxLength={30} placeholder="예: U2기준수정" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="label">메모 (무엇을 왜 바꿨는지)</span>
                      <input className={inputCls} value={draft.note} placeholder="예: U2 판정이 흔들려서 '추측' 기준을 구체화" onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
                    </label>
                  </div>
                ) : (
                  <p className="font-mono text-[13px] text-text-muted">
                    {shown.id} · {shown.author} · {fmtDate(shown.createdAt)}
                    {shown.parent && <> · {shown.parent} 바탕</>}
                    {shown.note && <span className="mt-1 block font-sans text-[14px] text-text">{shown.note}</span>}
                  </p>
                )}
                <PromptField label="공통 채점 규칙 (채점 모델 시스템 프롬프트)" value={shown.judgeSystem} base={parent?.judgeSystem} editing={editing} rows={10}
                  onChange={(t) => draft && setDraft({ ...draft, judgeSystem: t })} />
                <PromptField label="R1 비교 프롬프트 (다시 실행한 답이 같은 해결책인지 판정)" value={shown.replaySystem} base={parent?.replaySystem} editing={editing} rows={5}
                  onChange={(t) => draft && setDraft({ ...draft, replaySystem: t })} />
              </div>
            </Box>

            {rubric.items.map((item) => (
              <Box key={item.key} label={item.key.toUpperCase()} title={`${item.name} (${item.max}점)`}>
                <table className="w-full table-fixed">
                  <colgroup>
                    <col className="w-24" />
                    <col />
                    <col className="w-24" />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-line text-text-faint">
                      <th className={th}>코드</th>
                      <th className={th}>체크 항목과 판정 기준</th>
                      <th className={cx(th, 'text-right')}>감점</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rubric.checks
                      .filter((c) => c.item === item.key)
                      .map((c) => {
                        const cur = shown.checks[c.key] ?? { hint: c.defaultHint, points: c.defaultPoints }
                        const base = parent?.checks[c.key]
                        const hintChanged = editing && base && (cur.hint ?? '') !== (base.hint ?? '')
                        const pointsChanged = editing && base && cur.points !== base.points
                        return (
                          <tr key={c.key} className="border-b border-line align-top last:border-0">
                            <td className="px-3 py-2.5 font-mono text-[13px] text-text-muted">
                              {c.code}
                              {c.track !== 'all' && <span className="ml-1 rounded-sm bg-panel-raised px-1 text-[11px]">{c.track === 'dev' ? '개발' : '비개발'}</span>}
                              <div className="text-[11px] text-text-faint">{c.method === 'AUTO' ? '자동' : '판정'}</div>
                            </td>
                            <td className="px-3 py-2.5">
                              <p className="text-[14px] leading-6">{c.label}</p>
                              {c.method === 'JUDGE' &&
                                (editing ? (
                                  <textarea
                                    aria-label={`${c.code} 판정 기준`}
                                    className={cx(areaCls, 'mt-1.5 font-sans text-[14px]', hintChanged && 'border-caution')}
                                    rows={3}
                                    value={cur.hint ?? ''}
                                    onChange={(e) => setCheck(c.key, { hint: e.target.value })}
                                  />
                                ) : (
                                  <p className="mt-1 text-[13px] leading-5 text-text-muted">판정 기준: {cur.hint}</p>
                                ))}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              {editing && c.pointsEditable ? (
                                <input
                                  type="number"
                                  min={1}
                                  max={30}
                                  aria-label={`${c.code} 감점`}
                                  className={cx(inputCls, 'tnum w-16 text-right font-mono', pointsChanged && 'border-caution')}
                                  value={cur.points}
                                  onChange={(e) => setCheck(c.key, { points: Number(e.target.value) })}
                                />
                              ) : (
                                <span className="tnum font-mono text-[14px] text-alert">-{cur.points}</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </Box>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

function PromptField({ label, value, base, editing, rows, onChange }: { label: string; value: string; base?: string; editing: boolean; rows: number; onChange: (t: string) => void }) {
  const changed = editing && base !== undefined && value !== base
  return (
    <label className="flex flex-col gap-1">
      <span className="label">
        {label}
        {changed && <span className="ml-2 text-caution">바뀜</span>}
      </span>
      {editing ? (
        <textarea className={cx(areaCls, changed && 'border-caution')} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <pre className="rounded-md bg-panel-sunken p-3 font-mono text-[13px] leading-5 whitespace-pre-wrap text-text-muted">{value}</pre>
      )}
    </label>
  )
}

// ══ 2. 실험 채점 ══════════════════════

function RunTab({ rubric, author, versionsKey, onStarted }: { rubric: GraderRubric; author: string; versionsKey: number; onStarted: (runId: string) => void }) {
  const [attempts, setAttempts] = useState<GraderAttempt[] | null>(null)
  const [versions, setVersions] = useState<PromptVersionRow[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [versionId, setVersionId] = useState('')
  // 기본값: 채점 횟수 3번(흔들림을 보려고), R1 다시 실행과 채점 모델 반복은 실제 채점과 같게
  const defaults = { count: 3, replays: rubric.defaults.replays, judgeRepeat: rubric.defaults.judgeRepeat }
  const [count, setCount] = useState(defaults.count)
  const [replays, setReplays] = useState(defaults.replays)
  const [judgeRepeat, setJudgeRepeat] = useState(defaults.judgeRepeat)
  const isDefault = count === defaults.count && replays === defaults.replays && judgeRepeat === defaults.judgeRepeat
  const resetDefaults = () => {
    setCount(defaults.count)
    setReplays(defaults.replays)
    setJudgeRepeat(defaults.judgeRepeat)
  }
  const [est, setEst] = useState<GraderEstimate | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    grader.attempts().then(setAttempts).catch((e: ApiError) => setErr(e.message))
  }, [])
  useEffect(() => {
    grader
      .versions()
      .then((r) => {
        setVersions(r)
        setVersionId((v) => v || r.find((x) => x.active)?.id || r[0]?.id || '')
      })
      .catch((e: ApiError) => setErr(e.message))
  }, [versionsKey])

  const refs = useMemo<GraderRef[]>(
    () => (attempts ?? []).filter((a) => picked.has(refKey(a))).map((a) => ({ source: a.source, id: a.id })),
    [attempts, picked],
  )
  const req = useMemo(() => ({ attempts: refs, versionId, count, replays, judgeRepeat }), [refs, versionId, count, replays, judgeRepeat])

  useEffect(() => {
    if (!refs.length) {
      setEst(null)
      return
    }
    const id = setTimeout(() => {
      grader.estimate(req).then(setEst).catch((e: ApiError) => setErr(e.message))
    }, 250)
    return () => clearTimeout(id)
  }, [req, refs.length])

  const toggle = (a: GraderAttempt) =>
    setPicked((s) => {
      const n = new Set(s)
      const k = refKey(a)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })

  const start = async () => {
    setBusy(true)
    setErr(null)
    try {
      const run = await grader.start({ ...req, author })
      onStarted(run.id)
    } catch (e) {
      setErr((e as ApiError).message)
    } finally {
      setBusy(false)
    }
  }

  const groups: { title: string; label: string; rows: GraderAttempt[] }[] = attempts
    ? [
        { label: 'SAMPLES', title: '샘플 응시 (팀 공용, git 공유)', rows: attempts.filter((a) => a.source === 'sample') },
        { label: 'MINE', title: '내 응시 (이 PC, 후속 질문까지 끝난 것)', rows: attempts.filter((a) => a.source === 'mine') },
      ]
    : []

  const num = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(v) || min))

  return (
    <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_360px] gap-4">
      <div className="min-w-0 space-y-4">
        {!attempts && !err && (
          <Box label="ATTEMPTS">
            <Loading />
          </Box>
        )}
        {groups.map((g) => (
          <Box key={g.label} label={g.label} title={g.title} actions={<span className="font-mono text-[13px] text-text-muted">{g.rows.length}건</span>}>
            {g.rows.length === 0 ? (
              <p className="px-4 py-4 text-[14px] text-text-muted">없습니다.</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-line text-text-faint">
                    <th className={cx(th, 'w-10')} aria-label="선택" />
                    <th className={th}>응시</th>
                    <th className={th}>과제</th>
                    <th className={th}>날짜</th>
                    <th className={cx(th, 'text-right')}>대화</th>
                    <th className={cx(th, 'text-right')}>지난 점수</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((a) => {
                    const on = picked.has(refKey(a))
                    return (
                      <tr key={refKey(a)} onClick={() => toggle(a)} className={cx('cursor-pointer border-b border-line last:border-0', on ? 'bg-signal/6' : 'hover:bg-panel-raised/60')}>
                        <td className="px-3 py-2">
                          <input type="checkbox" checked={on} onChange={() => toggle(a)} onClick={(e) => e.stopPropagation()} aria-label={`${a.label ?? a.id} 선택`} className="size-4 accent-[var(--color-signal)]" />
                        </td>
                        <td className="px-3 py-2">
                          <div className="text-[14px]">{a.label ?? <span className="font-mono">{a.id}</span>}</div>
                          {a.label && <div className="font-mono text-[12px] text-text-faint">{a.id}</div>}
                        </td>
                        <td className="px-3 py-2 text-[14px] text-text-muted">
                          <span className="mr-1.5 rounded-sm bg-panel-raised px-1 font-mono text-[11px]">{a.taskType === 'dev' ? '개발' : '비개발'}</span>
                          {a.taskTitle}
                        </td>
                        <td className="px-3 py-2 font-mono text-[13px] text-text-muted">{fmtDate(a.startedAt)}</td>
                        <td className="tnum px-3 py-2 text-right font-mono text-[13px] text-text-muted">{Math.floor(a.chatTurns / 2)}턴</td>
                        <td className="tnum px-3 py-2 text-right font-mono text-[14px]">{a.total ?? '-'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </Box>
        ))}
      </div>

      <div className="space-y-4 self-start">
        <Box
          label="SETTINGS"
          title="채점 설정"
          actions={
            <Button variant="ghost" size="sm" onClick={resetDefaults} disabled={isDefault} aria-label="전체 기본값으로 되돌리기" title={`채점 횟수 ${defaults.count}번, R1 다시 실행 ${defaults.replays}번, 채점 모델 ${defaults.judgeRepeat}번`}>
              전체 기본값
            </Button>
          }
        >
          <div className="space-y-3 p-4">
            <label className="flex flex-col gap-1">
              <span className="label">프롬프트 버전</span>
              <select className={inputCls} value={versionId} onChange={(e) => setVersionId(e.target.value)}>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.author}){v.active ? ' · 실제 채점' : ''}
                  </option>
                ))}
              </select>
            </label>
            <NumField label="응시마다 채점 횟수" value={count} def={defaults.count} min={1} max={20} onChange={(v) => setCount(num(v, 1, 20))} hint="같은 응시를 여러 번 채점해 점수가 얼마나 흔들리는지 봄. 실제 채점은 1번" />
            <NumField label="R1 다시 실행 횟수 (핵심 턴마다)" value={replays} def={defaults.replays} min={1} max={10} onChange={(v) => setReplays(num(v, 1, 10))} hint="기본값이 실제 채점과 같음. 늘리면 R1 운의 영향이 줄어듦" />
            <NumField label="채점 모델 반복 (모델마다 N번 불러 평균)" value={judgeRepeat} def={defaults.judgeRepeat} min={1} max={3} onChange={(v) => setJudgeRepeat(num(v, 1, 3))} hint="기본값이 실제 채점과 같음. 2번이면 판정 흔들림이 줄어드는지 볼 수 있음" />
          </div>
        </Box>
        <Box label="ESTIMATE" title="예상 비용">
          <div className="p-4">
            {!refs.length ? (
              <p className="text-[14px] text-text-muted">왼쪽에서 응시를 고르세요.</p>
            ) : !est ? (
              <Loading />
            ) : (
              <>
                <div className="flex items-baseline gap-3">
                  <span className="tnum font-mono text-[28px] font-bold">{usd(est.usd)}</span>
                  <span className="text-[14px] text-text-muted">약 {Math.max(1, Math.round(est.minutes))}분</span>
                </div>
                <p className="mt-1 text-[14px] text-text-muted">
                  응시 {refs.length}개 × {count}번 = 채점 {est.scorings}번
                </p>
                <p className="mt-2 text-[12px] leading-5 text-text-faint">
                  지난 채점의 실제 토큰으로 계산(지난 기록이 없으면 같은 과제 기록이나 기본값). 동시에 {rubric.defaults.parallel}건씩 채점. 비용은 각자의 API 키로 나갑니다.
                </p>
              </>
            )}
            {err && <p className="mt-3 text-[14px] text-alert">{err}</p>}
            <Button variant="primary" className="mt-4 w-full" disabled={!refs.length || !versionId || busy || !author.trim()} onClick={() => void start()}>
              {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Play size={16} aria-hidden />} 채점 시작
            </Button>
            {!author.trim() && <p className="mt-2 text-[13px] text-caution">오른쪽 위에 작성자 이름을 먼저 입력하세요.</p>}
          </div>
        </Box>
      </div>
    </div>
  )
}

function NumField({ label, value, def, min, max, hint, onChange }: { label: string; value: number; def: number; min: number; max: number; hint?: string; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label">{label}</span>
      <span className="flex items-center gap-2">
        <input type="number" min={min} max={max} className={cx(inputCls, 'tnum w-24 font-mono', value !== def && 'border-caution')} value={value} onChange={(e) => onChange(Number(e.target.value))} />
        {/* 항목별 기본값 버튼: 기본값과 다를 때만 누를 수 있다 */}
        <button
          type="button"
          disabled={value === def}
          onClick={(e) => {
            e.preventDefault()
            onChange(def)
          }}
          aria-label={`${label} 기본값 ${def}으로`}
          className={cx(
            'inline-flex h-7 items-center rounded-md border px-2 font-mono text-[13px] transition-colors duration-[120ms]',
            value === def ? 'cursor-default border-transparent text-text-faint' : 'border-caution/50 text-caution hover:bg-caution/10',
          )}
        >
          기본 {def}
        </button>
      </span>
      {hint && <span className="text-[12px] leading-4 text-text-faint">{hint}</span>}
    </label>
  )
}

// ══ 3. 결과 ══════════════════════

const runStatus: Record<GraderRun['status'], { t: string; cls: string }> = {
  RUNNING: { t: '채점 중', cls: 'text-caution' },
  DONE: { t: '완료', cls: 'text-signal' },
  CANCELLED: { t: '멈춤', cls: 'text-text-muted' },
  INTERRUPTED: { t: '중단됨', cls: 'text-alert' },
}

const r1Of = (r: GraderResult) => r.checks.find((c) => c.code === 'R1')?.deducted ?? 0
const stats = (xs: number[]) => {
  if (!xs.length) return { min: 0, max: 0, avg: 0, range: 0 }
  const min = Math.min(...xs)
  const max = Math.max(...xs)
  return { min, max, avg: xs.reduce((a, b) => a + b, 0) / xs.length, range: max - min }
}

function ResultsTab({ selected, onSelect }: { selected: string | null; onSelect: (id: string) => void }) {
  const [runs, setRuns] = useState<GraderRun[] | null>(null)
  const [data, setData] = useState<{ meta: GraderRun; results: GraderResult[] } | null>(null)
  const [compareId, setCompareId] = useState('')
  const [compare, setCompare] = useState<{ meta: GraderRun; results: GraderResult[] } | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const loadRuns = useCallback(() => {
    grader
      .runs()
      .then((r) => {
        setRuns(r)
        if (!selected && r[0]) onSelect(r[0].id)
      })
      .catch((e: ApiError) => setErr(e.message))
  }, [selected, onSelect])
  useEffect(loadRuns, [loadRuns])

  useEffect(() => {
    if (!selected) return
    let alive = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = () => {
      grader
        .run(selected)
        .then((d) => {
          if (!alive) return
          setData(d)
          if (d.meta.status === 'RUNNING') timer = setTimeout(tick, 3000)
          else loadRunsQuiet()
        })
        .catch((e: ApiError) => setErr(e.message))
    }
    const loadRunsQuiet = () => grader.runs().then((r) => alive && setRuns(r)).catch(() => {})
    setData(null)
    tick()
    return () => {
      alive = false
      if (timer) clearTimeout(timer)
    }
  }, [selected])

  useEffect(() => {
    if (!compareId) {
      setCompare(null)
      return
    }
    grader.run(compareId).then(setCompare).catch((e: ApiError) => setErr(e.message))
  }, [compareId])

  const cancel = async () => {
    if (!selected) return
    try {
      await grader.cancel(selected)
    } catch (e) {
      setErr((e as ApiError).message)
    }
  }

  return (
    <div className="grid min-h-0 grid-cols-[320px_minmax(0,1fr)] gap-4">
      <Box label="RUNS" title="실험 채점 기록" className="self-start">
        {!runs ? (
          <Loading />
        ) : runs.length === 0 ? (
          <p className="px-4 py-4 text-[14px] text-text-muted">아직 실험 채점이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-line">
            {runs.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => onSelect(r.id)} className={cx('block w-full px-4 py-2.5 text-left', selected === r.id ? 'bg-panel-raised' : 'hover:bg-panel-raised/60')}>
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-semibold">{r.versionName}</span>
                    <span className={cx('ml-auto font-mono text-[12px]', runStatus[r.status].cls)}>{runStatus[r.status].t}</span>
                  </div>
                  <div className="mt-0.5 font-mono text-[12px] text-text-faint">
                    {fmtDate(r.createdAt)} · 응시 {r.attempts.length} × {r.count}번 · {usd(r.actualUsd)}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Box>

      <div className="min-w-0 space-y-4">
        {err && <p className="rounded-md border border-alert/40 bg-alert/10 px-4 py-2 text-[14px] text-alert">{err}</p>}
        {!selected ? null : !data ? (
          <Box label="RUN">
            <Loading />
          </Box>
        ) : (
          <>
            <RunHeader data={data} onCancel={() => void cancel()} />
            <Distribution data={data} />
            <CheckVariance data={data} />
            <Box
              label="COMPARE"
              title="버전 비교"
              actions={
                <select className={cx(inputCls, 'h-8 text-[14px]')} value={compareId} onChange={(e) => setCompareId(e.target.value)} aria-label="비교할 실험 채점">
                  <option value="">비교할 실험 고르기</option>
                  {(runs ?? [])
                    .filter((r) => r.id !== selected)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.versionName} · {fmtDate(r.createdAt)} · 응시 {r.attempts.length}×{r.count}
                      </option>
                    ))}
                </select>
              }
            >
              {compare ? <Compare a={data} b={compare} /> : <p className="px-4 py-4 text-[14px] text-text-muted">같은 응시를 다른 버전이나 설정으로 채점한 실험을 고르면 나란히 비교합니다.</p>}
            </Box>
            <Details data={data} />
          </>
        )}
      </div>
    </div>
  )
}

function attemptName(meta: GraderRun, source: string, id: string) {
  const a = meta.attempts.find((x) => x.source === source && x.id === id)
  return a?.label ?? id
}

function groupBy(results: GraderResult[]) {
  const m = new Map<string, GraderResult[]>()
  for (const r of results) {
    const k = `${r.source}:${r.attemptId}`
    m.set(k, [...(m.get(k) ?? []), r])
  }
  for (const v of m.values()) v.sort((a, b) => a.n - b.n)
  return m
}

function RunHeader({ data, onCancel }: { data: { meta: GraderRun; results: GraderResult[] }; onCancel: () => void }) {
  const m = data.meta
  const finished = m.done + m.failed
  return (
    <Box
      label="RUN"
      title={`${m.versionName} · ${fmtDate(m.createdAt)}`}
      actions={
        <>
          {m.status === 'RUNNING' && (
            <Button variant="secondary" size="sm" onClick={onCancel}>
              <Square size={14} aria-hidden /> 멈추기
            </Button>
          )}
          <a href={grader.exportUrl(m.id)} download className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[14px] text-text-muted hover:bg-panel-raised hover:text-text">
            <Download size={14} aria-hidden /> 결과 파일 내보내기
          </a>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-[14px]">
        <span className={cx('font-semibold', runStatus[m.status].cls)}>
          {m.status === 'DONE' && <CheckCircle2 size={14} className="mr-1 inline" aria-hidden />}
          {runStatus[m.status].t}
        </span>
        <span className="tnum font-mono text-text-muted">
          {finished} / {m.total}
          {m.failed > 0 && <span className="text-alert"> (실패 {m.failed})</span>}
        </span>
        <span className="text-text-muted">
          응시 {m.attempts.length}개 × {m.count}번 · R1 다시 실행 {m.replays}번 · 채점 모델 {m.judgeRepeat}번씩
        </span>
        <span className="tnum font-mono text-text-muted">
          비용 {usd(m.actualUsd)} <span className="text-text-faint">(예상 {usd(m.estimateUsd)})</span>
        </span>
        {m.author && <span className="text-text-faint">실행: {m.author}</span>}
      </div>
      {m.status === 'RUNNING' && (
        <div className="mx-4 mb-3 h-1 overflow-hidden rounded-full bg-line">
          <div className="h-full bg-signal transition-[width] duration-500" style={{ width: `${(finished / Math.max(1, m.total)) * 100}%` }} />
        </div>
      )}
      {m.errors.length > 0 && (
        <ul className="border-t border-line px-4 py-2 text-[13px] text-alert">
          {m.errors.slice(0, 5).map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </Box>
  )
}

function Distribution({ data }: { data: { meta: GraderRun; results: GraderResult[] } }) {
  const groups = groupBy(data.results)
  return (
    <Box label="DISTRIBUTION" title="응시별 점수 분포">
      {groups.size === 0 ? (
        <p className="px-4 py-4 text-[14px] text-text-muted">아직 끝난 채점이 없습니다.</p>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-line text-text-faint">
              <th className={th}>응시</th>
              <th className={th}>회차별 총점</th>
              <th className={cx(th, 'text-right')}>평균</th>
              <th className={cx(th, 'text-right')}>범위</th>
              <th className={cx(th, 'text-right')} title="R1 감점을 다시 더한 점수의 범위. 채점 모델 판정만의 흔들림">
                R1 뺀 범위
              </th>
            </tr>
          </thead>
          <tbody>
            {[...groups.entries()].map(([k, rs]) => {
              const s = stats(rs.map((r) => r.total))
              const s2 = stats(rs.map((r) => r.total + r1Of(r)))
              return (
                <tr key={k} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 text-[14px]">{attemptName(data.meta, rs[0].source, rs[0].attemptId)}</td>
                  <td className="tnum px-3 py-2 font-mono text-[14px] text-text-muted">{rs.map((r) => r.total).join(', ')}</td>
                  <td className="tnum px-3 py-2 text-right font-mono text-[14px]">{s.avg.toFixed(1)}</td>
                  <td className={cx('tnum px-3 py-2 text-right font-mono text-[14px]', s.range > 5 ? 'text-alert' : s.range > 3 ? 'text-caution' : 'text-signal')}>
                    {s.min}~{s.max} ({s.range})
                  </td>
                  <td className="tnum px-3 py-2 text-right font-mono text-[14px] text-text-muted">{s2.range}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </Box>
  )
}

function CheckVariance({ data }: { data: { meta: GraderRun; results: GraderResult[] } }) {
  const groups = [...groupBy(data.results).entries()]
  const [key, setKey] = useState('')
  const [onlyMoving, setOnlyMoving] = useState(true)
  const cur = groups.find(([k]) => k === key) ?? groups[0]
  if (!cur) return null
  const rs = cur[1]
  const codes = [...new Set(rs.flatMap((r) => r.checks.map((c) => c.code)))]
  const rows = codes
    .map((code) => {
      const per = rs.map((r) => r.checks.find((c) => c.code === code))
      const vals = per.map((c) => c?.deducted ?? 0)
      const mode = [...vals].sort((a, b) => vals.filter((v) => v === b).length - vals.filter((v) => v === a).length)[0]
      const changed = vals.filter((v) => v !== mode).length
      const votes = new Map<string, { yes: number; all: number; model: string }>()
      for (const c of per) {
        for (const j of c?.judges ?? []) {
          const base = j.judge.split('#')[0]
          const v = votes.get(base) ?? { yes: 0, all: 0, model: j.model }
          v.all++
          if (j.violated) v.yes++
          votes.set(base, v)
        }
      }
      return { code, method: per[0]?.method ?? '', vals, changed, votes }
    })
    .filter((r) => !onlyMoving || r.changed > 0 || r.vals.some((v) => v > 0))
  return (
    <Box
      label="VARIANCE"
      title="체크별 흔들림"
      actions={
        <>
          <label className="flex items-center gap-1.5 text-[13px] text-text-muted">
            <input type="checkbox" checked={onlyMoving} onChange={(e) => setOnlyMoving(e.target.checked)} className="accent-[var(--color-signal)]" /> 감점이 있거나 바뀐 것만
          </label>
          <select className={cx(inputCls, 'h-8 text-[14px]')} value={cur[0]} onChange={(e) => setKey(e.target.value)} aria-label="응시 고르기">
            {groups.map(([k, g]) => (
              <option key={k} value={k}>
                {attemptName(data.meta, g[0].source, g[0].attemptId)}
              </option>
            ))}
          </select>
        </>
      }
    >
      <table className="w-full">
        <thead>
          <tr className="border-b border-line text-text-faint">
            <th className={th}>체크</th>
            <th className={th}>회차별 감점</th>
            <th className={cx(th, 'text-right')}>바뀐 비율</th>
            <th className={th}>모델별 "걸림" 판정</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.code} className="border-b border-line last:border-0">
              <td className="px-3 py-2 font-mono text-[13px]">
                {r.code} <span className="text-[11px] text-text-faint">{r.method === 'AUTO' ? '자동' : '판정'}</span>
              </td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-1">
                  {r.vals.map((v, i) => (
                    <span key={i} className={cx('tnum rounded-sm px-1.5 font-mono text-[12px]', v > 0 ? 'bg-alert/12 text-alert' : 'bg-panel-raised text-text-faint')}>
                      {v > 0 ? `-${v}` : '0'}
                    </span>
                  ))}
                </div>
              </td>
              <td className={cx('tnum px-3 py-2 text-right font-mono text-[13px]', r.changed > 0 ? 'text-caution' : 'text-text-faint')}>
                {Math.round((r.changed / r.vals.length) * 100)}%
              </td>
              <td className="px-3 py-2 font-mono text-[12px] text-text-muted">
                {[...r.votes.entries()].map(([j, v]) => (
                  <span key={j} className="mr-3">
                    {v.model} {v.yes}/{v.all}
                  </span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p className="px-4 py-4 text-[14px] text-text-muted">모든 회차에서 감점이 없었습니다.</p>}
    </Box>
  )
}

function Compare({ a, b }: { a: { meta: GraderRun; results: GraderResult[] }; b: { meta: GraderRun; results: GraderResult[] } }) {
  const ga = groupBy(a.results)
  const gb = groupBy(b.results)
  const common = [...ga.keys()].filter((k) => gb.has(k))
  if (!common.length) return <p className="px-4 py-4 text-[14px] text-text-muted">두 실험에 함께 들어간 응시가 없습니다.</p>
  const avgCheck = (rs: GraderResult[], code: string) => rs.reduce((s, r) => s + (r.checks.find((c) => c.code === code)?.deducted ?? 0), 0) / rs.length
  return (
    <table className="w-full">
      <thead>
        <tr className="border-b border-line text-text-faint">
          <th className={th}>응시</th>
          <th className={cx(th, 'text-right')}>
            이 실험 <span className="normal-case">({a.meta.versionName})</span>
          </th>
          <th className={cx(th, 'text-right')}>
            비교 <span className="normal-case">({b.meta.versionName})</span>
          </th>
          <th className={cx(th, 'text-right')}>평균 차이</th>
          <th className={th}>차이가 난 체크 (평균 감점)</th>
        </tr>
      </thead>
      <tbody>
        {common.map((k) => {
          const ra = ga.get(k)!
          const rb = gb.get(k)!
          const sa = stats(ra.map((r) => r.total))
          const sb = stats(rb.map((r) => r.total))
          const diff = sa.avg - sb.avg
          const codes = [...new Set([...ra, ...rb].flatMap((r) => r.checks.map((c) => c.code)))]
          const moved = codes
            .map((c) => ({ c, da: avgCheck(ra, c), db: avgCheck(rb, c) }))
            .filter((x) => Math.abs(x.da - x.db) >= 0.5)
          return (
            <tr key={k} className="border-b border-line align-top last:border-0">
              <td className="px-3 py-2 text-[14px]">{attemptName(a.meta, ra[0].source, ra[0].attemptId)}</td>
              <td className="tnum px-3 py-2 text-right font-mono text-[14px]">
                {sa.avg.toFixed(1)} <span className="text-text-faint">±{sa.range}</span>
              </td>
              <td className="tnum px-3 py-2 text-right font-mono text-[14px]">
                {sb.avg.toFixed(1)} <span className="text-text-faint">±{sb.range}</span>
              </td>
              <td className={cx('tnum px-3 py-2 text-right font-mono text-[14px]', diff > 0 ? 'text-signal' : diff < 0 ? 'text-alert' : 'text-text-muted')}>
                {diff > 0 ? '+' : ''}
                {diff.toFixed(1)}
              </td>
              <td className="px-3 py-2 font-mono text-[12px] text-text-muted">
                {moved.length === 0 ? '-' : moved.map((x) => <span key={x.c} className="mr-3">{x.c} -{x.da.toFixed(1)} → -{x.db.toFixed(1)}</span>)}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function Details({ data }: { data: { meta: GraderRun; results: GraderResult[] } }) {
  const groups = groupBy(data.results)
  if (!groups.size) return null
  return (
    <Box label="DETAILS" title="회차별 상세 리포트">
      <ul className="divide-y divide-line">
        {[...groups.entries()].map(([k, rs]) => (
          <li key={k} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
            <span className="mr-2 text-[14px]">{attemptName(data.meta, rs[0].source, rs[0].attemptId)}</span>
            {rs.map((r) => (
              <Link
                key={r.file}
                to={`/grader/result/${data.meta.id}/${r.file}`}
                target="_blank"
                className="inline-flex h-7 items-center gap-1 rounded-md border border-line px-2 font-mono text-[13px] text-text-muted hover:border-line-strong hover:text-text"
              >
                #{r.n} {r.total}점 <ExternalLink size={12} aria-hidden />
              </Link>
            ))}
          </li>
        ))}
      </ul>
    </Box>
  )
}

// ══ 페이지 ══════════════════════

export default function Grader() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('versions')
  const [rubric, setRubric] = useState<GraderRubric | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [author, setAuthor] = useState(loadAuthor)
  const [versionsKey, setVersionsKey] = useState(0)
  const [runId, setRunId] = useState<string | null>(null)

  useEffect(() => {
    grader.rubric().then(setRubric).catch((e: ApiError) => setErr(e.message))
  }, [])

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-line bg-panel px-8">
        <Logo />
        <span className="text-[16px] font-semibold">채점 툴</span>
        <span className="rounded-sm bg-caution/15 px-1.5 font-mono text-[11px] text-caution">임시 기능</span>
        <div className="ml-auto flex items-center gap-3">
          <label className="flex items-center gap-2 text-[14px] text-text-muted">
            작성자
            <input
              className={cx(inputCls, 'h-8 w-32')}
              value={author}
              maxLength={20}
              placeholder="이름"
              onChange={(e) => {
                setAuthor(e.target.value)
                saveAuthor(e.target.value)
              }}
            />
          </label>
          <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
            <ArrowLeft size={14} aria-hidden /> 메인
          </Button>
        </div>
      </header>
      <div className="flex shrink-0 items-end border-b border-line px-8">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'versions', label: '프롬프트 버전' },
            { value: 'run', label: '실험 채점' },
            { value: 'results', label: '결과' },
          ]}
        />
      </div>
      <main className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-[1440px] px-8 py-6">
          {err && <p className="text-[15px] text-alert">{err}</p>}
          {!rubric && !err && <Loading />}
          {rubric && tab === 'versions' && <VersionsTab rubric={rubric} author={author} onChanged={() => setVersionsKey((k) => k + 1)} />}
          {rubric && tab === 'run' && (
            <RunTab
              rubric={rubric}
              author={author}
              versionsKey={versionsKey}
              onStarted={(id) => {
                setRunId(id)
                setTab('results')
              }}
            />
          )}
          {rubric && tab === 'results' && <ResultsTab selected={runId} onSelect={setRunId} />}
        </div>
      </main>
    </div>
  )
}
