import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Bot,
  Camera,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  Lock,
  MonitorUp,
  Play,
  Save,
  Send,
  X,
} from 'lucide-react'
import { Button, cx, IconButton, Logo, ModeBadge, StatusDot } from '../components/ui'
import { ActivityRail, type SidePanel } from '../components/ActivityRail'
import {
  bizDoc,
  bizFiles,
  bizTask,
  chat as initialChat,
  fileContents,
  files,
  followUps,
  runOutput,
  task as devTask,
  type ChatMsg,
  type FileNode,
} from '../data/mock'

// DESIGN.md §7-3 응시 화면

// ── 6.7 Status Bar ──────────────────────────
function useCountdown(initial: number) {
  const [left, setLeft] = useState(initial)
  useEffect(() => {
    const id = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(id)
  }, [])
  return [left, setLeft] as const
}
function fmt(sec: number) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':')
}

function StatusBar({
  mode,
  title,
  left,
  stage,
  onSubmit,
  onCheckpoint,
  onTimerDemo,
}: {
  mode: 'self' | 'live'
  title: string
  left: number
  stage: 'solve' | 'followup'
  onSubmit: () => void
  onCheckpoint: () => void
  onTimerDemo: () => void
}) {
  const tone = stage === 'followup' ? 'text-text' : left <= 180 ? 'text-alert' : left <= 600 ? 'text-caution' : 'text-text'
  return (
    <header
      className={cx(
        'grid h-11 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-line bg-panel px-4',
        mode === 'live' && 'border-t-2 border-t-alert',
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Logo />
        <span className="h-4 w-px bg-line" aria-hidden />
        <span className="truncate text-[15px] font-semibold">{title}</span>
        <ModeBadge mode={mode} />
      </div>

      <button
        type="button"
        onClick={onTimerDemo}
        title="데모: 남은 시간 단계 전환"
        className="flex items-baseline gap-2 rounded-md px-2"
        aria-label={`남은 시간 ${fmt(left)}`}
      >
        <span className="label">{stage === 'solve' ? 'REMAINING' : 'FOLLOW-UP'}</span>
        <span className={cx('tnum font-mono text-[21px] leading-7 font-semibold transition-colors duration-[180ms]', tone)} role="timer">
          {fmt(left)}
        </span>
      </button>

      <div className="flex items-center justify-end gap-4">
        {mode === 'live' && (
          <div className="flex items-center gap-4" aria-label="감독 상태">
            <span className="flex items-center gap-1.5 font-mono text-[13px] font-semibold text-alert">
              <span className="rec-pulse glow size-2 rounded-full bg-alert [--glow:var(--color-alert)]" aria-hidden />
              REC
            </span>
            <span className="flex items-center gap-1.5">
              <Camera size={18} strokeWidth={1.75} className="text-text-muted" aria-label="카메라" />
              <StatusDot status="ok" />
            </span>
            <span className="flex items-center gap-1.5">
              <MonitorUp size={18} strokeWidth={1.75} className="text-text-muted" aria-label="화면 공유" />
              <StatusDot status="ok" />
            </span>
            <span className="h-4 w-px bg-line" aria-hidden />
          </div>
        )}
        {mode === 'self' && stage === 'solve' && (
          <Button variant="ghost" size="sm" onClick={onCheckpoint}>
            <Save size={16} aria-hidden /> 체크포인트 저장
          </Button>
        )}
        {stage === 'solve' && (
          <Button variant="primary" size="sm" onClick={onSubmit}>
            제출
          </Button>
        )}
      </div>
    </header>
  )
}

// ── 파일 탐색기 ─────────────────────────────
function FileTree({ nodes, depth = 0, active, onOpen }: { nodes: FileNode[]; depth?: number; active: string; onOpen: (n: string) => void }) {
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  return (
    <ul>
      {nodes.map((n) =>
        n.type === 'dir' ? (
          <li key={n.name}>
            <button
              type="button"
              onClick={() => setClosed({ ...closed, [n.name]: !closed[n.name] })}
              aria-expanded={!closed[n.name]}
              className="flex h-7 w-full items-center gap-1.5 pr-2 text-[14px] text-text-muted hover:bg-panel-raised hover:text-text"
              style={{ paddingLeft: 8 + depth * 14 }}
            >
              {closed[n.name] ? <ChevronRight size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
              <Folder size={16} strokeWidth={1.75} aria-hidden />
              <span className="font-mono">{n.name}</span>
            </button>
            {!closed[n.name] && n.children && <FileTree nodes={n.children} depth={depth + 1} active={active} onOpen={onOpen} />}
          </li>
        ) : (
          <li key={n.name}>
            <button
              type="button"
              onClick={() => onOpen(n.name)}
              className={cx(
                'relative flex h-7 w-full items-center gap-1.5 pr-2 text-[14px]',
                active === n.name ? 'bg-panel-raised text-text' : 'text-text-muted hover:bg-panel-raised hover:text-text',
              )}
              style={{ paddingLeft: 22 + depth * 14 }}
            >
              {active === n.name && <span className="absolute inset-y-0 left-0 w-0.5 bg-signal" aria-hidden />}
              <FileText size={16} strokeWidth={1.75} aria-hidden />
              <span className="truncate font-mono">{n.name}</span>
            </button>
          </li>
        ),
      )}
    </ul>
  )
}

// ── 6.9 Code Editor: 간단한 구문 강조 ───────
// Java(Spring Boot) + TypeScript(React) 키워드
const KW =
  /^(public|private|protected|class|interface|extends|implements|static|final|void|new|return|if|else|for|while|throw|throws|try|catch|import|package|export|function|const|let|async|await|type|true|false|null)$/
// 주석: Java/TS는 //, YAML·Markdown은 줄 맨 앞 #
// (URL 안의 // 는 주석이 아니므로 줄 맨 앞이나 공백 뒤의 // 만 주석으로 본다)
const COMMENT = /^(\s*#.*|.*?)((?:^|\s)\/\/.*)?$/
function highlight(line: string) {
  const out: { t: string; c?: string }[] = []
  const [, code, comment] = (line.match(COMMENT) ?? [line, line]) as [string, string, string | undefined]
  if (/^\s*#/.test(code)) return [{ t: code, c: 'text-text-faint' }]
  const re = /('[^']*'|"[^"]*")|(@[A-Za-z]\w*)|(\b\d+L?\b)|([A-Za-z_]\w*)(?=\()|([A-Za-z_]\w*)|(\s+)|(.)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(code))) {
    if (m[1]) out.push({ t: m[1], c: 'text-branch-1' })
    else if (m[2]) out.push({ t: m[2], c: 'text-branch-4' })
    else if (m[3]) out.push({ t: m[3], c: 'text-branch-4' })
    else if (m[4]) out.push({ t: m[4], c: 'text-branch-2' })
    else if (m[5]) out.push({ t: m[5], c: KW.test(m[5]) ? 'text-branch-3' : undefined })
    else out.push({ t: m[0] })
  }
  if (comment) out.push({ t: comment, c: 'text-text-faint' })
  return out
}

function CodeView({ source, readOnly }: { source: string; readOnly?: boolean }) {
  const [cur, setCur] = useState(0)
  const lines = source.replace(/\n$/, '').split('\n')
  return (
    <div className={cx('h-full overflow-auto bg-panel-sunken py-3 font-mono text-code', readOnly && 'opacity-50')}>
      {lines.map((l, i) => (
        <div
          key={i}
          onClick={() => setCur(i)}
          className={cx('flex min-h-5 cursor-text', i === cur && !readOnly && 'bg-panel-raised')}
        >
          <span className="tnum w-12 shrink-0 pr-4 text-right text-text-faint select-none">{i + 1}</span>
          <span className="pr-4 whitespace-pre text-text">
            {highlight(l).map((tk, j) => (
              <span key={j} className={tk.c}>
                {tk.t}
              </span>
            ))}
          </span>
        </div>
      ))}
    </div>
  )
}

// ── 6.8 AI Chat ─────────────────────────────
// 목업 화면용 값. 실제 응시 화면은 백엔드 설정(application.yml)의 모델과 글자 수 제한을 쓴다.
const CHAT_MODEL = 'gpt-6.1-terra'
const CHAT_MAX_CHARS = 1000
function ChatPanel({ disabled, initial }: { disabled: boolean; initial: ChatMsg[] }) {
  const [msgs, setMsgs] = useState<ChatMsg[]>(initial)
  const [draft, setDraft] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const count = draft.length
  const over = count > CHAT_MAX_CHARS
  const send = () => {
    const text = draft.trim()
    if (!text || over) return
    const turn = msgs.length + 1
    setMsgs([
      ...msgs,
      { turn, role: 'user', time: '00:15:30', text },
      {
        turn: turn + 1,
        role: 'ai',
        time: '00:15:36',
        text: '(목업 응답) 좋은 접근입니다. 변경 전후로 같은 테스트를 실행해 결과를 비교해 보세요.',
      },
    ])
    setDraft('')
  }
  return (
    <section className={cx('flex min-h-0 flex-col border-l border-line bg-panel', disabled && 'opacity-50')}>
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-4">
        <Bot size={18} strokeWidth={1.75} className="text-info" aria-hidden />
        <span className="label">AI ASSISTANT</span>
        <span className="ml-auto font-mono text-[12px] text-text-faint">{msgs.length} TURNS</span>
      </header>
      <ol className="min-h-0 flex-1 space-y-4 overflow-auto p-4" aria-live="polite">
        {msgs.map((m) =>
          m.role === 'user' ? (
            <li key={m.turn} className="ml-8 flex flex-col items-end gap-1">
              <span className="flex gap-2 font-mono text-[12px] text-text-faint">
                <span>#T{String(m.turn).padStart(2, '0')}</span>
                <span>{m.time}</span>
              </span>
              <p className="rounded-md bg-panel-raised px-3 py-2 text-[15px] leading-6">{m.text}</p>
            </li>
          ) : (
            <li key={m.turn} className="mr-4 flex flex-col gap-1 border-l-2 border-info pl-3">
              <span className="flex items-center gap-2 font-mono text-[12px] text-text-faint">
                <Bot size={14} className="text-info" aria-hidden />
                <span>#T{String(m.turn).padStart(2, '0')}</span>
                <span>{m.time}</span>
              </span>
              <p className="text-[15px] leading-6 text-text">{m.text}</p>
            </li>
          ),
        )}
      </ol>
      <div className="shrink-0 border-t border-line p-3">
        <label htmlFor="chat-input" className="sr-only">
          AI에게 질문
        </label>
        <div className={cx('rounded-md border bg-panel-raised', over ? 'border-alert' : 'border-line-strong focus-within:border-signal')}>
          <div className="flex items-center gap-2 px-3 pt-1.5">
            {notice && (
              <span role="status" className="truncate text-[12px] text-caution">
                {notice}
              </span>
            )}
            <span className={cx('ml-auto tnum font-mono text-[12px]', count >= CHAT_MAX_CHARS ? 'text-alert' : count >= CHAT_MAX_CHARS * 0.9 ? 'text-caution' : 'text-text-faint')} aria-live="polite">
              {over && '글자 수 초과 '}
              {count.toLocaleString()} / {CHAT_MAX_CHARS.toLocaleString()}
            </span>
          </div>
          <textarea
            id="chat-input"
            rows={3}
            disabled={disabled}
            value={draft}
            maxLength={CHAT_MAX_CHARS}
            onChange={(e) => {
              setDraft(e.target.value)
              setNotice(null)
            }}
            onPaste={(e) => {
              // 붙여 넣기가 한도를 넘으면 들어갈 만큼만 넣고, 잘린 글자 수를 알려 준다
              const el = e.currentTarget
              const paste = e.clipboardData.getData('text')
              const { selectionStart: st, selectionEnd: en, value } = el
              const room = CHAT_MAX_CHARS - (value.length - (en - st))
              if (paste.length <= room) return
              e.preventDefault()
              const part = paste.slice(0, Math.max(0, room))
              setDraft(value.slice(0, st) + part + value.slice(en))
              setNotice(`붙여 넣은 내용 중 ${(paste.length - part.length).toLocaleString()}자가 잘렸습니다 (최대 ${CHAT_MAX_CHARS.toLocaleString()}자)`)
              requestAnimationFrame(() => el.setSelectionRange(st + part.length, st + part.length))
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send()
            }}
            placeholder="맥락을 충분히 담아 질문하세요"
            className="block w-full resize-none bg-transparent px-3 pt-2 text-[15px] leading-6 text-text outline-none placeholder:text-text-faint"
          />
          <div className="flex items-center gap-2 px-2 pb-2">
            <span className="label pl-1 text-text-faint">CTRL + ENTER</span>
            <span className="ml-auto truncate font-mono text-[12px] text-text-faint" title="이 시험에서 쓰는 AI 모델">
              {CHAT_MODEL}
            </span>
            <IconButton label="전송" className="text-signal hover:text-signal disabled:opacity-40" onClick={send} disabled={disabled || over}>
              <Send size={18} aria-hidden />
            </IconButton>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── 후속 질문 단계 ──────────────────────────
function FollowUp({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0)
  const [answers, setAnswers] = useState<string[]>(followUps.map(() => ''))
  const last = i === followUps.length - 1
  return (
    <section key={i} className="fade-in flex h-full flex-col bg-panel">
      <header className="flex h-10 shrink-0 items-center gap-3 border-b border-line px-4">
        <span className="label">FOLLOW-UP</span>
        <span className="text-[16px] font-semibold">후속 질문</span>
        <span className="tnum ml-auto font-mono text-[13px] text-text-muted">
          {i + 1} / {followUps.length}
        </span>
      </header>
      <div className="flex gap-1 px-4 pt-3" aria-hidden>
        {followUps.map((_, j) => (
          <span key={j} className={cx('h-0.5 flex-1 rounded-full', j <= i ? 'bg-signal' : 'bg-line')} />
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-8">
        <span className="label">QUESTION {String(i + 1).padStart(2, '0')}</span>
        <h2 className="mt-2 text-h2 font-semibold">{followUps[i]}</h2>
        <p className="mt-2 text-[14px] text-text-muted">제출한 풀이와 AI 대화를 근거로 답하세요. 에디터와 AI는 읽기 전용입니다.</p>
        <label htmlFor="answer" className="sr-only">
          답변
        </label>
        <textarea
          id="answer"
          value={answers[i]}
          onChange={(e) => setAnswers(answers.map((a, j) => (j === i ? e.target.value : a)))}
          className="mt-6 min-h-0 flex-1 resize-none rounded-md border border-line-strong bg-panel-raised p-4 text-body text-text outline-none focus:border-signal"
          placeholder="답변을 입력하세요"
        />
        <div className="mt-4 flex items-center">
          <span className="tnum font-mono text-[13px] text-text-faint">{answers[i].length} chars</span>
          {i > 0 && (
            <Button variant="ghost" className="ml-auto" onClick={() => setI(i - 1)}>
              이전
            </Button>
          )}
          <Button variant="primary" className={i > 0 ? 'ml-2' : 'ml-auto'} onClick={() => (last ? onDone() : setI(i + 1))}>
            {last ? '완료' : '다음'}
          </Button>
        </div>
      </div>
    </section>
  )
}

function ConfirmModal({ live, onCancel, onConfirm }: { live: boolean; onCancel: () => void; onConfirm: () => void }) {
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
          <p className="mt-2 text-[15px] leading-6 text-text-muted">
            제출하면 코드와 AI 대화가 잠기고, 후속 질문 3개가 이어집니다.
            {live && ' 실전 시험은 제출 후 수정할 수 없습니다.'}
          </p>
        </div>
        <footer className="flex justify-end gap-2 border-t border-line px-6 py-4">
          <Button variant="ghost" onClick={onCancel}>
            계속 풀기
          </Button>
          <Button variant="primary" onClick={onConfirm}>
            제출
          </Button>
        </footer>
      </div>
    </div>
  )
}

export default function Exam() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const mode = params.get('mode') === 'live' ? 'live' : 'self'
  const biz = params.get('track') === 'biz'
  const task = biz ? bizTask : devTask
  const tree = biz ? bizFiles : files

  const [left, setLeft] = useCountdown(mode === 'live' ? 52 * 60 + 10 : 38 * 60 + 12)
  const [stage, setStage] = useState<'solve' | 'followup'>('solve')
  const [confirm, setConfirm] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [side, setSide] = useState<SidePanel>('task')
  const [showOutput, setShowOutput] = useState(true)
  const [showChat, setShowChat] = useState(true)
  const firstFile = biz ? '기획안.md' : 'OrderService.java'
  const [open, setOpen] = useState<string[]>(biz ? [firstFile] : [firstFile, 'InventoryService.java'])
  const [active, setActive] = useState(firstFile)
  const [ran, setRan] = useState(false)
  const [doc, setDoc] = useState(bizDoc)
  const locked = stage === 'followup'

  const openFile = (n: string) => {
    if (!open.includes(n)) setOpen([...open, n])
    setActive(n)
  }
  const closeFile = (n: string) => {
    const next = open.filter((f) => f !== n)
    setOpen(next)
    if (active === n && next.length) setActive(next[next.length - 1])
  }
  const flash = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2000)
  }
  const timerDemo = () => setLeft((s) => (s > 600 ? 9 * 60 + 30 : s > 180 ? 2 * 60 + 45 : 38 * 60 + 12))

  const source = useMemo(() => fileContents[active] ?? `# ${active}\n`, [active])

  return (
    <div className="flex h-full flex-col bg-bg">
      <StatusBar
        mode={mode}
        title={task.title}
        left={left}
        stage={stage}
        onSubmit={() => setConfirm(true)}
        onCheckpoint={() => flash('체크포인트 CP-04를 저장했습니다')}
        onTimerDemo={timerDemo}
      />

      <div
        className="grid min-h-0 flex-1"
        style={{ gridTemplateColumns: `48px ${side ? '280px ' : ''}minmax(0,1fr)${showChat ? ' 360px' : ''}` }}
      >
        <ActivityRail
          side={side}
          onSide={setSide}
          showOutput={showOutput}
          onToggleOutput={() => setShowOutput((v) => !v)}
          outputLabel={biz ? '체크리스트' : '실행 결과'}
          showChat={showChat}
          onToggleChat={() => setShowChat((v) => !v)}
        />
        {/* 사이드 패널: 과제 / 파일 */}
        {side && (
        <aside className={cx('flex min-h-0 flex-col border-r border-line bg-panel', locked && 'opacity-50')}>
          <header className="flex h-10 shrink-0 items-center border-b border-line px-4">
            <span className="label">{side === 'task' ? 'TASK' : 'EXPLORER'}</span>
          </header>
          {side === 'task' ? (
            <div className="fade-in min-h-0 flex-1 overflow-auto p-4">
              <span className="label">{task.type === '개발' ? 'DEV' : 'BIZ'} TASK</span>
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
              <FileTree nodes={tree} active={active} onOpen={openFile} />
            </nav>
          )}
        </aside>
        )}

        {/* 가운데: 에디터 + 출력  |  후속 질문 */}
        <div className="flex min-h-0 min-w-0 flex-col">
          {locked ? (
            <FollowUp onDone={() => navigate(mode === 'live' ? '/exam/live-k7q2mx/submitted' : '/report/a-1107')} />
          ) : (
            <>
              <div className="flex h-10 shrink-0 items-stretch border-b border-line bg-panel">
                <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto" role="tablist" aria-label="열린 파일">
                  {open.map((f) => (
                    <div
                      key={f}
                      className={cx(
                        'group relative flex shrink-0 items-center gap-1 border-r border-line pr-1 pl-3',
                        active === f ? 'bg-panel-sunken text-text' : 'text-text-muted hover:text-text',
                      )}
                    >
                      {active === f && <span className="absolute inset-x-0 top-0 h-0.5 bg-signal" aria-hidden />}
                      <button role="tab" aria-selected={active === f} type="button" onClick={() => setActive(f)} className="font-mono text-[14px]">
                        {f}
                      </button>
                      <button
                        type="button"
                        aria-label={`${f} 닫기`}
                        onClick={() => closeFile(f)}
                        className="inline-flex size-6 items-center justify-center rounded-sm text-text-faint hover:bg-panel-raised hover:text-text"
                      >
                        <X size={14} aria-hidden />
                      </button>
                    </div>
                  ))}
                </div>
                {!biz && (
                  <div className="flex items-center px-3">
                    <Button variant="primary" size="sm" onClick={() => setRan(true)}>
                      <Play size={16} aria-hidden /> 실행
                    </Button>
                  </div>
                )}
              </div>

              <div className="min-h-0 flex-1">
                {biz && active === '기획안.md' ? (
                  <textarea
                    aria-label="기획안 문서 편집기"
                    value={doc}
                    onChange={(e) => setDoc(e.target.value)}
                    className="block h-full w-full resize-none bg-panel-sunken px-12 py-8 text-body text-text outline-none"
                  />
                ) : open.length ? (
                  <CodeView source={source} />
                ) : (
                  <div className="flex h-full items-center justify-center bg-panel-sunken text-[15px] text-text-muted">파일 탐색기에서 파일을 여세요</div>
                )}
              </div>

              {showOutput && (
              <section className="flex h-60 shrink-0 flex-col border-t border-line bg-panel">
                <header className="flex h-10 shrink-0 items-center gap-3 border-b border-line px-4">
                  <span className="label">{biz ? 'CHECK' : 'OUTPUT'}</span>
                  {!biz && ran && <span className="font-mono text-[13px] text-alert">1 failed</span>}
                </header>
                <div className="min-h-0 flex-1 overflow-auto bg-panel-sunken p-4 font-mono text-code">
                  {biz ? (
                    <ul className="space-y-1 font-sans text-[14px]">
                      <li className="flex items-center gap-2">
                        <StatusDot status="ok" label="결론 작성됨" />
                      </li>
                      <li className="flex items-center gap-2">
                        <StatusDot status="check" label="근거 1 / 3" />
                      </li>
                      <li className="flex items-center gap-2">
                        <StatusDot status="check" label="리스크 항목 없음" />
                      </li>
                      <li className="tnum pt-2 font-mono text-[13px] text-text-faint">{doc.length} chars</li>
                    </ul>
                  ) : ran ? (
                    runOutput.map((l, i) => (
                      <div
                        key={i}
                        className={cx(
                          l.kind === 'ok' && 'text-signal',
                          l.kind === 'err' && 'text-alert',
                          l.kind === 'prompt' && 'text-text-faint',
                          l.kind === 'plain' && 'text-text-muted',
                        )}
                      >
                        {l.text}
                      </div>
                    ))
                  ) : (
                    <span className="text-text-faint">$ 실행 버튼을 누르면 결과가 여기에 표시됩니다</span>
                  )}
                </div>
              </section>
              )}
            </>
          )}
        </div>

        {/* 오른쪽: AI */}
        {showChat && (
        <div className="relative min-h-0">
          <div className="absolute inset-0 flex">
            <div className="flex min-w-0 flex-1 flex-col">
              <ChatPanel disabled={locked} initial={initialChat} />
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

      {confirm && (
        <ConfirmModal
          live={mode === 'live'}
          onCancel={() => setConfirm(false)}
          onConfirm={() => {
            setConfirm(false)
            setStage('followup')
            setLeft(10 * 60)
          }}
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
