import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Bot, ChevronDown, ChevronRight, FileText, Folder, Hammer, Loader2, Lock, Play, Save, X } from 'lucide-react'
import { CodeEditor } from '../components/CodeEditor'
import { SendKey } from '../components/SendKey'
import { Button, cx, IconButton, Logo, ModeBadge, StatusDot } from '../components/ui'
import { ActivityRail, type SidePanel } from '../components/ActivityRail'
import { api, ApiError, type AttemptView, type CompileDiagnostic, type EditProposal, type Task, type Turn } from '../api'
import { EditCard, EditModal, type EditAction } from '../components/EditProposal'
import { splitReply } from '../lib/edits'

// 실제 응시 화면: 백엔드 API 에 연결된 버전. 레이아웃은 DESIGN.md §7-3 응시 화면을 따른다.

function fmt(sec: number) {
  const s = Math.max(0, sec)
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0')).join(':')
}

const readOnlyPath = (p: string) => p.startsWith('logs/') || p.startsWith('자료/')
const fileName = (p: string) => p.split('/').pop() ?? p

// ── 진입: /exam/new?track=dev|biz → 응시 생성 후 이동 ─────
export function NewExam() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    const track = params.get('track') === 'biz' ? 'biz' : 'dev'
    api
      .start(api.taskIdFor(track))
      .then(({ attemptId }) => navigate(`/exam/${attemptId}`, { replace: true }))
      .catch((e: ApiError) => setError(e.message))
  }, [params, navigate])
  return <CenterMessage error={error} text="응시를 준비하고 있습니다" />
}

function CenterMessage({ text, error }: { text: string; error?: string | null }) {
  return (
    <div className="flex h-full items-center justify-center bg-bg">
      {error ? (
        <div className="max-w-[520px] rounded-md border border-alert/40 bg-panel p-6">
          <span className="label text-alert">ERROR</span>
          <p className="mt-2 text-body text-text">{error}</p>
        </div>
      ) : (
        <span className="flex items-center gap-2 text-body text-text-muted">
          <Loader2 size={18} className="animate-spin" aria-hidden /> {text}
        </span>
      )}
    </div>
  )
}

// ── 파일 트리 (경로 기반) ─────────────────
type TreeNode = { name: string; path: string; children?: TreeNode[] }
function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', children: [] }
  for (const p of paths) {
    const parts = p.split('/')
    let cur = root
    parts.forEach((part, i) => {
      const path = parts.slice(0, i + 1).join('/')
      const leaf = i === parts.length - 1
      let next = cur.children!.find((c) => c.name === part)
      if (!next) {
        next = { name: part, path, children: leaf ? undefined : [] }
        cur.children!.push(next)
      }
      cur = next
    })
  }
  const sort = (n: TreeNode[]): TreeNode[] =>
    n
      .sort((a, b) => (a.children ? 0 : 1) - (b.children ? 0 : 1) || a.name.localeCompare(b.name))
      .map((c) => ({ ...c, children: c.children && sort(c.children) }))
  return sort(root.children!)
}

function PathTree({ nodes, depth = 0, active, onOpen }: { nodes: TreeNode[]; depth?: number; active: string; onOpen: (p: string) => void }) {
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  return (
    <ul>
      {nodes.map((n) =>
        n.children ? (
          <li key={n.path}>
            <button
              type="button"
              onClick={() => setClosed({ ...closed, [n.path]: !closed[n.path] })}
              aria-expanded={!closed[n.path]}
              className="flex h-7 w-full items-center gap-1.5 pr-2 text-[14px] text-text-muted hover:bg-panel-raised hover:text-text"
              style={{ paddingLeft: 8 + depth * 14 }}
            >
              {closed[n.path] ? <ChevronRight size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
              <Folder size={16} strokeWidth={1.75} aria-hidden />
              <span className="font-mono">{n.name}</span>
            </button>
            {!closed[n.path] && <PathTree nodes={n.children} depth={depth + 1} active={active} onOpen={onOpen} />}
          </li>
        ) : (
          <li key={n.path}>
            <button
              type="button"
              onClick={() => onOpen(n.path)}
              className={cx(
                'relative flex h-7 w-full items-center gap-1.5 pr-2 text-[14px]',
                active === n.path ? 'bg-panel-raised text-text' : 'text-text-muted hover:bg-panel-raised hover:text-text',
              )}
              style={{ paddingLeft: 22 + depth * 14 }}
            >
              {active === n.path && <span className="absolute inset-y-0 left-0 w-0.5 bg-signal" aria-hidden />}
              <FileText size={16} strokeWidth={1.75} aria-hidden />
              <span className="truncate font-mono">{n.name}</span>
            </button>
          </li>
        ),
      )}
    </ul>
  )
}

// ── AI 채팅 ─────────────────────────────
function ChatPanel({
  turns,
  disabled,
  busy,
  error,
  onSend,
  model,
  maxChars,
  editBusy,
  onEdit,
  onViewEdit,
}: {
  turns: Turn[]
  disabled: boolean
  busy: boolean
  error: string | null
  onSend: (t: string) => Promise<boolean>
  model: string
  maxChars: number
  editBusy: boolean
  onEdit: (turn: number, e: EditProposal, a: EditAction) => void
  onViewEdit: (turn: number, e: EditProposal) => void
}) {
  const [draft, setDraft] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const count = draft.length
  const over = count > maxChars
  const listRef = useRef<HTMLOListElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  // 입력이 길어지면 입력창이 위로 늘어난다. 최대 높이(화면의 40%, 최대 360px)를 넘으면 안에서 스크롤한다.
  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    const min = 96
    const max = Math.min(360, Math.round(window.innerHeight * 0.4))
    el.style.height = 'auto'
    const want = Math.max(min, el.scrollHeight)
    el.style.height = `${Math.min(want, max)}px`
    el.style.overflowY = want > max ? 'auto' : 'hidden'
  }, [draft])
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [turns.length, busy])
  const send = async () => {
    const text = draft.trim()
    if (!text || busy || disabled || over) return
    if (await onSend(text)) setDraft('')
  }
  return (
    <section className={cx('flex h-full min-h-0 flex-col border-l border-line bg-panel', disabled && 'opacity-50')}>
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-4">
        <Bot size={18} strokeWidth={1.75} className="text-info" aria-hidden />
        <span className="label">AI ASSISTANT</span>
        <span className="ml-auto font-mono text-[12px] text-text-faint">{turns.length} TURNS</span>
      </header>
      <ol ref={listRef} className="min-h-0 flex-1 space-y-4 overflow-auto p-4" aria-live="polite">
        {turns.length === 0 && !busy && (
          <li className="text-[14px] leading-6 text-text-muted">AI는 이 대화창에 붙여 넣은 내용만 볼 수 있습니다. 필요한 코드, 로그, 자료를 함께 전달하세요.</li>
        )}
        {turns.map((m) =>
          m.role === 'user' ? (
            <li key={m.turn} className="ml-8 flex flex-col items-end gap-1">
              <span className="flex gap-2 font-mono text-[12px] text-text-faint">
                <span>#T{String(m.turn).padStart(2, '0')}</span>
                <span>{m.time}</span>
              </span>
              <p className="rounded-md bg-panel-raised px-3 py-2 text-[15px] leading-6 whitespace-pre-wrap">{m.text}</p>
            </li>
          ) : (
            <li key={m.turn} className="mr-4 flex flex-col gap-1 border-l-2 border-info pl-3">
              <span className="flex items-center gap-2 font-mono text-[12px] text-text-faint">
                <Bot size={14} className="text-info" aria-hidden />
                <span>#T{String(m.turn).padStart(2, '0')}</span>
                <span>{m.time}</span>
              </span>
              {splitReply(m.text).map((seg, i) => {
                if (seg.kind === 'text')
                  return (
                    <p key={i} className="text-[15px] leading-6 whitespace-pre-wrap text-text">
                      {seg.text}
                    </p>
                  )
                const e = m.edits?.find((x) => x.index === seg.index)
                return e ? (
                  <EditCard
                    key={i}
                    edit={e}
                    busy={editBusy}
                    disabled={disabled}
                    onAction={(a) => onEdit(m.turn, e, a)}
                    onView={() => onViewEdit(m.turn, e)}
                  />
                ) : (
                  <p key={i} className="font-mono text-[12px] text-text-faint">
                    (형식이 맞지 않아 적용할 수 없는 수정 제안: {seg.path})
                  </p>
                )
              })}
            </li>
          ),
        )}
        {busy && (
          <li className="flex items-center gap-2 border-l-2 border-info pl-3 text-[14px] text-text-muted">
            <Loader2 size={16} className="animate-spin text-info" aria-hidden /> AI가 답변을 작성하고 있습니다
          </li>
        )}
      </ol>
      {error && <p className="shrink-0 border-t border-alert/40 bg-alert/10 px-4 py-2 text-[14px] text-alert">{error}</p>}
      <p id="chat-limit" className="sr-only">
        질문은 한 번에 {maxChars}자까지 보낼 수 있습니다.
      </p>
      <div className="shrink-0 border-t border-line p-3">
        <label htmlFor="chat-input" className="sr-only">
          AI에게 질문
        </label>
        <div className={cx('rounded-md border bg-panel-raised', over ? 'border-alert' : 'border-line-strong focus-within:border-signal')}>
          {notice && (
            <p role="status" className="truncate px-3 pt-1.5 text-[12px] text-caution">
              {notice}
            </p>
          )}
          <textarea
            ref={inputRef}
            id="chat-input"
            rows={4}
            disabled={disabled}
            value={draft}
            maxLength={maxChars}
            onChange={(e) => {
              setDraft(e.target.value)
              setNotice(null)
            }}
            onPaste={(e) => {
              // 붙여 넣기가 한도를 넘으면 들어갈 만큼만 넣고, 잘린 글자 수를 알려 준다
              const el = e.currentTarget
              const paste = e.clipboardData.getData('text')
              const { selectionStart: st, selectionEnd: en, value } = el
              const room = maxChars - (value.length - (en - st))
              if (paste.length <= room) return
              e.preventDefault()
              const part = paste.slice(0, Math.max(0, room))
              setDraft(value.slice(0, st) + part + value.slice(en))
              setNotice(`붙여 넣은 내용 중 ${(paste.length - part.length).toLocaleString()}자가 잘렸습니다 (최대 ${maxChars.toLocaleString()}자)`)
              requestAnimationFrame(() => el.setSelectionRange(st + part.length, st + part.length))
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault()
                void send()
              }
            }}
            placeholder="맥락을 충분히 담아 질문하세요"
            aria-describedby="chat-limit"
            className="block w-full resize-none bg-transparent px-3 pt-2 font-sans text-[15px] leading-6 text-text outline-none placeholder:text-text-faint"
          />
          <div className="flex items-center gap-2 px-2 pb-2">
            <span className="label pl-1 text-text-faint">CTRL + ENTER</span>
            <span className="ml-auto min-w-0 truncate font-mono text-[12px] text-text-faint" title="이 시험에서 쓰는 AI 모델">
              {model}
            </span>
            <span
              className={cx(
                'tnum ml-1 mr-1 shrink-0 font-mono text-[12px]',
                count >= maxChars ? 'text-alert' : count >= maxChars * 0.9 ? 'text-caution' : 'text-text-faint',
              )}
              aria-live="polite"
              title={`질문은 한 번에 ${maxChars.toLocaleString()}자까지`}
            >
              {over && '초과 '}
              {count.toLocaleString()}/{maxChars.toLocaleString()}
            </span>
            <SendKey ready={draft.trim().length > 0} disabled={disabled || busy || over} onClick={() => void send()} />
          </div>
        </div>
      </div>
    </section>
  )
}

// ── 후속 질문 ───────────────────────────
// 답변 상태는 부모가 가진다(아래 참고 패널에서 "#T03" 같은 턴 번호를 답변에 넣을 수 있게).
function FollowUp({
  questions,
  i,
  onIndex,
  answers,
  onAnswers,
  busy,
  error,
  onDone,
}: {
  questions: string[]
  i: number
  onIndex: (i: number) => void
  answers: string[]
  onAnswers: (a: string[]) => void
  busy: boolean
  error: string | null
  onDone: (a: string[]) => void
}) {
  const last = i === questions.length - 1
  return (
    <section className="flex h-full min-h-0 flex-col bg-panel">
      <header className="flex h-10 shrink-0 items-center gap-3 border-b border-line px-4">
        <span className="label">FOLLOW-UP</span>
        <span className="text-[16px] font-semibold">후속 질문</span>
        <span className="tnum ml-auto font-mono text-[13px] text-text-muted">
          {i + 1} / {questions.length}
        </span>
      </header>
      <div className="flex gap-1 px-4 pt-3" aria-hidden>
        {questions.map((_, j) => (
          <span key={j} className={cx('h-0.5 flex-1 rounded-full', j <= i ? 'bg-signal' : 'bg-line')} />
        ))}
      </div>
      <div key={i} className="fade-in flex min-h-0 flex-1 flex-col px-6 pt-4 pb-4">
        <span className="label">QUESTION {String(i + 1).padStart(2, '0')}</span>
        <h2 className="mt-1.5 text-[18px] leading-7 font-semibold">{questions[i]}</h2>
        <p className="mt-1 text-[14px] text-text-muted">위 [내 질문] 탭과 파일 탭에서 내 질문과 제출한 파일을 볼 수 있습니다. [답변에 넣기]로 턴 번호를 근거로 붙이세요.</p>
        <label htmlFor="answer" className="sr-only">
          답변
        </label>
        <textarea
          id="answer"
          value={answers[i]}
          onChange={(e) => onAnswers(answers.map((a, j) => (j === i ? e.target.value : a)))}
          className="mt-3 min-h-0 flex-1 resize-none rounded-md border border-line-strong bg-panel-raised p-4 text-body text-text outline-none focus:border-signal"
          placeholder="답변을 입력하세요"
        />
        {error && <p className="mt-3 text-[14px] text-alert">{error}</p>}
        <div className="mt-3 flex items-center">
          <span className="tnum font-mono text-[13px] text-text-faint">{answers[i].length} chars</span>
          {i > 0 && (
            <Button variant="ghost" className="ml-auto" onClick={() => onIndex(i - 1)}>
              이전
            </Button>
          )}
          <Button variant="primary" className={i > 0 ? 'ml-2' : 'ml-auto'} disabled={busy} onClick={() => (last ? onDone(answers) : onIndex(i + 1))}>
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
            {last ? '완료하고 채점하기' : '다음'}
          </Button>
        </div>
      </div>
    </section>
  )
}

/** 후속 질문 단계: 응시자가 AI에게 보낸 질문만 모아 보여 준다. [답변에 넣기]로 턴 번호를 지금 답변에 붙인다. */
function PromptList({ turns, onInsert }: { turns: Turn[]; onInsert: (ref: string) => void }) {
  const prompts = turns.filter((t) => t.role === 'user')
  if (prompts.length === 0) return <p className="p-4 text-[14px] text-text-muted">AI에게 보낸 질문이 없습니다.</p>
  return (
    <ol className="h-full divide-y divide-line overflow-auto bg-panel-sunken">
      {prompts.map((t) => {
        const ref = `#T${String(t.turn).padStart(2, '0')}`
        return (
          <li key={t.turn} className="px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="rounded-sm bg-info/12 px-1.5 font-mono text-[12px] text-info">{ref}</span>
              <span className="tnum font-mono text-[12px] text-text-faint">{t.time}</span>
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => onInsert(ref)}>
                답변에 넣기
              </Button>
            </div>
            <p className="mt-1.5 text-[14px] leading-6 whitespace-pre-wrap text-text">{t.text}</p>
          </li>
        )
      })}
    </ol>
  )
}

function ConfirmModal({ busy, onCancel, onConfirm }: { busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fade-in fixed inset-0 z-50 flex items-center justify-center bg-bg/70" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="w-[440px] rounded-lg border border-line bg-panel shadow-modal">
        <header className="flex h-10 items-center border-b border-line px-4">
          <span className="label">SUBMIT</span>
          <IconButton label="닫기" className="ml-auto" onClick={onCancel}>
            <X size={18} aria-hidden />
          </IconButton>
        </header>
        <div className="p-6">
          <h2 id="confirm-title" className="text-h2 font-semibold">
            풀이를 제출할까요?
          </h2>
          <p className="mt-2 text-[15px] leading-6 text-text-muted">제출하면 파일과 AI 대화가 잠기고, 후속 질문 3개가 이어집니다.</p>
        </div>
        <footer className="flex justify-end gap-2 border-t border-line px-6 py-4">
          <Button variant="ghost" onClick={onCancel}>
            계속 풀기
          </Button>
          <Button variant="primary" disabled={busy} onClick={onConfirm}>
            제출
          </Button>
        </footer>
      </div>
    </div>
  )
}

function DocChecks({ task, doc }: { task: Task & { requiredHeadings?: string[] }; doc: string }) {
  const heads = task.requiredHeadings ?? []
  return (
    <ul className="space-y-1 font-sans text-[14px]">
      {heads.map((h) => {
        const at = doc.indexOf(h)
        const end = at < 0 ? -1 : doc.indexOf('\n', at)
        const next = end < 0 ? -1 : doc.indexOf('\n#', end)
        const body = end < 0 ? '' : doc.slice(end, next < 0 ? undefined : next).trim()
        const ok = at >= 0 && body.length > 0
        return (
          <li key={h}>
            <StatusDot status={ok ? 'ok' : 'check'} label={`${h.replace(/^#+\s*/, '')} ${ok ? '작성됨' : '비어 있음'}`} />
          </li>
        )
      })}
      <li className="tnum pt-2 font-mono text-[13px] text-text-faint">{doc.length} chars</li>
    </ul>
  )
}

// ── 응시 화면 ───────────────────────────
export default function RealExam() {
  const { sessionId = '' } = useParams()
  const navigate = useNavigate()
  const [view, setView] = useState<AttemptView | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [contents, setContents] = useState<Record<string, string>>({})
  const [dirty, setDirty] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState<string[]>([])
  const [active, setActive] = useState('')
  const [side, setSide] = useState<SidePanel>('task')
  const [showOutput, setShowOutput] = useState(true)
  const [showChat, setShowChat] = useState(true)
  const [stage, setStage] = useState<'solve' | 'followup'>('solve')
  const [elapsed, setElapsed] = useState(0)
  const [turns, setTurns] = useState<Turn[]>([])
  const [chatBusy, setChatBusy] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const [editBusy, setEditBusy] = useState(false)
  const [viewing, setViewing] = useState<{ turn: number; index: number } | null>(null)
  // 빌드(컴파일만) 또는 테스트 실행 결과. 마지막으로 누른 쪽을 보여 준다.
  const [run, setRun] = useState<{
    kind: 'build' | 'test'
    compiled: boolean
    lines: string[]
    passed?: number
    failed?: number
    diagnostics: CompileDiagnostic[]
  } | null>(null)
  const [busyTask, setBusyTask] = useState<'build' | 'test' | null>(null)
  const running = busyTask !== null
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [fuIndex, setFuIndex] = useState(0)
  const [fuAnswers, setFuAnswers] = useState<string[] | null>(null)
  const [refTab, setRefTab] = useState<'prompts' | 'file'>('prompts')

  // 처음 불러오기
  useEffect(() => {
    let alive = true
    api
      .attempt(sessionId)
      .then(async (v) => {
        if (!alive) return
        if (v.attempt.status === 'SCORING' || v.attempt.status === 'DONE' || v.attempt.status === 'ERROR') {
          navigate(`/report/${sessionId}`, { replace: true })
          return
        }
        setView(v)
        setTurns(v.turns)
        setElapsed(v.elapsedSeconds)
        setStage(v.attempt.status === 'FOLLOWUP' ? 'followup' : 'solve')
        const first = v.files.includes(v.task.openFile) ? v.task.openFile : v.files[0]
        const c = await api.file(sessionId, first)
        if (!alive) return
        setContents({ [first]: c.content })
        setOpen([first])
        setActive(first)
      })
      .catch((e: ApiError) => setLoadError(e.message))
    return () => {
      alive = false
    }
  }, [sessionId, navigate])

  // 타이머
  useEffect(() => {
    if (!view || stage !== 'solve') return
    const id = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [view, stage])

  const flash = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2000)
  }

  const saveFiles = useCallback(
    async (paths?: string[]) => {
      const targets = (paths ?? [...dirty]).filter((p) => dirty.has(p))
      for (const p of targets) {
        await api.save(sessionId, p, contents[p] ?? '')
      }
      if (targets.length) {
        setDirty((d) => {
          const n = new Set(d)
          targets.forEach((p) => n.delete(p))
          return n
        })
      }
      return targets.length
    },
    [dirty, contents, sessionId],
  )

  // 입력이 멈추고 2초 뒤 자동 저장
  useEffect(() => {
    if (!dirty.size || stage !== 'solve') return
    const id = setTimeout(() => {
      saveFiles().catch((e: ApiError) => setActionError(e.message))
    }, 2000)
    return () => clearTimeout(id)
  }, [dirty, contents, stage, saveFiles])

  // Ctrl+S
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        saveFiles()
          .then((n) => flash(n ? '저장했습니다' : '변경 사항이 없습니다'))
          .catch((er: ApiError) => setActionError(er.message))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [saveFiles])

  const tree = useMemo(() => buildTree(view?.files ?? []), [view])

  if (loadError) return <CenterMessage text="" error={loadError} />
  if (!view) return <CenterMessage text="응시 화면을 불러오고 있습니다" />

  const task = view.task as Task & { requiredHeadings?: string[] }
  const dev = task.type === 'dev'
  const left = task.minutes * 60 - elapsed
  const locked = stage === 'followup'
  const fuList = fuAnswers ?? task.followUps.map(() => '')
  const showPrompts = locked && refTab === 'prompts'
  const tone = locked ? 'text-text' : left <= 180 ? 'text-alert' : left <= 600 ? 'text-caution' : 'text-text'
  const isDoc = !dev && active === task.editableFile

  const openFile = async (p: string) => {
    if (!(p in contents)) {
      try {
        const c = await api.file(sessionId, p)
        setContents((m) => ({ ...m, [p]: c.content }))
      } catch (e) {
        setActionError((e as ApiError).message)
        return
      }
    }
    if (!open.includes(p)) setOpen([...open, p])
    setActive(p)
  }
  const closeFile = (p: string) => {
    void saveFiles([p])
    const next = open.filter((f) => f !== p)
    setOpen(next)
    if (active === p) setActive(next[next.length - 1] ?? '')
  }
  const edit = (value: string) => {
    setContents((m) => ({ ...m, [active]: value }))
    setDirty((d) => new Set(d).add(active))
  }

  const doRun = async (kind: 'build' | 'test') => {
    setBusyTask(kind)
    setActionError(null)
    setShowOutput(true)
    try {
      await saveFiles()
      if (kind === 'build') {
        const r = await api.build(sessionId)
        setRun({ kind, compiled: r.compiled, lines: r.lines, diagnostics: r.diagnostics })
      } else {
        const r = await api.run(sessionId)
        setRun({ kind, compiled: r.compiled, lines: r.lines, passed: r.passed, failed: r.failed, diagnostics: r.diagnostics ?? [] })
      }
    } catch (e) {
      setActionError((e as ApiError).message)
    } finally {
      setBusyTask(null)
    }
  }
  const activeDiagnostics = (run?.diagnostics ?? [])
    .filter((d) => d.file === active)
    .map((d) => ({ line: d.line, column: d.column, message: d.message, severity: d.severity }))

  const sendChat = async (text: string) => {
    setChatBusy(true)
    setChatError(null)
    try {
      const added = await api.chat(sessionId, text)
      setTurns((t) => [...t, ...added])
      return true
    } catch (e) {
      setChatError((e as ApiError).message)
      return false
    } finally {
      setChatBusy(false)
    }
  }

  /** AI 수정 제안 적용/거절. 적용하면 서버가 파일을 고치고, 그 파일을 편집기에 열어 보여 준다. */
  const decideEdit = async (turn: number, e: EditProposal, action: EditAction) => {
    setEditBusy(true)
    setChatError(null)
    try {
      if (action === 'apply' && dirty.has(e.path)) await saveFiles([e.path])
      const r = await api.decideEdit(sessionId, turn, e.index, action)
      const v = await api.attempt(sessionId)
      setTurns(v.turns)
      setView((old) => (old ? { ...old, files: v.files } : v))
      if (r.status === 'APPLIED' && r.content != null) {
        const content = r.content
        setContents((m) => ({ ...m, [r.path]: content }))
        setDirty((d) => {
          const n = new Set(d)
          n.delete(r.path)
          return n
        })
        setOpen((o) => (o.includes(r.path) ? o : [...o, r.path]))
        setActive(r.path)
        setViewing(null)
        flash(`적용했습니다: ${r.path}`)
      } else {
        setViewing(null)
      }
    } catch (er) {
      setChatError((er as ApiError).message)
    } finally {
      setEditBusy(false)
    }
  }
  const viewingEdit = viewing ? turns.find((t) => t.turn === viewing.turn)?.edits?.find((x) => x.index === viewing.index) : undefined

  const doSubmit = async () => {
    setBusy(true)
    setActionError(null)
    try {
      await saveFiles()
      await api.submit(sessionId)
      setConfirm(false)
      setStage('followup')
    } catch (e) {
      setActionError((e as ApiError).message)
      setConfirm(false)
    } finally {
      setBusy(false)
    }
  }

  const doFollowUps = async (answers: string[]) => {
    setBusy(true)
    setActionError(null)
    try {
      await api.followUps(sessionId, answers)
      navigate(`/report/${sessionId}`)
    } catch (e) {
      setActionError((e as ApiError).message)
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col bg-bg">
      {/* 6.7 Status Bar */}
      <header className="grid h-11 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-line bg-panel px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Logo />
          <span className="h-4 w-px bg-line" aria-hidden />
          <span className="truncate text-[15px] font-semibold">{task.title}</span>
          <ModeBadge mode="self" />
        </div>
        <div className="flex items-baseline gap-2 px-2" aria-label={`남은 시간 ${fmt(left)}`}>
          <span className="label">{locked ? 'FOLLOW-UP' : 'REMAINING'}</span>
          <span className={cx('tnum font-mono text-[21px] leading-7 font-semibold transition-colors duration-[180ms]', tone)} role="timer">
            {left < 0 && !locked ? '-' : ''}
            {fmt(Math.abs(left))}
          </span>
        </div>
        <div className="flex items-center justify-end gap-3">
          <span className="font-mono text-[12px] text-text-faint">{view.attempt.model}</span>
          {!locked && (
            <Button variant="primary" size="sm" onClick={() => setConfirm(true)}>
              제출
            </Button>
          )}
        </div>
      </header>

      {actionError && (
        <div role="alert" className="flex shrink-0 items-center gap-3 border-b border-alert/40 bg-alert/10 px-4 py-2 text-[14px] text-alert">
          {actionError}
          <IconButton label="닫기" className="ml-auto" onClick={() => setActionError(null)}>
            <X size={16} aria-hidden />
          </IconButton>
        </div>
      )}

      <div
        className="grid min-h-0 flex-1"
        style={{ gridTemplateColumns: `48px ${side ? '280px ' : ''}minmax(0,1fr)${showChat ? ' 380px' : ''}` }}
      >
        <ActivityRail
          side={side}
          onSide={setSide}
          showOutput={showOutput}
          onToggleOutput={() => setShowOutput((v) => !v)}
          outputLabel={dev ? '실행 결과' : '체크리스트'}
          showChat={showChat}
          onToggleChat={() => setShowChat((v) => !v)}
        />
        {/* 사이드 패널: 과제 / 파일 */}
        {side && (
        <aside className="flex min-h-0 flex-col border-r border-line bg-panel">
          <header className="flex h-10 shrink-0 items-center border-b border-line px-4">
            <span className="label">{side === 'task' ? 'TASK' : 'EXPLORER'}</span>
          </header>
          {side === 'task' ? (
            <div className="fade-in min-h-0 flex-1 overflow-auto p-4">
              <span className="label">{dev ? 'DEV' : 'BIZ'} TASK</span>
              <h2 className="mt-1 text-h3 font-semibold">{task.title}</h2>
              {task.description.map((d) => (
                <p key={d} className="mt-3 text-[15px] leading-6 text-text">
                  {d}
                </p>
              ))}
              <h3 className="label mt-6">REQUIREMENTS</h3>
              <ol className="mt-2 space-y-2">
                {task.requirements.map((r, i) => (
                  <li key={r} className="flex gap-2 text-[15px] leading-6">
                    <span className="font-mono text-[13px] leading-6 text-text-faint">{String(i + 1).padStart(2, '0')}</span>
                    {r}
                  </li>
                ))}
              </ol>
              <h3 className="label mt-6">NOTES</h3>
              <ul className="mt-2 space-y-2">
                {task.notes.map((n) => (
                  <li key={n} className="border-l-2 border-caution pl-3 text-[14px] leading-5 text-text-muted">
                    {n}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <nav className="fade-in min-h-0 flex-1 overflow-auto py-2" aria-label="파일 탐색기">
              <PathTree
                nodes={tree}
                active={active}
                onOpen={(p) => {
                  void openFile(p)
                  if (locked) setRefTab('file')
                }}
              />
            </nav>
          )}
        </aside>
        )}

        {/* 가운데: 에디터 + 출력 | 후속 질문 */}
        <div className="flex min-h-0 min-w-0 flex-col">
          <>
              <div className="flex h-10 shrink-0 items-stretch border-b border-line bg-panel">
                <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto" role="tablist" aria-label="열린 파일">
                  {locked && (
                    <button
                      role="tab"
                      type="button"
                      aria-selected={showPrompts}
                      onClick={() => setRefTab('prompts')}
                      className={cx(
                        'relative flex shrink-0 items-center border-r border-line px-3 text-[14px]',
                        showPrompts ? 'bg-panel-sunken text-text' : 'text-text-muted hover:text-text',
                      )}
                    >
                      {showPrompts && <span className="absolute inset-x-0 top-0 h-0.5 bg-signal" aria-hidden />}
                      내 질문 <span className="tnum ml-1.5 font-mono text-[12px] text-text-faint">{turns.filter((t) => t.role === 'user').length}</span>
                    </button>
                  )}
                  {open.map((f) => (
                    <div
                      key={f}
                      className={cx(
                        'group relative flex shrink-0 items-center gap-1 border-r border-line pr-1 pl-3',
                        active === f && !showPrompts ? 'bg-panel-sunken text-text' : 'text-text-muted hover:text-text',
                        locked && 'pr-3',
                      )}
                    >
                      {active === f && !showPrompts && <span className="absolute inset-x-0 top-0 h-0.5 bg-signal" aria-hidden />}
                      <button
                        role="tab"
                        aria-selected={active === f && !showPrompts}
                        type="button"
                        onClick={() => {
                          setActive(f)
                          setRefTab('file')
                        }}
                        className="font-mono text-[14px]"
                        title={f}
                      >
                        {fileName(f)}
                        {dirty.has(f) && <span className="ml-1 text-caution">●</span>}
                      </button>
                      {!locked && <button
                        type="button"
                        aria-label={`${fileName(f)} 닫기`}
                        onClick={() => closeFile(f)}
                        className="inline-flex size-6 items-center justify-center rounded-sm text-text-faint hover:bg-panel-raised hover:text-text"
                      >
                        <X size={14} aria-hidden />
                      </button>}
                    </div>
                  ))}
                </div>
                {(locked || readOnlyPath(active)) && (
                  <span className="flex items-center gap-1 px-3 font-mono text-[12px] text-text-faint">
                    <Lock size={12} aria-hidden /> READ ONLY
                  </span>
                )}
              </div>

              <div className="min-h-0 flex-1">
                {showPrompts ? (
                  <PromptList
                    turns={turns}
                    onInsert={(ref) =>
                      setFuAnswers(fuList.map((a, j) => (j === fuIndex ? (a && !/\s$/.test(a) ? a + ' ' : a) + ref : a)))
                    }
                  />
                ) : active && !isDoc ? (
                  <CodeEditor
                    path={active}
                    value={contents[active] ?? ''}
                    readOnly={locked || readOnlyPath(active)}
                    onChange={edit}
                    diagnostics={activeDiagnostics}
                  />
                ) : active ? (
                  <textarea
                    aria-label={`${active} 편집기`}
                    value={contents[active] ?? ''}
                    readOnly={locked || readOnlyPath(active)}
                    spellCheck={false}
                    onChange={(e) => edit(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Tab' && !readOnlyPath(active)) {
                        e.preventDefault()
                        const el = e.currentTarget
                        const { selectionStart: s, selectionEnd: en, value } = el
                        edit(value.slice(0, s) + '    ' + value.slice(en))
                        requestAnimationFrame(() => el.setSelectionRange(s + 4, s + 4))
                      }
                    }}
                    className={cx(
                      'block h-full w-full resize-none bg-panel-sunken text-text outline-none',
                      isDoc ? 'px-12 py-8 font-sans text-body' : 'px-4 py-3 font-mono text-code whitespace-pre',
                      readOnlyPath(active) && 'text-text-muted',
                    )}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center bg-panel-sunken text-[15px] text-text-muted">파일 탐색기에서 파일을 여세요</div>
                )}
              </div>

              {locked ? (
                <div className="h-[48%] min-h-[300px] shrink-0 border-t border-line">
                  <FollowUp
                    questions={task.followUps}
                    i={fuIndex}
                    onIndex={setFuIndex}
                    answers={fuList}
                    onAnswers={setFuAnswers}
                    busy={busy}
                    error={actionError}
                    onDone={(a) => void doFollowUps(a)}
                  />
                </div>
              ) : (
              <section className={cx('flex shrink-0 flex-col border-t border-line bg-panel', showOutput ? 'h-60' : 'h-10')}>
                <header className={cx('flex h-10 shrink-0 items-center gap-3 px-4', showOutput && 'border-b border-line')}>
                  <span className="label">{dev ? 'OUTPUT' : 'CHECK'}</span>
                  {dev && run && (
                    <span
                      className={cx(
                        'font-mono text-[13px]',
                        run.compiled && (run.kind === 'build' || run.failed === 0) ? 'text-signal' : 'text-alert',
                      )}
                    >
                      {!run.compiled
                        ? `build failed, ${run.diagnostics.filter((d) => d.severity === 'error').length} errors`
                        : run.kind === 'build'
                          ? 'build successful'
                          : `${run.passed} passed, ${run.failed} failed`}
                    </span>
                  )}
                  {dev && (
                    <div className="ml-auto flex items-center gap-2">
                      <Button variant="secondary" size="sm" onClick={() => void doRun('build')} disabled={running} title="컴파일만 합니다">
                        {busyTask === 'build' ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Hammer size={16} aria-hidden />} 빌드
                      </Button>
                      <Button variant="primary" size="sm" onClick={() => void doRun('test')} disabled={running} title="컴파일하고 test 폴더의 JUnit 테스트를 실행합니다">
                        {busyTask === 'test' ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Play size={16} aria-hidden />} 테스트 실행
                      </Button>
                    </div>
                  )}
                </header>
                {showOutput && (
                <div className="min-h-0 flex-1 overflow-auto bg-panel-sunken p-4 font-mono text-code">
                  {!dev ? (
                    <DocChecks task={task} doc={contents[task.editableFile ?? ''] ?? ''} />
                  ) : running ? (
                    <span className="text-text-faint">
                      {busyTask === 'build' ? '$ 컴파일하고 있습니다...' : '$ 컴파일하고 테스트를 실행하고 있습니다...'}
                    </span>
                  ) : run ? (
                    run.lines.map((l, i) => {
                      const m = /^\[(ERROR|WARNING)\] (\S+\.java):(\d+)/.exec(l)
                      return m ? (
                        <button
                          key={i}
                          type="button"
                          onClick={() => void openFile(m[2])}
                          title={`${m[2]} ${m[3]}번째 줄 열기`}
                          className={cx('block w-full text-left whitespace-pre-wrap hover:underline', m[1] === 'ERROR' ? 'text-alert' : 'text-caution')}
                        >
                          {l}
                        </button>
                      ) : (
                      <div
                        key={i}
                        className={cx(
                          'whitespace-pre-wrap',
                          l.startsWith('$') && 'text-text-faint',
                          /\[OK\]|tests successful/.test(l) && 'text-signal',
                          /\[X\]|\[ERROR\]|\[TIMEOUT\]|FAILED|tests failed\s*\]/.test(l) && !/\b0 tests failed/.test(l) && 'text-alert',
                        )}
                      >
                        {l}
                      </div>
                      )
                    })
                  ) : (
                    <span className="text-text-faint">$ 빌드는 컴파일만, 테스트 실행은 컴파일 후 test 폴더의 JUnit 테스트까지 돌립니다</span>
                  )}
                </div>
                )}
              </section>
              )}
            </>
        </div>

        {/* 오른쪽: AI */}
        {showChat && (
        <div className="relative min-h-0">
          <div className="absolute inset-0 flex">
            <div className="flex min-w-0 flex-1 flex-col">
              <ChatPanel turns={turns} disabled={locked} busy={chatBusy} error={chatError} onSend={sendChat} model={view.attempt.model} maxChars={view.chatMaxChars ?? 1000}
                editBusy={editBusy}
                onEdit={(t, e, a) => void decideEdit(t, e, a)}
                onViewEdit={(t, e) => setViewing({ turn: t, index: e.index })}
              />
            </div>
          </div>
          {locked && (
            <div className="absolute top-12 right-4 flex items-center gap-1.5 rounded-sm bg-panel-raised px-2 py-1 font-mono text-[12px] text-text-muted">
              <Lock size={14} aria-hidden /> READ ONLY
            </div>
          )}
        </div>
        )}
      </div>

      {confirm && <ConfirmModal busy={busy} onCancel={() => setConfirm(false)} onConfirm={() => void doSubmit()} />}
      {viewing && viewingEdit && (
        <EditModal
          edit={viewingEdit}
          turn={viewing.turn}
          busy={editBusy}
          disabled={locked}
          onAction={(a) => void decideEdit(viewing.turn, viewingEdit, a)}
          onClose={() => setViewing(null)}
        />
      )}

      {toast && (
        <div role="status" className="fade-in fixed bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-md border border-line bg-panel-raised px-4 py-2 text-[14px] shadow-modal">
          <Save size={16} className="text-signal" aria-hidden />
          {toast}
        </div>
      )}
    </div>
  )
}
