import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Download, ExternalLink, FlaskConical, Info, Loader2, Play, Save, Square, Star } from 'lucide-react'
import { cx } from '../components/cx'
import { ErrorState } from '../components/ErrorState'
import { Button } from '../components/ui'
import { BranchLine, CountUp, Glass, Reveal, StageSection } from '../components/fx'
import { motion } from 'motion/react'
import { duration, easing, stagger } from '../lib/motion'
import { STATS } from '../data/dashboard'
import { PillTabs } from './console/ConsoleHero'
import {
  ApiError,
  grader,
  type GraderAttempt,
  type GraderEstimate,
  type GraderRef,
  type GraderResult,
  type GraderRubric,
  type GraderMode,
  type GraderRun,
  type PromptVersion,
  type PromptVersionRow,
} from '../api'

// 채점 툴 (DESIGN.md §7). 프롬프트 버전 편집, 실험 채점(여러 응시 × N번), 결과 분석.
// 프롬프트 버전, 실제 채점 버전, 샘플 응시, 실험 결과는 모두 grader/ 폴더로 git 공유한다(팀 공용, 작성자 구분 없음).

type Tab = 'versions' | 'run' | 'results'

const fmtDate = (s: string | null | undefined) => (s ? new Date(s).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-')
/** 실험 목록용: "11.12 11:33" (24시간제) */
const fmtRunDate = (s: string) => {
  const d = new Date(s)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
const usd = (v: number) => `$${v < 0.1 ? v.toFixed(3) : v.toFixed(2)}`
const refKey = (r: GraderRef) => `${r.source}:${r.id}`
const inputCls = 'h-9 rounded-md border border-line-strong bg-panel-raised px-3 text-[15px] text-text outline-none focus:border-brand'
const areaCls = 'w-full rounded-md border border-line-strong bg-panel-raised p-3 font-mono text-[13px] leading-5 text-text outline-none focus:border-brand'
const th = 'label h-9 px-3 text-left font-medium'

/** 채점 항목 키 → 역량 색 (§1.5). 모르는 키는 브랜드 색 */
const compColor = (key: string) => STATS.find((c) => c.key === key.toLowerCase())?.color ?? 'var(--color-brand)'

function Box({
  label,
  title,
  actions,
  children,
  className,
  id,
  accent,
}: {
  label: string
  title?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  id?: string
  /** 역량 색. 머리 왼쪽 막대와 라벨에 쓴다 */
  accent?: string
}) {
  return (
    <section id={id} className={cx('scroll-mt-24 overflow-hidden rounded-xl border border-line bg-panel shadow-sm', className)}>
      <header className="relative flex h-10 items-center gap-3 border-b border-line px-4">
        {accent && <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: accent }} />}
        <span className="label" style={accent ? { color: accent } : undefined}>
          {label}
        </span>
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

function VersionsTab({ rubric, onChanged }: { rubric: GraderRubric; onChanged: () => void }) {
  const [rows, setRows] = useState<PromptVersionRow[] | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [loadedV, setV] = useState<PromptVersion | null>(null)
  // 버전을 바꾸면 새 내용이 올 때까지 이전 내용을 숨긴다 (effect 안에서 비우지 않고 여기서 거른다)
  const v = loadedV?.id === sel ? loadedV : null
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
    grader.version(sel).then(setV).catch((e: ApiError) => setErr(e.message))
  }, [sel])

  const editing = draft !== null
  const shown = draft ?? v
  const parent = v

  const startEdit = () => {
    if (!v) return
    setDraft({ ...v, name: '', note: '', parent: v.id, checks: structuredClone(v.checks) })
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
      const saved = await grader.createVersion(body)
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
  const setCheck = (key: string, patch: Partial<{ hint: string | null }>) =>
    setDraft((d) => (d ? { ...d, checks: { ...d.checks, [key]: { ...d.checks[key], ...patch } } } : d))

  const activeRow = rows?.find((r) => r.id === sel)

  return (
    <div className="grid min-h-0 grid-cols-[320px_minmax(0,1fr)] gap-4">
      <Box label="VERSIONS" title="버전 목록" className="self-start">
        {/* 공지: 버전 파일 공유 방법 */}
        <div role="note" className="flex gap-2 border-b border-line bg-info/8 px-4 py-3 text-[13px] leading-5 text-text-muted">
          <Info size={15} className="mt-0.5 shrink-0 text-info" aria-hidden />
          <p>
            버전 파일은 <span className="font-mono text-text">grader/versions/</span>에, 실제 채점 버전은 <span className="font-mono text-text">grader/active.txt</span>에 저장됩니다. 커밋하고 push하면 팀 전체가 같은 버전을 씁니다.
          </p>
        </div>
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
                    {fmtDate(r.createdAt)}
                  </div>
                  {r.note && <div className="mt-0.5 truncate text-[13px] text-text-muted">{r.note}</div>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Box>

      <div className="min-w-0 space-y-4">
        {err && <ErrorState compact message={err} onRetry={() => (setErr(null), load())} />}
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
                    <Button variant="primary" size="sm" onClick={() => void save()} disabled={busy}>
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
                    <Button variant="primary" size="sm" onClick={startEdit}>
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
                      <span className="text-[13px] font-semibold text-text-muted">이름</span>
                      <input className={inputCls} value={draft.name} maxLength={30} placeholder="예: U2기준수정" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[13px] font-semibold text-text-muted">메모 (무엇을 왜 바꿨는지)</span>
                      <input className={inputCls} value={draft.note} placeholder="예: U2 판정이 흔들려서 '추측' 기준을 구체화" onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
                    </label>
                  </div>
                ) : (
                  <p className="font-mono text-[13px] text-text-muted">
                    {shown.id} │ {fmtDate(shown.createdAt)}
                    {shown.parent && <> │ {shown.parent} 바탕</>}
                    {shown.note && <span className="mt-1 block font-sans text-[14px] text-text">{shown.note}</span>}
                  </p>
                )}
                <PromptField label="공통 채점 규칙 (채점 모델 시스템 프롬프트)" value={shown.judgeSystem} base={parent?.judgeSystem} editing={editing} rows={10}
                  onChange={(t) => draft && setDraft({ ...draft, judgeSystem: t })} />
              </div>
            </Box>

            <RubricMap rubric={rubric} />
            {rubric.items.map((item) => (
              <Box key={item.key} id={`rubric-${item.key}`} accent={compColor(item.key)} label={item.key.toUpperCase()} title={`${item.name} (${item.max}점)`}>
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
                              <span className="tnum font-mono text-[14px] text-alert">-{cur.points}</span>
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

/** 버전 화면 위 배점 지도 (2026-11-19 개편): 역량별 배점 비율 막대 + 눌러서 그 역량 표로 이동 */
function RubricMap({ rubric }: { rubric: GraderRubric }) {
  const total = rubric.items.reduce((a, it) => a + it.max, 0) || 1
  const go = (key: string) => document.getElementById(`rubric-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return (
    <Glass className="sticky top-2 z-20 rounded-xl border border-line p-3 shadow-md">
      <div className="flex h-3 overflow-hidden rounded-full" role="img" aria-label={`배점: ${rubric.items.map((it) => `${it.name} ${it.max}점`).join(', ')}`}>
        {rubric.items.map((it, i) => (
          <motion.span
            key={it.key}
            className="h-full origin-left border-r-2 border-panel last:border-0"
            style={{ width: `${(it.max / total) * 100}%`, background: compColor(it.key) }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: duration.slow, ease: easing.expo, delay: i * stagger.normal }}
          />
        ))}
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-x-2 md:grid-cols-3">
        {rubric.items.map((it) => (
          <li key={it.key}>
            <button
              type="button"
              onClick={() => go(it.key)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-panel-raised"
            >
              <i aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: compColor(it.key) }} />
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-text">{it.name}</span>
              <span className="tnum font-mono text-[12px] text-text-muted">
                {it.max}점 │ 체크 {rubric.checks.filter((c) => c.item === it.key).length}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Glass>
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

function RunTab({ rubric, versionsKey, onStarted }: { rubric: GraderRubric; versionsKey: number; onStarted: (runId: string) => void }) {
  const [attempts, setAttempts] = useState<GraderAttempt[] | null>(null)
  const [versions, setVersions] = useState<PromptVersionRow[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [versionId, setVersionId] = useState('')
  // 기본값: 채점 횟수 3번(흔들림을 보려고), 채점 모델 반복은 실제 채점과 같게
  const defaults = { count: 3, judgeRepeat: rubric.defaults.judgeRepeat }
  const [count, setCount] = useState(defaults.count)
  const judgeRepeat = 1 // 채점 모델은 실제 채점처럼 1번씩. 평균은 반복 채점 결과로 정한다
  const [mode, setMode] = useState<GraderMode>('api')
  const BATCH_WAIT_DEFAULT = 10
  const [batchWait, setBatchWait] = useState(BATCH_WAIT_DEFAULT)

  const [loadedEst, setEst] = useState<GraderEstimate | null>(null)
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
  const req = useMemo(
    () => ({ attempts: refs, versionId, count, judgeRepeat, mode, batchWaitMinutes: batchWait }),
    [refs, versionId, count, judgeRepeat, mode, batchWait],
  )

  // 고른 응시가 없으면 예상 비용을 보여 주지 않는다 (effect 안에서 비우지 않고 여기서 거른다)
  const est = refs.length ? loadedEst : null
  useEffect(() => {
    if (!refs.length) return
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
      const run = await grader.start(req)
      onStarted(run.id)
    } catch (e) {
      setErr((e as ApiError).message)
    } finally {
      setBusy(false)
    }
  }

  // 1. 과제 고르기 → 2. 그 과제의 응시 고르기. 과제를 바꾸면 고른 응시는 비운다.
  const taskList = useMemo(() => {
    const m = new Map<string, { id: string; title: string; type: GraderAttempt['taskType']; n: number }>()
    for (const a of attempts ?? []) {
      const t = m.get(a.taskId) ?? { id: a.taskId, title: a.taskTitle, type: a.taskType, n: 0 }
      t.n++
      m.set(a.taskId, t)
    }
    return [...m.values()].sort((a, b) => (a.type === b.type ? a.title.localeCompare(b.title) : a.type === 'dev' ? -1 : 1))
  }, [attempts])
  const [taskId, setTaskId] = useState('')
  const currentTask = taskList.find((t) => t.id === taskId) ?? taskList[0]
  const pickTask = (id: string) => {
    setTaskId(id)
    setPicked(new Set())
  }
  const ofTask = (attempts ?? []).filter((a) => a.taskId === currentTask?.id)
  const groups: { title: string; label: string; rows: GraderAttempt[] }[] = attempts
    ? [
        { label: 'SAMPLES', title: '샘플 응시 (팀 공용, git 공유)', rows: ofTask.filter((a) => a.source === 'sample') },
        { label: 'MINE', title: '내 응시 (이 PC, 후속 질문까지 끝난 것)', rows: ofTask.filter((a) => a.source === 'mine') },
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
        {taskList.length > 0 && (
          <Box label="STEP 1" title="과제 고르기">
            <div role="radiogroup" aria-label="과제" className="grid grid-cols-2 gap-2 p-3">
              {taskList.map((t) => {
                const on = currentTask?.id === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => pickTask(t.id)}
                    className={cx(
                      'flex items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors duration-[120ms]',
                      on ? 'border-brand bg-brand-dim' : 'border-line hover:border-line-strong hover:bg-panel-raised/60',
                    )}
                  >
                    <span className="rounded-sm bg-panel-raised px-1.5 font-mono text-[11px] text-text-muted">{t.type === 'dev' ? '개발' : '비개발'}</span>
                    <span className={cx('min-w-0 flex-1 truncate text-[15px]', on ? 'font-semibold text-text' : 'text-text-muted')}>{t.title}</span>
                    <span className="tnum font-mono text-[12px] text-text-faint">응시 {t.n}</span>
                  </button>
                )
              })}
            </div>
          </Box>
        )}
        {groups.map((g) => (
          <Box
            key={g.label}
            label={`STEP 2 │ ${g.label}`}
            title={g.title}
            actions={<span className="font-mono text-[13px] text-text-muted">{g.rows.length}건</span>}
          >
            {g.rows.length === 0 ? (
              <p className="px-4 py-4 text-[14px] text-text-muted">없습니다.</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-line text-text-faint">
                    <th className={cx(th, 'w-10')} aria-label="선택" />
                    <th className={th}>응시</th>
                    <th className={th}>날짜</th>
                    <th className={cx(th, 'text-right')}>대화</th>
                    <th className={cx(th, 'text-right')}>지난 점수</th>
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((a) => {
                    const on = picked.has(refKey(a))
                    return (
                      <tr key={refKey(a)} onClick={() => toggle(a)} className={cx('cursor-pointer border-b border-line last:border-0', on ? 'bg-brand-dim' : 'hover:bg-panel-raised/60')}>
                        <td className="px-3 py-2">
                          <input type="checkbox" checked={on} onChange={() => toggle(a)} onClick={(e) => e.stopPropagation()} aria-label={`${a.label ?? a.id} 선택`} className="size-4 accent-[var(--color-brand)]" />
                        </td>
                        <td className="px-3 py-2">
                          <div className="text-[14px]">{a.label ?? <span className="font-mono">{a.id}</span>}</div>
                          {a.label && <div className="font-mono text-[12px] text-text-faint">{a.id}</div>}
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
        >
          <div className="space-y-3 p-4">
            <div className="flex flex-col gap-1">
              <span className="text-[13px] font-semibold text-text-muted">호출 방식</span>
              <div role="radiogroup" aria-label="호출 방식" className="grid grid-cols-2 gap-1 rounded-md border border-line-strong bg-panel-sunken p-1">
                {(
                  [
                    { v: 'api', t: '일반 API', d: '바로 채점' },
                    { v: 'batch', t: '배치 API', d: '비용 절반, 대기 있음' },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    role="radio"
                    aria-checked={mode === o.v}
                    onClick={() => setMode(o.v)}
                    className={cx(
                      'flex flex-col items-start rounded-sm px-2.5 py-1.5 text-left transition-colors duration-[120ms]',
                      mode === o.v ? 'bg-brand-dim text-text shadow-[inset_0_0_0_1px_var(--color-brand)]' : 'text-text-muted hover:text-text',
                    )}
                  >
                    <span className="text-[14px] font-semibold">{o.t}</span>
                    <span className="text-[12px] text-text-faint">{o.d}</span>
                  </button>
                ))}
              </div>
              {mode === 'batch' && (
                <span className="text-[12px] leading-4 text-text-faint">
                  OpenAI, Anthropic 배치 API로 두 채점 모델의 판정을 보냅니다. 서버를 껐다 켜도 이어서 받습니다.
                </span>
              )}
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-[13px] font-semibold text-text-muted">프롬프트 버전</span>
              <select className={inputCls} value={versionId} onChange={(e) => setVersionId(e.target.value)}>
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}{v.active ? ' │ 실제 채점' : ''}
                  </option>
                ))}
              </select>
            </label>
            <NumField label="반복 채점 횟수 (응시마다)" value={count} def={defaults.count} min={1} max={20} onChange={(v) => setCount(num(v, 1, 20))} hint="같은 응시를 여러 번 채점해 점수가 얼마나 흔들리는지 봄. 실제 채점은 1번" />
            {mode === 'batch' && (
              <NumField
                label="배치 최대 대기 (분, 단계마다)"
                value={batchWait}
                def={BATCH_WAIT_DEFAULT}
                min={5}
                max={1440}
                step={5}
                onChange={(v) => setBatchWait(num(v, 1, 1440))}
                hint="이 시간 안에 끝나지 않은 배치는 취소하고, 남은 요청만 일반 API(정가)로 바로 채점합니다. 끝난 부분은 배치 가격 그대로."
              />
            )}
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
                  <span className="text-[14px] text-text-muted">{mode === 'batch' ? `최대 약 ${batchWait * 2}분 (단계 2개 × ${batchWait}분)` : `약 ${Math.max(1, Math.round(est.minutes))}분`}</span>
                </div>
                <p className="mt-1 text-[14px] text-text-muted">
                  응시 {refs.length}개 × {count}번 = 채점 {est.scorings}번
                </p>
                <p className="mt-2 text-[12px] leading-5 text-text-faint">
                  지난 채점의 실제 토큰으로 계산(지난 기록이 없으면 같은 과제 기록이나 기본값). 동시에 {rubric.defaults.parallel}건씩 채점. 비용은 각자의 API 키로 나갑니다.
                </p>
              </>
            )}
            {err && <ErrorState compact message={err} className="mt-3" />}
            <Button variant="primary" className="mt-4 w-full" disabled={!refs.length || !versionId || busy} onClick={() => void start()}>
              {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Play size={16} aria-hidden />} 채점 시작
            </Button>
          </div>
        </Box>
      </div>
    </div>
  )
}

function NumField({ label, value, def, min, max, step = 1, hint, onChange }: { label: string; value: number; def: number; min: number; max: number; step?: number; hint?: string; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label">{label}</span>
      <span className="flex items-center gap-2">
        <input type="number" min={min} max={max} step={step} className={cx(inputCls, 'tnum w-24 font-mono', value !== def && 'border-caution')} value={value} onChange={(e) => onChange(Number(e.target.value))} />
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
  CANCELLED: { t: '중지', cls: 'text-text-muted' },
  INTERRUPTED: { t: '중단됨', cls: 'text-alert' },
}

const stats = (xs: number[]) => {
  if (!xs.length) return { min: 0, max: 0, avg: 0, range: 0 }
  const min = Math.min(...xs)
  const max = Math.max(...xs)
  return { min, max, avg: xs.reduce((a, b) => a + b, 0) / xs.length, range: max - min }
}

function ResultsTab({ selected, onSelect }: { selected: string | null; onSelect: (id: string) => void }) {
  const [runs, setRuns] = useState<GraderRun[] | null>(null)
  const [loadedData, setData] = useState<{ meta: GraderRun; results: GraderResult[] } | null>(null)
  const [compareId, setCompareId] = useState('')
  const [loadedCompare, setCompare] = useState<{ meta: GraderRun; results: GraderResult[] } | null>(null)
  // 고른 실험과 다른 결과(이전에 고른 것)는 보여 주지 않는다 (effect 안에서 비우지 않고 여기서 거른다)
  const data = loadedData?.meta.id === selected ? loadedData : null
  const compare = compareId && loadedCompare?.meta.id === compareId ? loadedCompare : null
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
    tick()
    return () => {
      alive = false
      if (timer) clearTimeout(timer)
    }
  }, [selected])

  useEffect(() => {
    if (!compareId) return
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
                {/* 한 줄: 날짜시간 · 일반/배치 · 응시 수 × 회차 · 상태 */}
                <button
                  type="button"
                  onClick={() => onSelect(r.id)}
                  title={`${r.versionName} │ ${usd(r.actualUsd)}`}
                  className={cx(
                    'flex w-full items-center gap-2 px-4 py-2.5 text-left font-mono text-[13px] whitespace-nowrap',
                    selected === r.id ? 'bg-panel-raised text-text' : 'text-text-muted hover:bg-panel-raised/60',
                  )}
                >
                  <span className="tnum">{fmtRunDate(r.createdAt)}</span>
                  <span className={cx('rounded-sm px-1 text-[11px]', r.mode === 'batch' ? 'bg-info/12 text-info' : 'bg-panel-raised text-text-faint')}>
                    {r.mode === 'batch' ? '배치' : '일반'}
                  </span>
                  <span className="tnum">
                    {r.attempts.length}개 × {r.count}회
                  </span>
                  <span className={cx('ml-auto text-[12px]', runStatus[r.status].cls)}>{runStatus[r.status].t}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Box>

      <div className="min-w-0 space-y-4">
        {err && <ErrorState compact message={err} />}
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
                        {r.versionName} │ {fmtDate(r.createdAt)} │ 응시 {r.attempts.length}×{r.count}
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
  const [exporting, setExporting] = useState(false)
  const [exportErr, setExportErr] = useState<string | null>(null)
  const m = data.meta
  const download = async () => {
    setExporting(true)
    setExportErr(null)
    try {
      await grader.downloadExport(m.id)
    } catch (e) {
      setExportErr((e as ApiError).message)
    } finally {
      setExporting(false)
    }
  }
  const finished = m.done + m.failed
  return (
    <Box
      label="RUN"
      title={`${m.versionName} │ ${fmtDate(m.createdAt)}`}
      actions={
        <>
          {m.status === 'RUNNING' && (
            <Button variant="secondary" size="sm" onClick={onCancel}>
              <Square size={14} aria-hidden /> 중지
            </Button>
          )}
          <button type="button" onClick={download} disabled={exporting} className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[14px] text-text-muted hover:bg-panel-raised hover:text-text disabled:opacity-50">
            <Download size={14} aria-hidden /> {exporting ? '내려받는 중' : '결과 파일 내보내기'}
          </button>
        </>
      }
    >
      {exportErr && <ErrorState compact message={exportErr} onRetry={download} />}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 text-[14px]">
        <span className={cx('font-semibold', runStatus[m.status].cls)}>
          {m.status === 'DONE' && <CheckCircle2 size={14} className="mr-1 inline" aria-hidden />}
          {runStatus[m.status].t}
        </span>
        <span className="tnum font-mono text-text-muted">
          {finished} / {m.total}
          {m.failed > 0 && <span className="text-alert"> (실패 {m.failed})</span>}
        </span>
        <span className="rounded-sm bg-panel-raised px-1.5 font-mono text-[12px] text-text-muted">{m.mode === 'batch' ? '배치 API' : '일반 API'}</span>
        <span className="text-text-muted">
          응시 {m.attempts.length}개 × {m.count}번
        </span>
        <span className="tnum font-mono text-text-muted">
          비용 {usd(m.actualUsd)} <span className="text-text-faint">(예상 {usd(m.estimateUsd)})</span>
        </span>
      </div>
      {m.mode === 'batch' && m.phase && <BatchPhase phase={m.phase} running={m.status === 'RUNNING'} />}
      {m.status === 'RUNNING' && (
        <div className="mx-4 mb-2">
          <BranchLine progress={finished / Math.max(1, m.total)} />
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

/** 배치 진행 단계: "1단계 배치 처리 중 · gpt-6-luna 완료 5/5 · ..." 를 제목과 모델별 칩으로 나눠 보여 준다. */
function BatchPhase({ phase, running }: { phase: string; running: boolean }) {
  const [title, ...models] = phase.split(' · ')
  const tone = (t: string) =>
    /완료/.test(t) ? 'border-signal/40 text-signal' : /실패|만료|취소/.test(t) ? 'border-alert/40 text-alert' : 'border-caution/40 text-caution'
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2">
      <span className="flex items-center gap-1.5 text-[13px] text-text-muted">
        {running && <Loader2 size={12} className="animate-spin text-caution" aria-hidden />}
        {title}
      </span>
      {models.map((t) => (
        <span key={t} className={cx('tnum rounded-sm border px-1.5 font-mono text-[12px] leading-5', tone(t))}>
          {t}
        </span>
      ))}
    </div>
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
            </tr>
          </thead>
          <tbody>
            {[...groups.entries()].map(([k, rs]) => {
              const s = stats(rs.map((r) => r.total))
              return (
                <tr key={k} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 text-[14px]">{attemptName(data.meta, rs[0].source, rs[0].attemptId)}</td>
                  <td className="tnum px-3 py-2 font-mono text-[14px] text-text-muted">{rs.map((r) => r.total).join(', ')}</td>
                  <td className="tnum px-3 py-2 text-right font-mono text-[14px]">{s.avg.toFixed(1)}</td>
                  <td className={cx('tnum px-3 py-2 text-right font-mono text-[14px]', s.range > 5 ? 'text-alert' : s.range > 3 ? 'text-caution' : 'text-signal')}>
                    {s.min}~{s.max} ({s.range})
                  </td>
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
            <input type="checkbox" checked={onlyMoving} onChange={(e) => setOnlyMoving(e.target.checked)} className="accent-[var(--color-brand)]" /> 감점이 있거나 바뀐 것만
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
  const [tab, setTab] = useState<Tab>('versions')
  const [rubric, setRubric] = useState<GraderRubric | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [versionsKey, setVersionsKey] = useState(0)
  const [runId, setRunId] = useState<string | null>(null)

  const [tries, setTries] = useState(0)
  useEffect(() => {
    grader.rubric().then(setRubric).catch((e: ApiError) => setErr(e.message))
  }, [tries])
  const retry = () => {
    setErr(null)
    setTries((t) => t + 1)
  }

  return (
    // 2026-11-27: 콘솔 셸(왼쪽 메뉴 + 상단 바) 안에서 보인다. 상단 바·오로라는 셸이 그린다 (DESIGN.md §7-7, §7-9-0).
    <div className="relative flex min-h-full flex-col pb-8">
      <div className="relative z-10">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-5 px-8 pt-6">
          <StageSection aria-label="채점 실험실">
            <div className="flex flex-wrap items-center gap-x-10 gap-y-5 px-8 py-7">
              <Reveal className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-mono text-[12px] font-semibold tracking-[0.12em] text-stage-brand">
                  <FlaskConical size={14} aria-hidden /> GRADING LAB
                </p>
                <h1 className="mt-2 text-[30px] leading-10 font-bold tracking-[-0.02em] text-stage-text">채점 프롬프트를 고치고, 같은 응시를 여러 번 채점해 흔들림을 봅니다</h1>
              </Reveal>
              {rubric && (
                <dl className="flex gap-8">
                  {(
                    [
                      ['ITEMS', rubric.items.length, '개'],
                      ['CHECKS', rubric.checks.length, '개'],
                      ['REPEAT', rubric.defaults.judgeRepeat, '회'],
                    ] as const
                  ).map(([l, v, u]) => (
                    <div key={l}>
                      <dt className="label text-stage-muted">{l}</dt>
                      <dd className="flex items-baseline gap-1">
                        <CountUp value={v} className="font-mono text-[34px] leading-10 font-semibold text-stage-text" />
                        <span className="text-[13px] text-stage-muted">{u}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </StageSection>
          <PillTabs
            id="grader-tab"
            label="채점 툴 화면"
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'versions', label: '프롬프트 버전' },
              { value: 'run', label: '실험 채점' },
              { value: 'results', label: '결과' },
            ]}
          />
        </div>
        <div className="mx-auto max-w-[1440px] px-8 py-6">
          {err && <ErrorState message={err} onRetry={retry} className="mt-6" />}
          {!rubric && !err && <Loading />}
          {rubric && tab === 'versions' && <VersionsTab rubric={rubric} onChanged={() => setVersionsKey((k) => k + 1)} />}
          {rubric && tab === 'run' && (
            <RunTab
              rubric={rubric}
              versionsKey={versionsKey}
              onStarted={(id) => {
                setRunId(id)
                setTab('results')
              }}
            />
          )}
          {rubric && tab === 'results' && <ResultsTab selected={runId} onSelect={setRunId} />}
        </div>
      </div>
    </div>
  )
}
