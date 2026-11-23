// DESIGN.md §7-9-4 회차 상세: 개요 / 대상자 / 실시간 현황 / 결과
// 데이터는 모두 백엔드(consoleApi)에서 온다. 회차 상세는 진행 중이면 5초, 아니면 30초마다 다시 부른다.
// 남은 시간은 백엔드 serverNow 와 브라우저 시계의 차이를 보정해 센다.
import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { duration, easing } from '../../lib/motion'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowDownUp, Camera, CircleAlert, Download, FileUp, Loader2, Pause, Play, RotateCw, UserPlus, X } from 'lucide-react'
import { cx } from '../../components/cx'
import { useConsoleCrumbs } from '../../components/consoleCrumbs'
import { ErrorState } from '../../components/ErrorState'
import { Button, ScoreChip } from '../../components/ui'
import { ConsoleHero, HeroSep, PillTabs } from './ConsoleHero'
import {
  companyLabel,
  EVENT_LABEL,
  isCameraEvent,
  PSTATE_LABEL,
  stateOf,
  suspectsOf,
  taskTitlesOf,
  unreviewedOf,
  useLoad,
  useTaskMap,
} from '../../data/consoleSessions'
import {
  consoleApi,
  type AddParticipantsResult,
  type ConsoleTaskSummary,
  type ParticipantView,
  type Phase,
  type ProctorEventView,
  type ResultRow,
  type ResultState,
  type SessionDetail,
  type SessionSummary,
} from '../../consoleApi'
import { Select } from '../../components/Select'
import { ConfirmModal, Modal, RowMenu } from './common'
import { fmtHm, fmtLeft, fmtShort, fmtTime, useNow, useToast } from './format'
import { Loading } from './Loading'
import ProctorPanel from './ProctorPanel'
import EnvCheckCard from './EnvCheckCard'
import { canManageSessions, useAuth } from '../../auth/auth'

type Tab = 'overview' | 'participants' | 'live' | 'results'
/** 채점 항목 (이름 → 배점·색). 결과의 items 는 항목 이름을 키로 쓴다 */
const ITEM_KEYS = [
  ['usage', 'AI 활용력', 20, 'var(--color-branch-2)'],
  ['control', 'AI 통제력', 15, 'var(--color-branch-3)'],
  ['decomposition', '문제 분해력', 10, 'var(--color-branch-4)'],
  ['delegation', '위임 판단력', 10, 'var(--color-comp-7)'],
  ['delivery', 'AI 결과 도출력', 30, 'var(--color-branch-5)'],
  ['potential', '성과 잠재력', 15, 'var(--color-comp-6)'],
] as const
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

type Loaded = { d: SessionDetail; skew: number }

/** 초대 메일을 보내는 중인 대상자가 있을 때 다시 불러오는 간격 */
const MAIL_POLL_MS = 2000

export default function ConsoleSessionDetail() {
  const { sessionId } = useParams()
  const id = Number(sessionId)
  const [paused, setPaused] = useState(false)
  const [phaseHint, setPhaseHint] = useState<Phase | null>(null)
  const [mailPending, setMailPending] = useState(false)
  const detail = useLoad<Loaded>(
    Number.isFinite(id) ? `session-${id}` : null,
    // 브라우저 시계와 서버 시계 차이 (남은 시간 계산에 쓴다)
    () => consoleApi.session(id).then((d) => ({ d, skew: Date.parse(d.serverNow) - Date.now() })),
    // 초대 메일은 서버가 따로 보내고 결과를 나중에 적는다. 보내는 중인 대상자가 있는 동안은 자주 다시 불러와 새로고침 없이 결과를 보여 준다
    paused ? undefined : mailPending ? MAIL_POLL_MS : phaseHint === 'LIVE' ? 5000 : 30_000,
  )
  const phase = detail.data?.d.session.phase ?? null
  if (phase !== phaseHint) setPhaseHint(phase)
  const hasPendingMail = detail.data?.d.participants.some((p) => p.inviteStatus === 'PENDING') ?? false
  if (hasPendingMail !== mailPending) setMailPending(hasPendingMail)

  if (!Number.isFinite(id) || (detail.error && !detail.data)) {
    return (
      <div className="flex flex-col items-center gap-4 px-8 py-24 text-center">
        {detail.error ? (
          <ErrorState message={detail.error} onRetry={detail.reload} />
        ) : (
          <>
            <CircleAlert size={28} className="text-text-faint" aria-hidden />
            <p className="text-[15px] text-text-muted">찾을 수 없는 회차입니다.</p>
          </>
        )}
        <Link to="/console/sessions" className="text-[14px] font-semibold text-brand hover:underline">
          회차 목록으로
        </Link>
      </div>
    )
  }
  if (!detail.data) return <Loading text="회차를 불러오는 중" className="py-32" />
  return (
    <Detail
      key={id}
      d={detail.data.d}
      skew={detail.data.skew}
      error={detail.error}
      reload={detail.reload}
      paused={paused}
      setPaused={setPaused}
    />
  )
}

function Detail({
  d,
  skew,
  error,
  reload,
  paused,
  setPaused,
}: {
  d: SessionDetail
  skew: number
  error: string | null
  reload: () => void
  paused: boolean
  setPaused: (f: (v: boolean) => boolean) => void
}) {
  const s = d.session
  useConsoleCrumbs([s.title])
  const now = useNow(1000) + skew
  const tasks = useTaskMap()
  const phase = s.phase
  const [params, setParams] = useSearchParams()
  const fallback: Tab = phase === 'LIVE' ? 'live' : phase === 'ENDED' ? 'results' : 'overview'
  let tab = (params.get('tab') as Tab) || fallback
  if ((tab === 'live' && phase !== 'LIVE') || (tab === 'results' && phase !== 'ENDED')) tab = fallback
  const setTab = (t: Tab) => setParams({ tab: t }, { replace: true })
  const toast = useToast()

  const entered = d.participants.filter((p) => p.enteredAt).length
  const submitted = d.participants.filter((p) => p.submittedAt).length

  return (
    <>
      {/* 2026-11-19 개편: 머리는 다크 무대 카드(ConsoleHero), 탭은 알약 탭 */}
      <div className="flex flex-col gap-5 px-8 pt-6">
        {error && <ErrorState compact message={error} onRetry={reload} />}
        <ConsoleHero
          label="회차 요약"
          badge={<PhaseBadge phase={phase} />}
          title={s.title}
          meta={
            <>
              <span>
                {fmtShort(s.startsAt)} – {fmtHm(s.endsAt)}
              </span>
              <HeroSep />
              <span className="font-sans">{taskTitlesOf(tasks.map, s.taskIds)}</span>
              {s.proctoring && (
                <>
                  <HeroSep />
                  <span className="inline-flex items-center gap-1 font-sans">
                    <Camera size={14} aria-hidden /> 감독
                  </span>
                </>
              )}
            </>
          }
          stats={[
            { label: 'INVITED', value: d.participants.length, unit: '명' },
            { label: 'ENTERED', value: entered, unit: '명' },
            { label: 'SUBMITTED', value: submitted, unit: '명', tone: 'signal' },
            { label: 'UNREVIEWED', value: s.unreviewedEvents, unit: '건', tone: 'caution' },
          ]}
        />
        <PillTabs
          id="session-tab"
          label="회차 화면"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'overview', label: '개요' },
            { value: 'participants', label: <>대상자 <span className="tnum font-mono text-[13px] opacity-80">{d.participants.length}</span></> },
            { value: 'live', label: '실시간 현황', disabled: phase !== 'LIVE', hint: phase !== 'LIVE' ? '진행 중일 때만 볼 수 있습니다' : undefined },
            { value: 'results', label: '결과', disabled: phase !== 'ENDED', hint: phase !== 'ENDED' ? '회차가 끝나면 볼 수 있습니다' : undefined },
          ]}
        />
      </div>
      <div className="p-8">
        {tab === 'overview' && <Overview s={s} tasks={tasks.map} participants={d.participants.length} reload={reload} toast={toast.show} />}
        {tab === 'participants' && <Participants s={s} participants={d.participants} reload={reload} toast={toast.show} />}
        {tab === 'live' && <Live d={d} now={now} paused={paused} setPaused={setPaused} reload={reload} />}
        {tab === 'results' && <Results s={s} />}
      </div>
      {toast.node}
    </>
  )
}

function PhaseBadge({ phase }: { phase: Phase }) {
  return phase === 'LIVE' ? (
    <span
      className="glow-stage inline-flex h-6 items-center gap-1.5 rounded-full bg-stage-alert/15 px-2.5 text-[13px] font-semibold text-stage-alert"
      style={{ '--glow': 'var(--color-stage-alert)' } as CSSProperties}
    >
      <i className="rec-pulse size-1.5 rounded-full bg-stage-alert" aria-hidden /> 진행 중
    </span>
  ) : phase === 'UPCOMING' ? (
    <span className="inline-flex h-6 items-center rounded-full bg-stage-blue/15 px-2.5 text-[13px] font-semibold text-stage-blue">예정</span>
  ) : (
    <span className="inline-flex h-6 items-center rounded-full bg-stage-raised px-2.5 text-[13px] font-semibold text-stage-muted">{phase === 'CANCELED' ? '취소됨' : '종료'}</span>
  )
}

// ── 개요 ──
function Overview({
  s,
  tasks,
  participants,
  reload,
  toast,
}: {
  s: SessionSummary
  tasks: Map<string, ConsoleTaskSummary>
  participants: number
  reload: () => void
  toast: (t: string) => void
}) {
  const canManage = canManageSessions(useAuth().user?.role)
  const [editing, setEditing] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const rows: [string, ReactNode][] = [
    ['회사', <Link key="co" to={`/console/companies/${s.companyId}`} className="text-brand hover:underline">{companyLabel(s.companyId)}</Link>],
    [
      '과제',
      <ol key="t" className="flex flex-col gap-1">
        {s.taskIds.map((id, i) => (
          <li key={id} className="flex items-center gap-2">
            <span className="tnum font-mono text-[12px] text-text-muted">{i + 1}</span>
            <Link to={`/console/tasks/${id}`} className="text-brand hover:underline">
              {tasks.get(id)?.title ?? id}
            </Link>
            {tasks.get(id) && <span className="tnum font-mono text-[12px] text-text-muted">{tasks.get(id)!.minutes}분</span>}
          </li>
        ))}
      </ol>,
    ],
    ['일시', <span key="d" className="tnum font-mono">{fmtTime(s.startsAt)} – {fmtHm(s.endsAt)}</span>],
    ['감독', s.proctoring ? '사용 (카메라, 브라우저 이탈 감지)' : '사용 안 함'],
    ['만든 시각', <span key="m" className="tnum font-mono">{fmtTime(s.createdAt)}</span>],
    ...(s.canceledAt ? ([['취소한 시각', <span key="c" className="tnum font-mono">{fmtTime(s.canceledAt)}</span>]] as [string, ReactNode][]) : []),
  ]
  return (
    <div className="flex flex-col gap-6">
      <section className="overflow-hidden rounded-xl border border-line bg-panel shadow-sm">
        <header className="flex h-10 items-center border-b border-line px-4">
          <span className="label">SETTINGS</span>
          {s.phase === 'UPCOMING' && canManage && (
            <div className="ml-auto flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                회차 수정
              </Button>
              <Button size="sm" variant="danger" onClick={() => setCanceling(true)}>
                회차 취소
              </Button>
            </div>
          )}
        </header>
        <dl className="grid grid-cols-[160px_1fr] text-[15px]">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="border-b border-line px-4 py-3 text-[14px] font-semibold text-text-muted last:border-0">{k}</dt>
              <dd className="border-b border-line px-4 py-3 text-text">{v}</dd>
            </div>
          ))}
        </dl>
        {s.phase !== 'UPCOMING' && <p className="px-4 py-3 text-[13px] text-text-muted">시작했거나 취소한 회차는 수정할 수 없습니다.</p>}
      </section>
      {editing && (
        <EditModal
          s={s}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false)
            toast('회차를 수정했습니다')
            reload()
          }}
        />
      )}
      {canceling && (
        <ConfirmModal
          title="회차를 취소할까요?"
          danger
          confirm="회차 취소"
          onClose={() => setCanceling(false)}
          onConfirm={() => {
            setCanceling(false)
            consoleApi.cancelSession(s.id).then(
              () => {
                toast('회차를 취소했습니다')
                reload()
              },
              (e: unknown) => toast(`취소하지 못했습니다: ${errText(e)}`),
            )
          }}
          body={`「${s.title}」을 취소합니다. 대상자 ${participants}명이 받은 입장 링크는 더 이상 쓸 수 없습니다.`}
        />
      )}
    </div>
  )
}

const p2 = (n: number) => String(n).padStart(2, '0')
/** ISO 시각 → datetime-local 입력값 (브라우저 시간대) */
function toLocalInput(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`
}

function EditModal({ s, onClose, onSaved }: { s: SessionSummary; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(s.title)
  const [proctoring, setProctoring] = useState(s.proctoring)
  const [start, setStart] = useState(() => toLocalInput(s.startsAt))
  const [end, setEnd] = useState(() => toLocalInput(s.endsAt))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const startMs = new Date(start).getTime()
  const endMs = new Date(end).getTime()
  const timeError = isNaN(startMs) || isNaN(endMs) ? '시작·종료 일시를 입력하세요' : endMs <= startMs ? '종료가 시작보다 늦어야 합니다' : null
  const rescheduled = !timeError && (startMs !== Date.parse(s.startsAt) || endMs !== Date.parse(s.endsAt))
  const save = () => {
    setSaving(true)
    setError(null)
    const startsAt = rescheduled ? new Date(startMs).toISOString() : s.startsAt
    const endsAt = rescheduled ? new Date(endMs).toISOString() : s.endsAt
    consoleApi.updateSession(s.id, { title: title.trim(), startsAt, endsAt, proctoring, taskIds: s.taskIds }).then(onSaved, (e: unknown) => {
      setSaving(false)
      setError(errText(e))
    })
  }
  return (
    <Modal
      title="회차 수정"
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button variant="primary" disabled={!title.trim() || !!timeError || saving} onClick={save}>
            {saving && <Loader2 size={14} className="animate-spin" aria-hidden />} 저장
          </Button>
        </>
      }
    >
      <label className="flex flex-col gap-1.5 text-[14px] font-semibold text-text">
        회차 이름
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="h-10 rounded-sm border border-line-strong bg-panel px-3 text-[15px] font-normal outline-none focus:border-brand" />
      </label>
      <label className="mt-4 flex items-center gap-2 text-[14px] text-text">
        <input type="checkbox" checked={proctoring} onChange={(e) => setProctoring(e.target.checked)} className="size-4 accent-[var(--color-brand)]" />
        감독 사용
      </label>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 text-[14px] font-semibold text-text">
          시작 일시
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className="h-10 rounded-sm border border-line-strong bg-panel px-3 text-[15px] font-normal outline-none focus:border-brand" />
        </label>
        <label className="flex flex-col gap-1.5 text-[14px] font-semibold text-text">
          종료 일시
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className="h-10 rounded-sm border border-line-strong bg-panel px-3 text-[15px] font-normal outline-none focus:border-brand" />
        </label>
      </div>
      {timeError && <p className="mt-2 text-[13px] text-alert">{timeError}</p>}
      {rescheduled && <p className="mt-3 text-[13px] text-text-muted">일시를 바꾸면 대상자 전원에게 바뀐 일시로 초대 메일이 다시 나가고, 이전 입장 링크는 쓸 수 없게 됩니다.</p>}
      {error && (
        <p role="alert" className="mt-3 flex items-center gap-1.5 text-[13px] text-alert">
          <CircleAlert size={14} aria-hidden /> {error}
        </p>
      )}
    </Modal>
  )
}

// ── 대상자 ──
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
function parseLines(text: string, existing: string[]) {
  const seen = new Set<string>()
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [a, b] = line.split(/[,\t]/).map((x) => x?.trim() ?? '')
      const [name, email] = EMAIL.test(a) ? [b, a] : [a, b]
      const e = (email ?? '').toLowerCase()
      const status: 'ok' | 'bad' | 'dup' = !name || !EMAIL.test(e) ? 'bad' : existing.includes(e) || seen.has(e) ? 'dup' : 'ok'
      seen.add(e)
      return { line, name, email: e, status }
    })
}

/** 추가 결과: 몇 명 등록됐고 어떤 줄이 왜 빠졌는지 */
function AddResult({ r, dry }: { r: AddParticipantsResult; dry?: boolean }) {
  return (
    <div className="rounded-sm border border-line text-[13px]">
      <p className="border-b border-line px-3 py-1.5 font-semibold text-text">
        {dry ? '등록 가능' : '등록'} <span className="tnum font-mono text-signal">{r.added}</span>명
        {r.rejected.length > 0 && (
          <>
            {' '}│ 제외 <span className="tnum font-mono text-alert">{r.rejected.length}</span>명
          </>
        )}
      </p>
      {r.rejected.length > 0 && (
        <ul className="max-h-[160px] divide-y divide-line overflow-auto">
          {r.rejected.map((x, i) => (
            <li key={i} className="flex items-center gap-3 bg-alert/6 px-3 py-1.5">
              {x.line > 0 && <span className="tnum font-mono text-[12px] text-text-muted">{x.line}행</span>}
              <span className="w-20 truncate text-text">{x.name || '—'}</span>
              <span className="flex-1 truncate font-mono text-text-muted">{x.email || '—'}</span>
              <span className="text-alert">{x.reason}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function inviteCell(p: ParticipantView) {
  if (p.inviteStatus === 'FAILED')
    return (
      <span className="text-alert" title={p.inviteError ?? undefined}>
        메일 실패
      </span>
    )
  if (p.inviteStatus === 'PENDING') return <span className="text-text-faint">보내는 중</span>
  return <span className="text-text-muted">{fmtShort(p.remindedAt ?? p.invitedAt)}</span>
}

function Participants({ s, participants, reload, toast }: { s: SessionSummary; participants: ParticipantView[]; reload: () => void; toast: (t: string) => void }) {
  // 대상자 추가·메일·명단 빼기는 매니저(와 관리자)만. 감독관은 명단을 보기만 한다
  const canManage = canManageSessions(useAuth().user?.role)
  const open = s.phase === 'UPCOMING' || s.phase === 'LIVE'
  const [text, setText] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const parsed = useMemo(() => parseLines(text, participants.map((p) => p.email.toLowerCase())), [text, participants])
  const ok = parsed.filter((r) => r.status === 'ok')
  const [removing, setRemoving] = useState<ParticipantView | null>(null)
  const [busy, setBusy] = useState(false)
  // 회차 만들기에서 CSV 등록이 실패하면 그 오류를 들고 온다
  const csvError = (useLocation().state as { csvError?: string } | null)?.csvError
  const [error, setError] = useState<string | null>(csvError ? `CSV 대상자를 등록하지 못했습니다: ${csvError}` : null)
  const [result, setResult] = useState<AddParticipantsResult | null>(null)
  // CSV: 먼저 dryRun 으로 미리 보고, 확인하면 실제로 등록한다
  const [csv, setCsv] = useState<{ file: File; preview: AddParticipantsResult } | null>(null)

  const run = <T,>(p: Promise<T>, done: (v: T) => void) => {
    setBusy(true)
    setError(null)
    p.then(
      (v) => {
        setBusy(false)
        done(v)
      },
      (e: unknown) => {
        setBusy(false)
        setError(errText(e))
      },
    )
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {open && canManage && (
        <section className="flex h-fit flex-col gap-3 rounded-md border border-line bg-panel p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="label">INVITE</span>
            <h2 className="text-[16px] font-semibold text-text">대상자 추가</h2>
          </div>
          <label htmlFor="people" className="text-[13px] text-text-muted">
            한 줄에 한 명씩 &quot;이름, 이메일&quot;을 붙여 넣거나 CSV를 올리세요. 등록하면 사람마다 다른 입장 링크가 메일로 나갑니다.
          </label>
          <textarea
            id="people"
            rows={6}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'홍길동, gildong@example.com\n김영희, younghee@example.com'}
            className="resize-y rounded-sm border border-line-strong bg-panel p-3 font-mono text-[13px] leading-6 outline-none placeholder:text-text-faint focus:border-brand"
          />
          <div className="flex items-center gap-2">
            <Button size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
              <FileUp size={14} aria-hidden /> 엑셀·CSV 올리기
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                consoleApi.templateXlsxUrl().then(
                  (url) => {
                    const a = document.createElement('a')
                    a.href = url
                    a.download = '대상자_양식.xlsx'
                    a.click()
                    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
                  },
                  (e: unknown) => setError(errText(e)),
                )
              }
            >
              <Download size={14} aria-hidden /> 양식 받기
            </Button>
            {busy && <Loader2 size={16} className="animate-spin text-brand" aria-label="처리 중" />}
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (!f) return
                setResult(null)
                run(consoleApi.importCsv(s.id, f, true), (preview) => setCsv({ file: f, preview }))
              }}
            />
          </div>
          {csv && (
            <div className="flex flex-col gap-2">
              <p className="flex items-center gap-2 text-[13px] text-text-muted">
                <span className="truncate font-mono text-text">{csv.file.name}</span> 미리 보기
                <button type="button" aria-label="CSV 빼기" onClick={() => setCsv(null)} className="ml-auto inline-flex size-6 items-center justify-center rounded-md hover:bg-panel-raised">
                  <X size={14} aria-hidden />
                </button>
              </p>
              <AddResult r={csv.preview} dry />
              <Button
                variant="primary"
                disabled={busy || csv.preview.added === 0}
                onClick={() =>
                  run(consoleApi.importCsv(s.id, csv.file, false), (r) => {
                    setCsv(null)
                    setResult(r)
                    toast(`${r.added}명을 등록하고 초대 메일을 보냈습니다`)
                    reload()
                  })
                }
              >
                <UserPlus size={16} aria-hidden /> CSV로 {csv.preview.added}명 등록
              </Button>
            </div>
          )}
          {parsed.length > 0 && (
            <>
              <ul className="max-h-[220px] divide-y divide-line overflow-auto rounded-sm border border-line text-[13px]">
                {parsed.map((r, i) => (
                  <li key={i} className={cx('flex items-center gap-3 px-3 py-1.5', r.status === 'bad' && 'bg-alert/6', r.status === 'dup' && 'bg-caution/6')}>
                    <span className="w-20 truncate text-text">{r.name || '—'}</span>
                    <span className="flex-1 truncate font-mono text-text-muted">{r.email || r.line}</span>
                    {r.status === 'bad' && <span className="text-alert">형식 오류</span>}
                    {r.status === 'dup' && <span className="text-caution">이미 초대됨</span>}
                  </li>
                ))}
              </ul>
              <Button
                variant="primary"
                disabled={ok.length === 0 || busy}
                onClick={() =>
                  run(consoleApi.addParticipants(s.id, ok.map(({ name, email }) => ({ name, email }))), (r) => {
                    setText('')
                    setResult(r)
                    toast(`${r.added}명을 등록하고 초대 메일을 보냈습니다`)
                    reload()
                  })
                }
              >
                <UserPlus size={16} aria-hidden /> {ok.length}명 초대하기
              </Button>
            </>
          )}
          {result && result.rejected.length > 0 && <AddResult r={result} />}
          {error && (
            <p role="alert" className="flex items-center gap-1.5 text-[13px] text-alert">
              <CircleAlert size={14} aria-hidden /> {error}
            </p>
          )}
        </section>
      )}

      <section className={cx('h-fit overflow-hidden rounded-md border border-line bg-panel shadow-sm', !(open && canManage) && 'xl:col-span-2')}>
        <header className="flex h-10 items-center gap-2 border-b border-line px-4">
          <span className="label">PARTICIPANTS</span>
          <span className="tnum ml-auto font-mono text-[12px] text-text-muted">
            입장 {participants.filter((p) => p.enteredAt).length} / 초대 {participants.length}
          </span>
        </header>
        {participants.length === 0 ? (
          <p className="py-16 text-center text-[14px] text-text-muted">아직 초대한 대상자가 없습니다.</p>
        ) : (
          <table className="w-full text-[14px]">
            <thead>
              <tr className="h-9 border-b border-line text-left">
                {['이름', '이메일', '초대 메일', '입장', ''].map((h) => (
                  <th key={h} className="px-4 text-[13px] font-semibold text-text-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {participants.map((p) => (
                <tr key={p.id} className="h-11 border-b border-line last:border-0">
                  <td className="px-4 font-medium text-text">{p.name}</td>
                  <td className="px-4 font-mono text-[13px] text-text-muted">{p.email}</td>
                  <td className="tnum px-4 font-mono text-[13px]">{inviteCell(p)}</td>
                  <td className="tnum px-4 font-mono text-[13px]">{p.enteredAt ? <span className="text-text">{fmtShort(p.enteredAt)}</span> : <span className="text-text-faint">미입장</span>}</td>
                  <td className="w-12 px-2">
                    {canManage && (
                      <RowMenu
                        label={`${p.name} 메뉴`}
                        items={[
                          {
                            text: '메일 다시 보내기',
                            disabled: !open,
                            onClick: () =>
                              consoleApi.resendInvite(s.id, p.id).then(
                                () => {
                                  toast(`${p.email}로 다시 보냈습니다`)
                                  reload()
                                },
                                (e: unknown) => toast(`보내지 못했습니다: ${errText(e)}`),
                              ),
                          },
                          { text: '명단에서 빼기', danger: true, disabled: !!p.enteredAt || !open, onClick: () => setRemoving(p) },
                        ]}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {removing && (
        <ConfirmModal
          title="명단에서 뺄까요?"
          danger
          confirm="빼기"
          onClose={() => setRemoving(null)}
          onConfirm={() => {
            const p = removing
            setRemoving(null)
            consoleApi.removeParticipant(s.id, p.id).then(
              () => {
                toast(`${p.name}을(를) 명단에서 뺐습니다`)
                reload()
              },
              (e: unknown) => toast(`빼지 못했습니다: ${errText(e)}`),
            )
          }}
          body={`${removing.name}(${removing.email})의 입장 링크를 더 이상 쓸 수 없게 됩니다.`}
        />
      )}
    </div>
  )
}

// ── 실시간 현황 ──
const STATE_STYLE: Record<ResultState, { dot: string; text: string }> = {
  NOT_ENTERED: { dot: 'bg-text-faint', text: 'text-text-faint' },
  WAITING: { dot: 'bg-info', text: 'text-info' },
  SOLVING: { dot: 'bg-brand', text: 'text-brand' },
  SUBMITTED: { dot: 'bg-signal', text: 'text-signal' },
}
const STATES: ResultState[] = ['NOT_ENTERED', 'WAITING', 'SOLVING', 'SUBMITTED']
function StateDot({ state }: { state: ResultState }) {
  const st = STATE_STYLE[state]
  return (
    <span className={cx('inline-flex items-center gap-1.5 text-[14px] font-medium', st.text)}>
      <i className={cx('size-2 rounded-full', st.dot, state === 'SOLVING' && 'rec-pulse')} aria-hidden />
      {PSTATE_LABEL[state]}
    </span>
  )
}

function Live({
  d,
  now,
  paused,
  setPaused,
  reload,
}: {
  d: SessionDetail
  now: number
  paused: boolean
  setPaused: (f: (v: boolean) => boolean) => void
  reload: () => void
}) {
  const s = d.session
  const ev = useLoad<{ list: ProctorEventView[]; at: string }>(
    `events-${s.id}`,
    () => consoleApi.events(s.id).then((list) => ({ list, at: new Date().toISOString() })),
    paused ? undefined : 5000,
  )
  const events = useMemo(() => ev.data?.list ?? [], [ev.data])
  const [open, setOpen] = useState<number | null>(null)
  const names = useMemo(() => new Map(d.participants.map((p) => [p.id, p.name])), [d.participants])
  const feed = useMemo(() => [...events].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)), [events])

  // 새로 생긴 이벤트는 위에서 밀려 들어오고 잠깐 강조한다 (DESIGN.md §7-9). 처음 불러온 것들은 강조하지 않는다
  const [seen, setSeen] = useState<{ ids: Set<number>; fresh: Set<number> } | null>(null)
  if (ev.data && (!seen || events.some((e) => !seen.ids.has(e.id)))) {
    const ids = new Set(events.map((e) => e.id))
    setSeen({ ids, fresh: seen ? new Set(events.filter((e) => !seen.ids.has(e.id)).map((e) => e.id)) : new Set() })
  }
  const fresh = seen?.fresh ?? new Set<number>()

  const left = Date.parse(s.endsAt) - now
  const total = Date.parse(s.endsAt) - Date.parse(s.startsAt)
  const counts = (st: ResultState) => d.participants.filter((p) => stateOf(p) === st).length
  const opened = d.participants.find((p) => p.id === open)
  const evCount = (pid: number) => events.filter((e) => e.participantId === pid).length

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-wrap items-center gap-8 rounded-md border border-line bg-panel px-6 py-5 shadow-sm">
        <div>
          <p className="label">REMAINING</p>
          <p className={cx('tnum font-mono text-[56px] leading-[60px] font-semibold', left <= 3 * 60_000 ? 'text-alert' : left <= 10 * 60_000 ? 'text-caution' : 'text-text')}>{fmtLeft(left)}</p>
          <div className="mt-2 h-1 w-64 overflow-hidden rounded-full bg-panel-raised">
            <div className="bg-brand-gradient h-full w-full origin-left transition-transform duration-500" style={{ transform: `scaleX(${Math.min(1, Math.max(0, (total - left) / total))})` }} />
          </div>
        </div>
        <ul className="flex flex-wrap gap-2">
          {STATES.map((st) => (
            <li key={st} className="flex items-center gap-2 rounded-md border border-line px-3 py-2">
              <StateDot state={st} />
              <span className="tnum font-mono text-[18px] font-semibold text-text">{counts(st)}</span>
            </li>
          ))}
        </ul>
        <div className="ml-auto flex items-center gap-3">
          {ev.data && <span className="tnum font-mono text-[12px] text-text-faint">{fmtTime(ev.data.at).slice(11)} 갱신</span>}
          <Button size="sm" onClick={() => setPaused((v) => !v)} aria-pressed={paused}>
            {paused ? <Play size={14} aria-hidden /> : <Pause size={14} aria-hidden />}
            {paused ? '자동 갱신 다시 켜기' : '자동 갱신 멈춤'}
          </Button>
        </div>
      </section>
      {ev.error && <ErrorState compact message={ev.error} onRetry={ev.reload} />}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="overflow-hidden rounded-md border border-line bg-panel shadow-sm">
          <header className="flex h-10 items-center border-b border-line px-4">
            <span className="label">PARTICIPANTS</span>
          </header>
          {d.participants.length === 0 ? (
            <p className="py-16 text-center text-[14px] text-text-muted">대상자가 없습니다.</p>
          ) : (
            <table className="w-full text-[14px]">
              <thead>
                <tr className="h-9 border-b border-line text-left">
                  {['이름', '상태', '입장', '시작', '감독 이벤트', '제출'].map((h, i) => (
                    <th key={h} className={cx('px-4 text-[13px] font-semibold text-text-muted', i === 4 && 'text-right')}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.participants.map((p) => (
                  <tr key={p.id} onClick={() => setOpen(p.id)} className="h-12 cursor-pointer border-b border-line last:border-0 hover:bg-panel-raised">
                    <td className="px-4 font-medium text-text">{p.name}</td>
                    <td className="px-4">
                      <span className="inline-flex items-center gap-2">
                        <StateDot state={stateOf(p)} />
                        {p.linkExpired && <span className="rounded-sm bg-alert/10 px-1.5 py-0.5 text-[12px] font-semibold text-alert">링크 만료</span>}
                      </span>
                    </td>
                    <td className="tnum px-4 font-mono text-[13px] text-text-muted">{p.enteredAt ? fmtHm(p.enteredAt) : '—'}</td>
                    <td className="tnum px-4 font-mono text-[13px] text-text-muted">{p.startedAt ? fmtHm(p.startedAt) : '—'}</td>
                    <td className="px-4 text-right">
                      {evCount(p.id) ? (
                        <span className="tnum rounded-sm bg-caution/12 px-1.5 py-0.5 font-mono text-[12px] font-semibold text-caution">{evCount(p.id)}</span>
                      ) : (
                        <span className="text-text-faint">0</span>
                      )}
                    </td>
                    <td className="tnum px-4 font-mono text-[13px] text-text-muted">
                      {p.submittedAt ? fmtHm(p.submittedAt) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="flex max-h-[560px] flex-col overflow-hidden rounded-md border border-line bg-panel shadow-sm" aria-live="polite">
          <header className="flex h-10 shrink-0 items-center border-b border-line px-4">
            <span className="label">EVENT FEED</span>
            <span className="tnum ml-auto font-mono text-[12px] text-text-muted">{feed.length}건</span>
          </header>
          <ol className="min-h-0 flex-1 overflow-auto">
            {ev.loading && (
              <li>
                <Loading text="감독 이벤트를 불러오는 중" className="py-12" />
              </li>
            )}
            {ev.data && feed.length === 0 && <li className="py-12 text-center text-[14px] text-text-muted">{s.proctoring ? '아직 감독 이벤트가 없습니다.' : '감독을 쓰지 않는 회차입니다.'}</li>}
            <AnimatePresence initial={false}>
              {feed.map((e) => (
                <motion.li key={e.id} initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: duration.normal, ease: easing.expo }}>
                  <button
                    type="button"
                    onClick={() => setOpen(e.participantId)}
                    className={cx('flex w-full items-start gap-3 border-b border-line px-4 py-3 text-left transition-colors duration-500 hover:bg-panel-raised', fresh.has(e.id) && 'bg-brand-dim')}
                  >
                    <i className={cx('mt-1.5 size-2 shrink-0', isCameraEvent(e) ? 'rounded-full bg-alert' : 'rotate-45 bg-caution')} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] text-text">
                        <b className="font-semibold">{names.get(e.participantId) ?? `#${e.participantId}`}</b> {EVENT_LABEL[e.type] ?? e.type}
                      </span>
                      <span className="tnum font-mono text-[12px] text-text-muted">
                        {fmtTime(e.startedAt).slice(11)}
                        {e.confidence != null && ` │ 확신도 ${e.confidence.toFixed(2)}`}
                      </span>
                    </span>
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
        </section>
      </div>

      {opened && (
        <div className="fade-in fixed inset-0 z-40 flex justify-end bg-text/20" onMouseDown={() => setOpen(null)}>
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={`${opened.name} 감독 기록`}
            onMouseDown={(e) => e.stopPropagation()}
            className="flex h-full w-[440px] flex-col overflow-auto border-l border-line bg-bg shadow-modal"
          >
            <div className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-panel px-4">
              <span className="text-[16px] font-semibold text-text">{opened.name}</span>
              <StateDot state={stateOf(opened)} />
              <button type="button" aria-label="닫기" onClick={() => setOpen(null)} className="ml-auto inline-flex size-8 items-center justify-center rounded-md text-text-muted hover:bg-panel-raised">
                <X size={18} aria-hidden />
              </button>
            </div>
            <div className="p-4">
              {s.proctoring && <EnvCheckCard session={s} p={opened} pollMs={paused ? undefined : 5000} />}
              <ProctorPanel session={s} p={opened} pollMs={paused ? undefined : 5000} onRestored={reload} />
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}

// ── 결과 ──
type SortKey = 'score' | 'name' | 'open'
type ItemCol = { name: string; max: number; color: string }

/** 결과에 나온 항목 이름으로 열을 만든다. 배점은 항목 배점 × 회차 과제 수 (과제가 여럿이면 합산) */
function itemCols(names: string[], taskCount: number): ItemCol[] {
  const known = ITEM_KEYS.filter((k) => names.includes(k[1])).map((k) => ({ name: k[1] as string, max: k[2] * Math.max(1, taskCount), color: k[3] as string }))
  const rest = names.filter((n) => !ITEM_KEYS.some((k) => k[1] === n)).map((n) => ({ name: n, max: 0, color: 'var(--color-text-muted)' }))
  return [...known, ...rest]
}

function Results({ s }: { s: SessionSummary }) {
  const nav = useNavigate()
  const [sort, setSort] = useState<SortKey>('score')
  const res = useLoad(`results-${s.id}`, () => consoleApi.results(s.id))
  const ev = useLoad(s.proctoring ? `events-${s.id}` : null, () => consoleApi.events(s.id))
  const events = ev.data ?? []
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [rescueOpen, setRescueOpen] = useState(false)
  const [rescuing, setRescuing] = useState(false)
  const [rescueMsg, setRescueMsg] = useState<{ text: string; error: boolean } | null>(null)

  if (res.error) return <ErrorState message={res.error} onRetry={res.reload} />
  if (!res.data) return <Loading text="결과를 불러오는 중" />
  const r = res.data
  const cols = itemCols(Object.keys(r.itemAverages), s.taskIds.length)
  // 항목 배점을 모를 때는 응시자 최고점을 막대 끝으로 쓴다
  const maxOf = (c: ItemCol) => c.max || Math.max(1, ...r.rows.map((x) => x.items?.[c.name] ?? 0))
  const evTotal = (row: ResultRow) => Object.values(row.events).reduce((n, v) => n + (v ?? 0), 0)
  const rows = [...r.rows].sort((a, b) =>
    sort === 'name'
      ? a.name.localeCompare(b.name)
      : sort === 'open'
        ? unreviewedOf(events, b.participantId) - unreviewedOf(events, a.participantId)
        : (b.score ?? -1) - (a.score ?? -1) || a.rank - b.rank,
  )
  // 자동 제출이 포기하고 닫은 응시를 담당자가 다시 채점으로 넘긴다. 채점에는 AI 호출 비용이 든다
  const rescue = () => {
    setRescuing(true)
    consoleApi.rescueSession(s.id).then(
      (out) => {
        setRescuing(false)
        setRescueOpen(false)
        setRescueMsg(
          out.pending === 0
            ? { text: '채점으로 넘길 응시가 없습니다. 모두 이미 채점 단계입니다.', error: false }
            : out.failed === 0
              ? { text: `멈춘 응시 ${out.pending}건을 채점으로 넘겼습니다. 채점에는 1~2분 걸립니다. 잠시 뒤 결과가 갱신됩니다.`, error: false }
              : { text: `멈춘 응시 ${out.pending}건 중 ${out.failed}건은 이번에도 넘기지 못했습니다. 서버 로그를 확인해 주세요.`, error: true },
        )
        res.reload()
      },
      (e: unknown) => {
        setRescuing(false)
        setRescueOpen(false)
        setRescueMsg({ text: `넘기지 못했습니다: ${errText(e)}`, error: true })
      },
    )
  }
  const exportCsv = () => {
    setExporting(true)
    setExportError(null)
    consoleApi.resultsXlsxUrl(s.id).then(
      (url) => {
        const a = document.createElement('a')
        a.href = url
        a.download = `${s.title}_결과.xlsx`
        a.click()
        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
        setExporting(false)
      },
      (e: unknown) => {
        setExporting(false)
        setExportError(errText(e))
      },
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {ev.error && <ErrorState compact message={`감독 이벤트: ${ev.error}`} onRetry={ev.reload} />}
      <Distribution rows={r.rows.filter((x) => x.items)} cols={cols} maxOf={maxOf} average={r.average} />
      <section className="overflow-hidden rounded-xl border border-line bg-panel shadow-sm">
        <header className="flex h-12 items-center gap-3 border-b border-line px-4">
          <span className="label">RESULTS</span>
          <span className="text-[13px] text-text-muted">
            채점 완료 {r.scored} / {r.participants}명
          </span>
          <div className="ml-auto flex items-center gap-1.5 text-[13px] text-text-muted">
            <ArrowDownUp size={14} aria-hidden />
            <Select<SortKey>
              size="sm"
              value={sort}
              onChange={setSort}
              ariaLabel="정렬"
              options={[
                { value: 'score', label: '순위 순' },
                { value: 'name', label: '이름 순' },
                { value: 'open', label: '미확인 이벤트 많은 순' },
              ]}
            />
          </div>
          {s.phase === 'ENDED' && (
            <Button size="sm" variant="ghost" onClick={() => setRescueOpen(true)} disabled={rescuing} title="채점 단계에 가지 못하고 멈춘 응시를 다시 채점으로 넘깁니다">
              {rescuing ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <RotateCw size={14} aria-hidden />} 멈춘 응시 다시 넘기기
            </Button>
          )}
          <Button size="sm" onClick={exportCsv} disabled={exporting}>
            {exporting ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Download size={14} aria-hidden />} 결과 내보내기
          </Button>
        </header>
        {exportError && <ErrorState compact className="m-3" message={exportError} />}
        {rescueMsg && (rescueMsg.error ? <ErrorState compact className="m-3" message={rescueMsg.text} /> : <p role="status" className="m-3 rounded-md bg-signal/10 px-3 py-2 text-[13px] text-signal">{rescueMsg.text}</p>)}
        {rescueOpen && (
          <ConfirmModal
            title="멈춘 응시 다시 넘기기"
            confirm="채점으로 넘기기"
            disabled={rescuing}
            onConfirm={rescue}
            onClose={() => setRescueOpen(false)}
            body={
              <p className="text-[14px] leading-6 text-text-muted">
                시간이 끝났는데 채점 단계로 가지 못한 응시를 다시 채점으로 넘깁니다. 후속 질문에 답하지 못한 응시는 빈 답으로 마무리됩니다.
                <br />
                채점에는 AI 호출 비용이 듭니다. 이미 채점 중이거나 끝난 응시는 건드리지 않습니다.
              </p>
            }
          />
        )}
        {rows.length === 0 ? (
          <p className="py-16 text-center text-[14px] text-text-muted">대상자가 없습니다.</p>
        ) : (
          <table className="w-full text-[14px]">
            <thead>
              <tr className="h-9 border-b border-line text-left">
                {['순위', '이름', '상태', '총점', '역량', '감독 이벤트', '부정 의심', ''].map((h, i) => (
                  <th key={i} className="px-4 text-[13px] font-semibold text-text-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const done = p.score != null
                const canOpen = p.state === 'SUBMITTED' || done
                const total = evTotal(p)
                const open = unreviewedOf(events, p.participantId)
                const sus = suspectsOf(events, p.participantId)
                return (
                  <tr
                    key={p.participantId}
                    onClick={() => canOpen && nav(`/console/sessions/${s.id}/attempts/${p.participantId}`)}
                    className={cx('h-14 border-b border-line last:border-0', canOpen ? 'cursor-pointer hover:bg-panel-raised' : 'text-text-faint')}
                  >
                    <td className="w-16 px-4">
                      {done && p.rank > 0 ? (
                        <span
                          className={cx(
                            'tnum inline-flex size-8 items-center justify-center rounded-full font-mono text-[14px] font-semibold',
                            p.rank === 1 ? 'bg-brand-gradient text-on-accent shadow-[0_6px_16px_-6px_rgb(108_71_255/0.6)]' : 'bg-panel-raised text-text',
                          )}
                        >
                          {p.rank}
                        </span>
                      ) : (
                        <span className="text-text-faint">—</span>
                      )}
                    </td>
                    <td className="px-4">
                      <p className="font-medium text-text">{p.name}</p>
                      <p className="font-mono text-[12px] text-text-muted">{p.email}</p>
                    </td>
                    <td className="px-4 text-[13px]">{done ? '채점 완료' : p.state === 'SUBMITTED' ? '채점 중' : PSTATE_LABEL[p.state]}</td>
                    <td className="px-4">
                      {done ? (
                        <span className="inline-flex items-center gap-1">
                          <ScoreChip score={p.score!} />
                          {p.maxScore != null && p.maxScore !== 100 && <span className="tnum font-mono text-[12px] text-text-muted">/ {p.maxScore}</span>}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4">
                      {p.items ? (
                        <span className="flex items-end gap-1" role="img" aria-label={cols.map((c) => `${c.name} ${p.items![c.name] ?? 0}/${maxOf(c)}`).join(', ')}>
                          {cols.map((c) => (
                            <span key={c.name} title={`${c.name} ${p.items![c.name] ?? 0} / ${maxOf(c)}`} className="flex h-7 w-6 items-end overflow-hidden rounded-[3px] bg-panel-raised">
                              <span className="w-full" style={{ height: `${Math.min(100, ((p.items![c.name] ?? 0) / maxOf(c)) * 100)}%`, background: c.color }} />
                            </span>
                          ))}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="tnum px-4 font-mono text-[13px]">
                      {total === 0 ? (
                        <span className="text-text-faint">0</span>
                      ) : (
                        <span className={open ? 'font-semibold text-caution' : 'text-text-muted'}>
                          미확인 {open} / {total}
                        </span>
                      )}
                    </td>
                    <td className="tnum px-4 font-mono text-[13px]">{sus ? <span className="font-semibold text-alert">{sus}</span> : <span className="text-text-faint">0</span>}</td>
                    <td className="w-24 px-4 text-right">{canOpen && <span className="text-[13px] font-semibold text-brand">리포트</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}

/**
 * 역량별 분포 (기획_결정사항 §1). 항목마다 0~배점 막대 위에 응시자 점을 찍고, 평균을 세로선으로 표시한다.
 * 색은 항목을 뜻한다(§1.5). 점에 마우스를 올리면 이름과 점수.
 */
function Distribution({ rows, cols, maxOf, average }: { rows: ResultRow[]; cols: ItemCol[]; maxOf: (c: ItemCol) => number; average: number | null }) {
  if (rows.length === 0 || cols.length === 0) return null
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-panel shadow-sm" aria-label="역량별 분포">
      <header className="flex h-12 items-center gap-3 border-b border-line px-4">
        <span className="label">DISTRIBUTION</span>
        <span className="text-[15px] font-semibold text-text">역량별 분포</span>
        <span className="tnum ml-auto font-mono text-[13px] text-text-muted">
          {average != null && (
            <>
              평균 총점 <b className="text-text">{Math.round(average)}</b> │{' '}
            </>
          )}
          {rows.length}명
        </span>
      </header>
      <ul className="flex flex-col gap-3 px-5 py-4">
        {cols.map((c) => {
          const max = maxOf(c)
          const vals = rows.map((p) => ({ p, v: p.items?.[c.name] ?? 0 }))
          const avg = vals.reduce((n, x) => n + x.v, 0) / vals.length
          return (
            <li key={c.name} className="grid grid-cols-[120px_minmax(0,1fr)_88px] items-center gap-4">
              <span className="flex items-center gap-2 text-[14px] font-medium text-text">
                <span className="size-2 rounded-full" style={{ background: c.color }} aria-hidden />
                {c.name}
              </span>
              <div className="relative h-6" role="img" aria-label={`${c.name} 분포: 평균 ${avg.toFixed(1)} / ${max}`}>
                <span className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-panel-raised" aria-hidden />
                <span className="absolute top-0 bottom-0 w-0.5 -translate-x-1/2 rounded-full bg-text/60" style={{ left: `${Math.min(100, (avg / max) * 100)}%` }} aria-hidden />
                {vals.map(({ p, v }) => (
                  <span
                    key={p.participantId}
                    title={`${p.name} ${v} / ${max}`}
                    className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-panel"
                    style={{ left: `${Math.min(100, (v / max) * 100)}%`, background: c.color, boxShadow: `0 0 8px color-mix(in srgb, ${c.color} 50%, transparent)` }}
                  />
                ))}
              </div>
              <span className="tnum text-right font-mono text-[13px] text-text-muted">
                평균 <b className="text-text">{avg.toFixed(1)}</b>/{max}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
