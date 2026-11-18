// DESIGN.md §7-9-4 회차 상세: 개요 / 대상자 / 실시간 현황 / 결과
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowDownUp, Camera, CircleAlert, Copy, Download, FileUp, Pause, Play, UserPlus, X } from 'lucide-react'
import { cx } from '../../components/cx'
import { useConsoleCrumbs } from '../../components/consoleCrumbs'
import { Button, MetricTile, ScoreChip, Sep, Tabs } from '../../components/ui'
import {
  companyName,
  EVENT_LABEL,
  PSTATE_LABEL,
  deleteSession,
  inviteLink,
  inviteParticipants,
  isCameraEvent,
  phaseOf,
  removeParticipant,
  suspects,
  tickLive,
  unreviewed,
  updateSession,
  useSession,
  type PState,
  type Participant,
  type Session,
  type SessionPhase,
} from '../../data/consoleSessions'
import { ConfirmModal, Modal, RowMenu } from './common'
import { fmtAgo, fmtHm, fmtLeft, fmtShort, fmtTime, useMyCompanyId, useNow, useToast } from './format'
import ProctorPanel from './ProctorPanel'

type Tab = 'overview' | 'participants' | 'live' | 'results'
const ITEM_KEYS = [
  ['usage', 'AI 활용력', 20, 'var(--color-branch-2)'],
  ['control', 'AI 통제력', 15, 'var(--color-branch-3)'],
  ['decomposition', '문제 분해력', 10, 'var(--color-branch-4)'],
  ['delegation', '위임 판단력', 10, 'var(--color-comp-7)'],
  ['delivery', 'AI 결과 도출력', 30, 'var(--color-branch-5)'],
  ['potential', '성과 잠재력', 15, 'var(--color-comp-6)'],
] as const

export default function ConsoleSessionDetail() {
  const { sessionId } = useParams()
  const s = useSession(sessionId)
  const mine = useMyCompanyId()
  if (!s || (mine != null && s.companyId !== mine)) {
    return (
      <div className="flex flex-col items-center gap-3 py-32 text-center">
        <CircleAlert size={28} className="text-text-faint" aria-hidden />
        <p className="text-[15px] text-text-muted">찾을 수 없는 회차입니다.</p>
        <Link to="/console/sessions" className="text-[14px] font-semibold text-brand hover:underline">
          회차 목록으로
        </Link>
      </div>
    )
  }
  return <Detail key={s.id} s={s} />
}

function Detail({ s }: { s: Session }) {
  useConsoleCrumbs([s.title])
  const now = useNow(1000)
  const phase = phaseOf(s, now)
  const [params, setParams] = useSearchParams()
  const fallback: Tab = phase === 'live' ? 'live' : phase === 'ended' ? 'results' : 'overview'
  let tab = (params.get('tab') as Tab) || fallback
  if ((tab === 'live' && phase !== 'live') || (tab === 'results' && phase !== 'ended')) tab = fallback
  const setTab = (t: Tab) => setParams({ tab: t }, { replace: true })
  const toast = useToast()

  return (
    <>
      <header className="flex flex-wrap items-center gap-4 border-b border-line px-8 py-4">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-3">
            <PhaseBadge phase={phase} />
            <h1 className="truncate text-[21px] leading-7 font-bold text-text">{s.title}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3 font-mono text-[13px] text-text-muted">
            <span className="tnum">
              {fmtShort(s.startsAt)} – {fmtHm(s.endsAt)}
            </span>
            <Sep />
            <span className="font-sans">{s.taskTitle}</span>
            <Sep />
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(s.entryCode).catch(() => {})
                toast.show(`입장 코드 ${s.entryCode}를 복사했습니다`)
              }}
              className="inline-flex items-center gap-1 font-semibold text-text hover:text-brand"
              aria-label={`입장 코드 ${s.entryCode} 복사`}
            >
              {s.entryCode} <Copy size={13} aria-hidden />
            </button>
            {s.proctoring && (
              <>
                <Sep />
                <span className="inline-flex items-center gap-1 font-sans">
                  <Camera size={14} aria-hidden /> 감독
                </span>
              </>
            )}
          </div>
        </div>
      </header>
      <div className="border-b border-line bg-panel px-8">
        <Tabs
          value={tab}
          onChange={(t) => {
            if ((t === 'live' && phase !== 'live') || (t === 'results' && phase !== 'ended')) return
            setTab(t)
          }}
          className="h-11"
          tabs={[
            { value: 'overview', label: '개요' },
            { value: 'participants', label: <>대상자 <Num n={s.participants.length} /></> },
            { value: 'live', label: <span className={cx(phase !== 'live' && 'opacity-40')} title={phase !== 'live' ? '진행 중일 때만 볼 수 있습니다' : undefined}>실시간 현황</span> },
            { value: 'results', label: <span className={cx(phase !== 'ended' && 'opacity-40')} title={phase !== 'ended' ? '회차가 끝나면 볼 수 있습니다' : undefined}>결과</span> },
          ]}
        />
      </div>
      <div className="p-8">
        {tab === 'overview' && <Overview s={s} phase={phase} />}
        {tab === 'participants' && <Participants s={s} phase={phase} toast={toast.show} />}
        {tab === 'live' && <Live s={s} now={now} />}
        {tab === 'results' && <Results s={s} />}
      </div>
      {toast.node}
    </>
  )
}

function PhaseBadge({ phase }: { phase: SessionPhase }) {
  return phase === 'live' ? (
    <span className="inline-flex h-[22px] items-center gap-1.5 rounded-sm bg-alert/10 px-2 text-[13px] font-semibold text-alert">
      <i className="rec-pulse size-1.5 rounded-full bg-alert" aria-hidden /> 진행 중
    </span>
  ) : phase === 'upcoming' ? (
    <span className="inline-flex h-[22px] items-center rounded-sm bg-info/10 px-2 text-[13px] font-semibold text-info">예정</span>
  ) : (
    <span className="inline-flex h-[22px] items-center rounded-sm bg-panel-raised px-2 text-[13px] font-semibold text-text-muted">종료</span>
  )
}
function Num({ n }: { n: number }) {
  return <span className="tnum ml-1 rounded-sm bg-panel-raised px-1.5 font-mono text-[12px] text-text-muted">{n}</span>
}

// ── 개요 ──
function Overview({ s, phase }: { s: Session; phase: SessionPhase }) {
  const nav = useNavigate()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const entered = s.participants.filter((p) => p.enteredAt).length
  const submitted = s.participants.filter((p) => p.state === 'SUBMITTED').length
  const open = s.participants.reduce((n, p) => n + unreviewed(p), 0)
  const rows: [string, ReactNode][] = [
    ['회사', <Link key="co" to={`/console/companies/${s.companyId}`} className="text-brand hover:underline">{companyName(s.companyId)}</Link>],
    ['과제', <Link key="t" to={`/console/tasks/${s.taskId}`} className="text-brand hover:underline">{s.taskTitle}</Link>],
    ['일시', <span key="d" className="tnum font-mono">{fmtTime(s.startsAt)} – {fmtHm(s.endsAt)}</span>],
    ['입장 코드', <span key="c" className="font-mono font-semibold">{s.entryCode}</span>],
    ['감독', s.proctoring ? '사용 (카메라, 브라우저 이탈 감지)' : '사용 안 함'],
    ['만든 시각', <span key="m" className="tnum font-mono">{fmtTime(s.createdAt)}</span>],
  ]
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <MetricTile label="INVITED" value={s.participants.length} unit="명" sub="초대" />
        <MetricTile label="ENTERED" value={entered} unit="명" sub="입장" />
        <MetricTile label="SUBMITTED" value={submitted} unit="명" sub="제출" />
        <MetricTile label="UNREVIEWED" value={open} unit="건" sub={<span className={open ? 'text-caution' : ''}>미확인 감독 이벤트</span>} />
      </div>
      <section className="rounded-md border border-line bg-panel shadow-sm">
        <header className="flex h-10 items-center border-b border-line px-4">
          <span className="label">SETTINGS</span>
          {phase === 'upcoming' && (
            <div className="ml-auto flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                회차 수정
              </Button>
              <Button size="sm" variant="danger" onClick={() => setDeleting(true)}>
                회차 삭제
              </Button>
            </div>
          )}
        </header>
        <dl className="grid grid-cols-[160px_1fr] text-[15px]">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-[14px] font-semibold text-text-muted border-b border-line px-4 py-3 last:border-0">{k}</dt>
              <dd className="border-b border-line px-4 py-3 text-text">{v}</dd>
            </div>
          ))}
        </dl>
        {phase !== 'upcoming' && <p className="px-4 py-3 text-[13px] text-text-muted">시작한 회차는 수정하거나 삭제할 수 없습니다.</p>}
      </section>
      {editing && <EditModal s={s} onClose={() => setEditing(false)} />}
      {deleting && (
        <ConfirmModal
          title="회차를 삭제할까요?"
          danger
          confirm="삭제"
          onClose={() => setDeleting(false)}
          onConfirm={() => {
            deleteSession(s.id)
            nav('/console/sessions', { replace: true })
          }}
          body={`「${s.title}」과 대상자 ${s.participants.length}명의 초대가 사라집니다. 이미 보낸 입장 링크는 더 이상 쓸 수 없습니다.`}
        />
      )}
    </div>
  )
}

function EditModal({ s, onClose }: { s: Session; onClose: () => void }) {
  const [title, setTitle] = useState(s.title)
  const [proctoring, setProctoring] = useState(s.proctoring)
  return (
    <Modal
      title="회차 수정"
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button
            variant="primary"
            disabled={!title.trim()}
            onClick={() => {
              updateSession(s.id, { title: title.trim(), proctoring })
              onClose()
            }}
          >
            저장
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
      <p className="mt-3 text-[13px]">일시를 바꾸려면 회차를 지우고 새로 만드세요. 이미 보낸 초대 메일의 시각이 달라지지 않게 하기 위해서입니다.</p>
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

function Participants({ s, phase, toast }: { s: Session; phase: SessionPhase; toast: (t: string) => void }) {
  const [text, setText] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const parsed = useMemo(() => parseLines(text, s.participants.map((p) => p.email)), [text, s.participants])
  const ok = parsed.filter((r) => r.status === 'ok')
  const [removing, setRemoving] = useState<Participant | null>(null)

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {phase !== 'ended' && (
        <section className="flex h-fit flex-col gap-3 rounded-md border border-line bg-panel p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="label">INVITE</span>
            <h2 className="text-[16px] font-semibold text-text">대상자 추가</h2>
          </div>
          <label htmlFor="people" className="text-[13px] text-text-muted">
            한 줄에 한 명씩 &quot;이름, 이메일&quot;을 붙여 넣거나 CSV를 올리세요.
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
            <Button size="sm" onClick={() => fileRef.current?.click()}>
              <FileUp size={14} aria-hidden /> CSV 올리기
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0]
                if (f) {
                  const body = (await f.text()).replace(/^.*이름.*\n/, '')
                  setText((t) => (t ? t + '\n' : '') + body)
                }
                e.target.value = ''
              }}
            />
          </div>
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
                disabled={ok.length === 0}
                onClick={() => {
                  inviteParticipants(s.id, ok.map(({ name, email }) => ({ name, email })))
                  setText('')
                  toast(`${ok.length}명을 초대했습니다 (목업: 메일은 보내지 않음)`)
                }}
              >
                <UserPlus size={16} aria-hidden /> {ok.length}명 초대하기
              </Button>
            </>
          )}
        </section>
      )}

      <section className={cx('h-fit overflow-hidden rounded-md border border-line bg-panel shadow-sm', phase === 'ended' && 'xl:col-span-2')}>
        <header className="flex h-10 items-center gap-2 border-b border-line px-4">
          <span className="label">PARTICIPANTS</span>
          <span className="tnum ml-auto font-mono text-[12px] text-text-muted">
            입장 {s.participants.filter((p) => p.enteredAt).length} / 초대 {s.participants.length}
          </span>
        </header>
        {s.participants.length === 0 ? (
          <p className="py-16 text-center text-[14px] text-text-muted">아직 초대한 대상자가 없습니다.</p>
        ) : (
          <table className="w-full text-[14px]">
            <thead>
              <tr className="h-9 border-b border-line text-left">
                {['이름', '이메일', '초대', '입장', ''].map((h) => (
                  <th key={h} className="px-4 text-[13px] font-semibold text-text-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.participants.map((p) => (
                <tr key={p.id} className="h-11 border-b border-line last:border-0">
                  <td className="px-4 font-medium text-text">{p.name}</td>
                  <td className="px-4 font-mono text-[13px] text-text-muted">{p.email}</td>
                  <td className="tnum px-4 font-mono text-[13px] text-text-muted">{fmtShort(p.invitedAt)}</td>
                  <td className="tnum px-4 font-mono text-[13px]">{p.enteredAt ? <span className="text-text">{fmtShort(p.enteredAt)}</span> : <span className="text-text-faint">미입장</span>}</td>
                  <td className="w-12 px-2">
                    <RowMenu
                      label={`${p.name} 메뉴`}
                      items={[
                        {
                          text: '입장 링크 복사',
                          onClick: () => {
                            navigator.clipboard?.writeText(inviteLink(p)).catch(() => {})
                            toast('입장 링크를 복사했습니다')
                          },
                        },
                        { text: '메일 다시 보내기', disabled: phase === 'ended', onClick: () => toast(`${p.email}로 다시 보냈습니다 (목업)`) },
                        { text: '명단에서 빼기', danger: true, disabled: !!p.enteredAt, onClick: () => setRemoving(p) },
                      ]}
                    />
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
            removeParticipant(s.id, removing.id)
            setRemoving(null)
          }}
          body={`${removing.name}(${removing.email})의 입장 링크를 더 이상 쓸 수 없게 됩니다.`}
        />
      )}
    </div>
  )
}

// ── 실시간 현황 ──
const STATE_STYLE: Record<PState, { dot: string; text: string }> = {
  NOT_ENTERED: { dot: 'bg-text-faint', text: 'text-text-faint' },
  SOLVING: { dot: 'bg-brand', text: 'text-brand' },
  FOLLOWUP: { dot: 'bg-info', text: 'text-info' },
  SUBMITTED: { dot: 'bg-signal', text: 'text-signal' },
  DISCONNECTED: { dot: 'bg-alert', text: 'text-alert' },
}
function StateDot({ state }: { state: PState }) {
  const st = STATE_STYLE[state]
  return (
    <span className={cx('inline-flex items-center gap-1.5 text-[14px] font-medium', st.text)}>
      <i className={cx('size-2 rounded-full', st.dot, state === 'SOLVING' && 'rec-pulse')} aria-hidden />
      {PSTATE_LABEL[state]}
    </span>
  )
}

function Live({ s, now }: { s: Session; now: number }) {
  const [paused, setPaused] = useState(false)
  const [updatedAt, setUpdatedAt] = useState(() => new Date().toISOString())
  const [open, setOpen] = useState<string | null>(null)
  const seenRef = useRef<Set<string> | null>(null)
  const [fresh, setFresh] = useState<Set<string>>(new Set())

  // 5초마다 갱신 (목업: tickLive 로 응시자 활동을 흉내 낸다)
  useEffect(() => {
    if (paused) return
    const t = window.setInterval(() => {
      tickLive(s.id)
      setUpdatedAt(new Date().toISOString())
    }, 5000)
    return () => window.clearInterval(t)
  }, [paused, s.id])

  const feed = s.participants.flatMap((p) => p.events.map((e) => ({ p, e }))).sort((a, b) => Date.parse(b.e.at) - Date.parse(a.e.at))
  // 새로 생긴 이벤트는 2초 동안 강조한다
  useEffect(() => {
    const ids = new Set(feed.map((f) => f.e.id))
    if (seenRef.current) {
      const added = [...ids].filter((id) => !seenRef.current!.has(id))
      if (added.length) {
        const t1 = window.setTimeout(() => setFresh(new Set(added)), 0)
        const t2 = window.setTimeout(() => setFresh(new Set()), 2000)
        seenRef.current = ids
        return () => {
          window.clearTimeout(t1)
          window.clearTimeout(t2)
        }
      }
    }
    seenRef.current = ids
  }, [feed])

  const left = Date.parse(s.endsAt) - now
  const total = Date.parse(s.endsAt) - Date.parse(s.startsAt)
  const counts = (st: PState) => s.participants.filter((p) => p.state === st).length
  const opened = s.participants.find((p) => p.id === open)

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-wrap items-center gap-8 rounded-md border border-line bg-panel px-6 py-5 shadow-sm">
        <div>
          <p className="label">REMAINING</p>
          <p className={cx('tnum font-mono text-[56px] leading-[60px] font-semibold', left <= 3 * 60_000 ? 'text-alert' : left <= 10 * 60_000 ? 'text-caution' : 'text-text')}>{fmtLeft(left)}</p>
          <div className="mt-2 h-1 w-64 overflow-hidden rounded-full bg-panel-raised">
            <div className="bg-brand-gradient h-full" style={{ width: `${Math.min(100, ((total - left) / total) * 100)}%` }} />
          </div>
        </div>
        <ul className="flex flex-wrap gap-2">
          {(['NOT_ENTERED', 'SOLVING', 'FOLLOWUP', 'SUBMITTED', 'DISCONNECTED'] as PState[]).map((st) => (
            <li key={st} className="flex items-center gap-2 rounded-md border border-line px-3 py-2">
              <StateDot state={st} />
              <span className="tnum font-mono text-[18px] font-semibold text-text">{counts(st)}</span>
            </li>
          ))}
        </ul>
        <div className="ml-auto flex items-center gap-3">
          <span className="tnum font-mono text-[12px] text-text-faint">{fmtTime(updatedAt).slice(11)} 갱신</span>
          <Button size="sm" onClick={() => setPaused((v) => !v)} aria-pressed={paused}>
            {paused ? <Play size={14} aria-hidden /> : <Pause size={14} aria-hidden />}
            {paused ? '자동 갱신 켜기' : '일시 정지'}
          </Button>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="overflow-hidden rounded-md border border-line bg-panel shadow-sm">
          <header className="flex h-10 items-center border-b border-line px-4">
            <span className="label">PARTICIPANTS</span>
          </header>
          <table className="w-full text-[14px]">
            <thead>
              <tr className="h-9 border-b border-line text-left">
                {['이름', '상태', '입장', 'AI 질문', '감독 이벤트', '마지막 활동'].map((h, i) => (
                  <th key={h} className={cx('px-4 text-[13px] font-semibold text-text-muted', (i === 3 || i === 4) && 'text-right')}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.participants.map((p) => (
                <tr key={p.id} onClick={() => setOpen(p.id)} className="h-12 cursor-pointer border-b border-line last:border-0 hover:bg-panel-raised">
                  <td className="px-4 font-medium text-text">{p.name}</td>
                  <td className="px-4">
                    <StateDot state={p.state} />
                  </td>
                  <td className="tnum px-4 font-mono text-[13px] text-text-muted">{p.enteredAt ? fmtHm(p.enteredAt) : '—'}</td>
                  <td className="tnum px-4 text-right font-mono text-[13px] text-text">{p.aiTurns}</td>
                  <td className="px-4 text-right">
                    {p.events.length ? (
                      <span className="tnum rounded-sm bg-caution/12 px-1.5 py-0.5 font-mono text-[12px] font-semibold text-caution">{p.events.length}</span>
                    ) : (
                      <span className="text-text-faint">0</span>
                    )}
                  </td>
                  <td className={cx('tnum px-4 font-mono text-[13px]', p.state === 'DISCONNECTED' ? 'text-alert' : 'text-text-muted')}>{fmtAgo(p.lastActiveAt, now)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="flex max-h-[560px] flex-col overflow-hidden rounded-md border border-line bg-panel shadow-sm" aria-live="polite">
          <header className="flex h-10 shrink-0 items-center border-b border-line px-4">
            <span className="label">EVENT FEED</span>
            <span className="tnum ml-auto font-mono text-[12px] text-text-muted">{feed.length}건</span>
          </header>
          <ol className="min-h-0 flex-1 overflow-auto">
            {feed.length === 0 && <li className="py-12 text-center text-[14px] text-text-muted">아직 감독 이벤트가 없습니다.</li>}
            {feed.map(({ p, e }) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => setOpen(p.id)}
                  className={cx('flex w-full items-start gap-3 border-b border-line px-4 py-3 text-left transition-colors duration-500 hover:bg-panel-raised', fresh.has(e.id) && 'bg-brand-dim')}
                >
                  <i className={cx('mt-1.5 size-2 shrink-0', isCameraEvent(e.type) ? 'rounded-full bg-alert' : 'rotate-45 bg-caution')} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] text-text">
                      <b className="font-semibold">{p.name}</b> {EVENT_LABEL[e.type]}
                    </span>
                    <span className="tnum font-mono text-[12px] text-text-muted">
                      {fmtTime(e.at).slice(11)}
                      {e.confidence != null && ` │ 확신도 ${e.confidence.toFixed(2)}`}
                    </span>
                  </span>
                </button>
              </li>
            ))}
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
              <StateDot state={opened.state} />
              <button type="button" aria-label="닫기" onClick={() => setOpen(null)} className="ml-auto inline-flex size-8 items-center justify-center rounded-md text-text-muted hover:bg-panel-raised">
                <X size={18} aria-hidden />
              </button>
            </div>
            <div className="p-4">
              <ProctorPanel session={s} p={opened} />
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}

// ── 결과 ──
type SortKey = 'score' | 'name' | 'open'
function Results({ s }: { s: Session }) {
  const nav = useNavigate()
  const [sort, setSort] = useState<SortKey>('score')
  const rows = [...s.participants].sort((a, b) =>
    sort === 'name' ? a.name.localeCompare(b.name) : sort === 'open' ? unreviewed(b) - unreviewed(a) : (b.score ?? -1) - (a.score ?? -1),
  )
  const exportCsv = () => {
    const head = ['이름', '이메일', '상태', '총점', ...ITEM_KEYS.map((k) => k[1]), '감독 이벤트', '미확인', '부정 의심']
    const lines = rows.map((p) =>
      [p.name, p.email, PSTATE_LABEL[p.state], p.score ?? '', ...ITEM_KEYS.map((k) => p.items?.[k[0]] ?? ''), p.events.length, unreviewed(p), suspects(p)].join(','),
    )
    const blob = new Blob(['﻿' + [head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${s.title}_결과.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <section className="overflow-hidden rounded-md border border-line bg-panel shadow-sm">
      <header className="flex h-12 items-center gap-3 border-b border-line px-4">
        <span className="label">RESULTS</span>
        <label className="ml-auto flex items-center gap-1.5 text-[13px] text-text-muted">
          <ArrowDownUp size={14} aria-hidden />
          <span className="sr-only">정렬</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="h-8 rounded-md border border-line-strong bg-panel px-2 text-[13px] text-text outline-none focus:border-brand">
            <option value="score">총점 높은 순</option>
            <option value="name">이름 순</option>
            <option value="open">미확인 이벤트 많은 순</option>
          </select>
        </label>
        <Button size="sm" onClick={exportCsv}>
          <Download size={14} aria-hidden /> 결과 내보내기
        </Button>
      </header>
      <table className="w-full text-[14px]">
        <thead>
          <tr className="h-9 border-b border-line text-left">
            {['이름', '상태', '총점', '역량', '감독 이벤트', '부정 의심', ''].map((h, i) => (
              <th key={i} className="px-4 text-[13px] font-semibold text-text-muted">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const done = p.score != null
            return (
              <tr
                key={p.id}
                onClick={() => done && nav(`/console/sessions/${s.id}/attempts/${p.id}`)}
                className={cx('h-14 border-b border-line last:border-0', done ? 'cursor-pointer hover:bg-panel-raised' : 'text-text-faint')}
              >
                <td className="px-4">
                  <p className="font-medium text-text">{p.name}</p>
                  <p className="font-mono text-[12px] text-text-muted">{p.email}</p>
                </td>
                <td className="px-4 text-[13px]">{done ? '채점 완료' : PSTATE_LABEL[p.state]}</td>
                <td className="px-4">{done ? <ScoreChip score={p.score!} /> : '—'}</td>
                <td className="px-4">
                  {p.items ? (
                    <span className="flex items-end gap-1" role="img" aria-label={ITEM_KEYS.map((k) => `${k[1]} ${p.items![k[0]]}/${k[2]}`).join(', ')}>
                      {ITEM_KEYS.map(([key, name, max, color]) => (
                        <span key={key} title={`${name} ${p.items![key]} / ${max}`} className="flex h-7 w-6 items-end overflow-hidden rounded-[3px] bg-panel-raised">
                          <span className="w-full" style={{ height: `${(p.items![key] / max) * 100}%`, background: color }} />
                        </span>
                      ))}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="tnum px-4 font-mono text-[13px]">
                  {p.events.length === 0 ? (
                    <span className="text-text-faint">0</span>
                  ) : (
                    <span className={unreviewed(p) ? 'font-semibold text-caution' : 'text-text-muted'}>
                      미확인 {unreviewed(p)} / {p.events.length}
                    </span>
                  )}
                </td>
                <td className="tnum px-4 font-mono text-[13px]">{suspects(p) ? <span className="font-semibold text-alert">{suspects(p)}</span> : <span className="text-text-faint">0</span>}</td>
                <td className="w-24 px-4 text-right">
                  {done && <span className="text-[13px] font-semibold text-brand">리포트</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}
