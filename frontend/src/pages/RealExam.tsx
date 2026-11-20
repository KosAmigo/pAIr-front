import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Bot, ChevronDown, ChevronRight, CircleHelp, FileText, Folder, Hammer, Loader2, Lock, Play, Save, X } from 'lucide-react'
import { CodeEditor } from '../components/CodeEditor'
import { SendKey } from '../components/SendKey'
import { cx } from '../components/cx'
import { Button, IconButton, Logo, ModeBadge, StatusDot } from '../components/ui'
import { ActivityRail, type SidePanel } from '../components/ActivityRail'
import { QuestionPanel } from '../components/questions/QuestionPanel'
import { useQuestions } from '../components/questions/useQuestions'
import { CoachTour, examGuideSteps } from '../components/CoachTour'
import { api, ApiError, chatStream, type AttemptView, type CompileDiagnostic, type EditProposal, type Task, type Turn } from '../api'
import { EditCard, EditModal, type EditAction } from '../components/EditProposal'
import { splitReply } from '../lib/edits'
import { useAntiCheating, ViolationCounter, WarningModal } from '../anti-cheating'
import { PasteDetector } from '../anti-cheating/core/PasteDetector.ts'
import type { Violation } from '../anti-cheating/core/types.ts'
import { toBrowserViolation } from '../proctor/core/events.ts'
import { proctorApi } from '../proctor/api/proctorApi.ts'
import { camHub } from '../proctor/camHub.ts'
import { clearLiveExam, readLiveExam, secondsLeft } from '../proctor/liveExam.ts'
import { useCredits } from '../data/credits'
import { CreditPill } from '../components/CreditPill'

// 카메라 감독은 실전 시험에서만 불러온다 (자가진단은 분석 모델을 내려받지 않는다)
/** 실전 시험 중 서버에 연결 신호를 보내는 간격 (서버 유예 5분 판단용) */
const HEARTBEAT_MS = 10_000

const CamMonitor = lazy(() => import('../proctor/react/CamMonitor.tsx'))

/** 실전 시험이 끝나면 카메라·휴대폰 연결을 끄고 실전 맥락을 지운다 */
async function endLiveProctoring() {
  clearLiveExam()
  await camHub.stop()
}

// 실제 응시 화면: 백엔드 API 에 연결된 버전. 레이아웃은 DESIGN.md §7-3 응시 화면을 따른다.

function fmt(sec: number) {
  const s = Math.max(0, sec)
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0')).join(':')
}

const readOnlyPath = (p: string) => p.startsWith('logs/') || p.startsWith('자료/')
const fileName = (p: string) => p.split('/').pop() ?? p

// ── 진입: /exam/new?task=과제ID (또는 ?track=dev|biz 로 직군 기본 과제) → 응시 생성 후 이동 ─────
export function NewExam() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)
  const { refresh: refreshCredits } = useCredits()
  useEffect(() => {
    if (started.current) return
    started.current = true
    const track = params.get('track') === 'biz' ? 'biz' : 'dev'
    api
      .start(params.get('task') || api.taskIdFor(track))
      .then(({ attemptId }) => {
        void refreshCredits()
        navigate(`/exam/${attemptId}`, { replace: true })
      })
      .catch((e: ApiError) => setError(e.message))
  }, [params, navigate, refreshCredits])
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
              {active === n.path && <span className="absolute inset-y-0 left-0 w-0.5 bg-brand" aria-hidden />}
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
  streaming,
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
  /** 보내는 중인 질문과 지금까지 받은 답변 글자 */
  streaming: { question: string; answer: string } | null
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
  // 새 턴이 생기거나 답변 글자가 들어오는 동안 맨 아래로. 응시자가 위로 올려 읽는 중이면 따라가지 않는다.
  const stick = useRef(true)
  useEffect(() => {
    const el = listRef.current
    if (el && stick.current) el.scrollTo({ top: el.scrollHeight })
  }, [turns.length, busy, streaming?.answer.length])
  const send = async () => {
    const text = draft.trim()
    if (!text || busy || disabled || over) return
    stick.current = true
    setDraft('') // 보낸 질문은 대화창으로 옮기고, 실패하면 입력창에 되돌린다
    if (!(await onSend(text))) setDraft(text)
  }
  const nextTurn = turns.length + 1
  return (
    <section className={cx('flex h-full min-h-0 flex-col border-l border-line bg-panel', disabled && 'opacity-50')}>
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-4">
        <Bot size={18} strokeWidth={1.75} className="text-info" aria-hidden />
        <span className="label">AI ASSISTANT</span>
        <span className="ml-auto font-mono text-[12px] text-text-faint">{turns.length} TURNS</span>
      </header>
      <ol
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
        }}
        className="min-h-0 flex-1 space-y-4 overflow-auto p-4"
        aria-live="polite"
      >
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
        {streaming && (
          <>
            <li className="ml-8 flex flex-col items-end gap-1">
              <span className="font-mono text-[12px] text-text-faint">#T{String(nextTurn).padStart(2, '0')}</span>
              <p className="rounded-md bg-panel-raised px-3 py-2 text-[15px] leading-6 whitespace-pre-wrap">{streaming.question}</p>
            </li>
            {streaming.answer ? (
              <li className="mr-4 flex flex-col gap-1 border-l-2 border-info pl-3">
                <span className="flex items-center gap-2 font-mono text-[12px] text-text-faint">
                  <Bot size={14} className="text-info" aria-hidden />
                  <span>#T{String(nextTurn + 1).padStart(2, '0')}</span>
                  <Loader2 size={12} className="animate-spin text-info" aria-hidden />
                </span>
                <p className="text-[15px] leading-6 whitespace-pre-wrap text-text">
                  {streaming.answer}
                  <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-info align-middle" aria-hidden />
                </p>
              </li>
            ) : (
              <li className="flex items-center gap-2 border-l-2 border-info pl-3 text-[14px] text-text-muted">
                <Loader2 size={16} className="animate-spin text-info" aria-hidden /> AI가 답변을 작성하고 있습니다
              </li>
            )}
          </>
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
        <div className={cx('rounded-md border bg-panel-raised', over ? 'border-alert' : 'border-line-strong focus-within:border-brand')}>
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
            {/* 단축키와 모델명은 작게, 글자 수에 자리를 더 준다 */}
            <kbd className="shrink-0 rounded-sm border border-line px-1 font-mono text-[11px] leading-4 text-text-faint" title="Ctrl + Enter 로 보내기">
              Ctrl↵
            </kbd>
            <span className="min-w-0 max-w-[96px] truncate font-mono text-[11px] text-text-faint" title={`이 시험에서 쓰는 AI 모델: ${model}`}>
              {model}
            </span>
            <span
              className={cx(
                'tnum ml-auto mr-1 shrink-0 font-mono text-[13px]',
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
          <span key={j} className={cx('h-0.5 flex-1 rounded-full', j <= i ? 'bg-brand' : 'bg-line')} />
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
          className="mt-3 min-h-0 flex-1 resize-none rounded-md border border-line-strong bg-panel-raised p-4 text-body text-text outline-none focus:border-brand"
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
  const { refresh: refreshCredits } = useCredits()
  // 입장 링크로 시작한 실전 응시일 때만 값이 있다. 자가진단은 null → 감독을 전혀 켜지 않는다
  const [live] = useState(() => readLiveExam(sessionId))
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
  const [streaming, setStreaming] = useState<{ question: string; answer: string } | null>(null)
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
  // 객관식·단답형 문항 (비개발 과제). 풀이 중이 아니면 읽기 전용
  const qs = useQuestions(sessionId, stage !== 'solve')
  const hasQuestions = qs.questions.length > 0 || qs.load === 'error'
  const watching = Boolean(live && view && (view.attempt.status === 'SOLVING' || view.attempt.status === 'FOLLOWUP'))
  // 감독 회차면 브라우저 이탈도 회차 감독 기록(proctor_events, source=BROWSER)에 함께 남긴다
  const forwardViolation = useCallback(
    (v: Violation) => {
      const first = v.signals[0]?.type
      if (!live?.proctoring || !first) return
      // 단축키 입력은 서버에 창 이탈로 남기고, 키 입력으로 감지됐다는 표시만 붙인다
      const viaShortcut = first === 'KEY_SHORTCUT'
      const type = viaShortcut ? 'WINDOW_BLUR' : first
      camHub.recordBrowser(toBrowserViolation(type, v.occurredAt, live.serverOffsetMs, { signals: v.signals.length, ...(viaShortcut ? { via: 'shortcut' } : {}) }))
    },
    [live],
  )
  // 브라우저 이탈 감지는 감독을 켠 실전 회차에서만 쓴다 (자가진단은 쓰지 않는다). 기록은 감독 이벤트(DB)로 간다
  const antiCheating = useAntiCheating({ sessionId, active: watching && Boolean(live?.proctoring), onViolation: forwardViolation })
  // 실전 시험은 전체 화면에서만 푼다. 전체 화면이어야 Alt+Tab·Win 키를 브라우저가 붙잡을 수 있다 (Keyboard Lock)
  const [fullscreen, setFullscreen] = useState(() => typeof document !== 'undefined' && Boolean(document.fullscreenElement))
  useEffect(() => {
    const sync = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])
  const [tourOpen, setTourOpen] = useState(false)
  // 실전: 10초마다 서버에 연결 신호를 보낸다. 창이 닫히거나 끊겨 5분(유예)을 넘기면 서버가 링크를 만료시킨다
  const [linkExpired, setLinkExpired] = useState(false)
  const liveInvite = live?.invite
  useEffect(() => {
    if (!liveInvite || !watching) return
    let alive = true
    const beat = () =>
      proctorApi.heartbeat(liveInvite).then(
        (r) => alive && r.expired && setLinkExpired(true),
        () => undefined, // 신호가 안 가는 동안은 서버가 알아서 끊김으로 본다. 다음 신호에서 다시 보낸다
      )
    beat()
    const id = window.setInterval(beat, HEARTBEAT_MS)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [liveInvite, watching])
  const needFullscreen = watching && Boolean(live?.proctoring) && !fullscreen
  // 사용 안내는 위쪽 도움말(?) 버튼을 눌렀을 때만 보여 준다 (대기실에서는 문구가 돌아가며 안내한다)

  // 외부 붙여넣기: 시험 화면 안에서 복사한 글이 아닌 것을 붙이면 PASTE 이벤트 (글자 수·위치만, 내용은 보내지 않음)
  useEffect(() => {
    if (!watching || !live?.proctoring) return
    const detector = new PasteDetector((p) =>
      camHub.recordBrowser(toBrowserViolation('PASTE', p.occurredAt, live.serverOffsetMs, { chars: p.chars, lines: p.lines, target: p.target })),
    )
    detector.start()
    return () => detector.stop()
  }, [watching, live])
  const doneUrl = live ? `/exam/${sessionId}/submitted` : `/report/${sessionId}`

  // 실전: 종료 시각(서버 기준)이 지나면 서버가 자동 제출한다. 화면은 감독을 끄고 제출 완료로 간다
  // 후속 질문 단계에서는 경과 타이머가 멈추므로 실전만 1초마다 다시 그려 남은 시간을 갱신한다
  const [, setLiveTick] = useState(0)
  useEffect(() => {
    if (!live) return
    const id = window.setInterval(() => setLiveTick((t) => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [live])
  const liveLeft = live ? secondsLeft(live) : null
  const liveOver = liveLeft !== null && liveLeft <= 0
  const finishAntiCheating = antiCheating.finish
  const ended = useRef(false)
  useEffect(() => {
    if (!liveOver || ended.current) return
    ended.current = true
    void finishAntiCheating()
    void endLiveProctoring().finally(() => navigate(`/exam/${sessionId}/submitted`, { replace: true }))
  }, [liveOver, sessionId, navigate, finishAntiCheating])

  // 처음 불러오기
  useEffect(() => {
    let alive = true
    api
      .attempt(sessionId)
      .then(async (v) => {
        if (!alive) return
        if (v.attempt.status === 'SCORING' || v.attempt.status === 'DONE' || v.attempt.status === 'ERROR') {
          // 실전 응시는 리포트를 보여 주지 않는다 (기획: 실전은 리포트·복기 차단)
          navigate(readLiveExam(sessionId) ? `/exam/${sessionId}/submitted` : `/report/${sessionId}`, { replace: true })
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
  // 실전은 서버 기준 종료 시각까지, 자가진단은 과제 제한 시간에서 지난 시간을 뺀다
  const left = liveLeft ?? task.minutes * 60 - elapsed
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
    setStreaming({ question: text, answer: '' })
    try {
      const added = await chatStream(sessionId, text, (d) => setStreaming((s) => (s ? { ...s, answer: s.answer + d } : s)))
      if (!live) void refreshCredits()
      setTurns((t) => [...t, ...added])
      return true
    } catch (e) {
      setChatError((e as ApiError).message)
      return false
    } finally {
      setStreaming(null)
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
      await qs.flush()
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
      await antiCheating.finish()
      if (live) {
        // 이 과제만 회차에 제출 기록(과제별 제출). 실패해도 종료 시각에 서버가 대신 제출하므로 화면은 넘어간다
        const taskId = Object.keys(live.attempts).find((t) => live.attempts[t] === sessionId)
        if (taskId) await proctorApi.submitTask(live.invite, taskId).catch(() => undefined)
        await endLiveProctoring()
      }
      navigate(doneUrl)
    } catch (e) {
      setActionError((e as ApiError).message)
      setBusy(false)
    }
  }

  return (
    // 집중 무대(DESIGN.md §0-1, §7-3): 들어올 때 짧은 페이드만, 꾸밈 연출은 focus-stage 로 끈다
    <div className="focus-stage fade-in flex h-full flex-col bg-bg">
      {/* 6.7 Status Bar */}
      <header className="grid h-11 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-line bg-panel px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Logo />
          <span className="h-4 w-px bg-line" aria-hidden />
          <span className="truncate text-[15px] font-semibold">{task.title}</span>
          <ModeBadge mode={live ? 'live' : 'self'} />
        </div>
        <div className="flex items-baseline gap-2 px-2" data-tour="timer" aria-label={`남은 시간 ${fmt(left)}`}>
          <span className="label">{locked ? 'FOLLOW-UP' : 'REMAINING'}</span>
          <span className={cx('tnum font-mono text-[21px] leading-7 font-semibold transition-colors duration-[180ms]', tone)} role="timer">
            {left < 0 && !locked ? '-' : ''}
            {fmt(Math.abs(left))}
          </span>
        </div>
        <div className="flex items-center justify-end gap-3">
          <IconButton label="사용 안내" onClick={() => setTourOpen(true)}>
            <CircleHelp size={18} aria-hidden />
          </IconButton>
          {!live && <CreditPill />}
          {live && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void antiCheating.requestFullscreen().catch(() => setActionError('전체 화면으로 전환할 수 없습니다.'))}
              >
                전체 화면 시작
              </Button>
              <ViolationCounter count={antiCheating.count} />
            </>
          )}
          <span className="font-mono text-[12px] text-text-faint">{view.attempt.model}</span>
          {!locked && (
            <Button variant="primary" size="sm" data-tour="submit" onClick={() => setConfirm(true)}>
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
        style={{ gridTemplateColumns: `48px ${side ? (side === 'questions' ? '360px ' : '280px ') : ''}minmax(0,1fr)${showChat ? ' 380px' : ''}` }}
      >
        <ActivityRail
          side={side}
          onSide={setSide}
          showOutput={showOutput}
          onToggleOutput={() => setShowOutput((v) => !v)}
          outputLabel={dev ? '실행 결과' : '체크리스트'}
          showChat={showChat}
          onToggleChat={() => setShowChat((v) => !v)}
          questions={hasQuestions ? { answered: qs.answered, total: qs.questions.length } : undefined}
        />
        {/* 사이드 패널: 과제 / 파일 */}
        {side && (
        <aside className="flex min-h-0 flex-col border-r border-line bg-panel">
          <header className="flex h-10 shrink-0 items-center border-b border-line px-4">
            <span className="label">{side === 'task' ? 'TASK' : side === 'questions' ? 'QUESTIONS' : 'EXPLORER'}</span>
          </header>
          {side === 'questions' ? (
            <QuestionPanel qs={qs} />
          ) : side === 'task' ? (
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
              {hasQuestions && (
                <button
                  type="button"
                  onClick={() => setSide('questions')}
                  className="mt-6 flex w-full items-center justify-between rounded-md border border-line bg-panel-raised/40 px-3 py-2.5 text-left text-[15px] font-semibold text-text hover:border-line-strong"
                >
                  <span>문항 풀기</span>
                  <span className="tnum font-mono text-[13px] font-normal text-text-muted">
                    {qs.answered}/{qs.questions.length}
                  </span>
                </button>
              )}
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
        <div className="flex min-h-0 min-w-0 flex-col" data-tour="editor">
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
                      {showPrompts && <span className="absolute inset-x-0 top-0 h-0.5 bg-brand" aria-hidden />}
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
                      {active === f && !showPrompts && <span className="absolute inset-x-0 top-0 h-0.5 bg-brand" aria-hidden />}
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
        <div className="relative min-h-0" data-tour="chat">
          <div className="absolute inset-0 flex">
            <div className="flex min-w-0 flex-1 flex-col">
              <ChatPanel turns={turns} streaming={streaming} disabled={locked} busy={chatBusy} error={chatError} onSend={sendChat} model={view.attempt.model} maxChars={view.chatMaxChars ?? 1000}
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

      {tourOpen && <CoachTour steps={examGuideSteps({ proctoring: Boolean(live?.proctoring) })} storageKey="exam-guide-v2" onClose={() => setTourOpen(false)} />}
      {linkExpired && (
        <div role="alertdialog" aria-modal="true" aria-label="입장 링크 만료" className="fixed inset-0 z-[95] flex items-center justify-center bg-bg/95 p-4">
          <section className="w-full max-w-[460px] rounded-lg border border-alert/50 bg-panel p-6 text-center shadow-modal">
            <h2 className="text-h2 font-semibold">입장 링크가 만료되었습니다</h2>
            <p className="mt-2 text-[15px] leading-6 break-keep text-text-muted">
              연결이 끊긴 채로 유예 시간(5분)을 넘겨 이 시험 링크가 만료되었습니다. 이 기록은 감독 기록에 남았습니다. 기업 담당자에게 문의해 주세요.
            </p>
            <Button variant="primary" className="mt-5" onClick={() => navigate('/')}>
              나가기
            </Button>
          </section>
        </div>
      )}
      {needFullscreen && (
        <div role="dialog" aria-modal="true" aria-label="전체 화면 필요" className="fixed inset-0 z-[80] flex items-center justify-center bg-bg/90 p-4 backdrop-blur-sm">
          <section className="w-full max-w-[440px] rounded-lg border border-line bg-panel p-6 text-center shadow-modal">
            <h2 className="text-h2 font-semibold">전체 화면으로 시험을 진행합니다</h2>
            <p className="mt-2 text-[15px] leading-6 text-text-muted">시험 중에는 다른 창으로 이동할 수 없고, 이동 시도(Alt+Tab, Win 키 등)는 기록됩니다.</p>
            <Button
              variant="primary"
              className="mt-5"
              onClick={() => void antiCheating.requestFullscreen().catch(() => setActionError('전체 화면으로 전환할 수 없습니다. 브라우저 설정을 확인해 주세요.'))}
            >
              전체 화면 시작
            </Button>
          </section>
        </div>
      )}
      <WarningModal violation={antiCheating.warning} count={antiCheating.count} onClose={antiCheating.dismissWarning} />
      {live?.proctoring && (
        <Suspense fallback={null}>
          <CamMonitor live={live} />
        </Suspense>
      )}
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
