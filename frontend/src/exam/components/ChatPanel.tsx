import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Bot, Loader2, Paperclip, X } from 'lucide-react'
import { SendKey } from '../../components/SendKey'
import { cx } from '../../components/cx'
import type { AiLimits, EditProposal, Turn } from '../../api'
import {
  ATTACH_CREDIT, ATTACH_MIME, attachCost, attachLabel, charsLabel, decodeDrop, turnsLeft,
  sendable, validPages, type AttachRef,
} from '../../lib/chatAttach'
import { EditCard, type EditAction } from '../../components/EditProposal'
import { splitReply } from '../../lib/edits'

// ── AI 채팅 ─────────────────────────────
export function ChatPanel({
  turns,
  streaming,
  disabled,
  busy,
  error,
  onSend,
  model,
  maxChars,
  limits,
  editBusy,
  onEdit,
  onViewEdit,
  attachments,
  materialPages,
  showCost,
  onAttach,
  onDetach,
  onPages,
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
  /** 과제별 AI 제한(질문 수, 한 번에 첨부, 첨부 글자 합계). 서버가 알려 주기 전에는 기본값 */
  limits: AiLimits
  editBusy: boolean
  onEdit: (turn: number, e: EditProposal, a: EditAction) => void
  onViewEdit: (turn: number, e: EditProposal) => void
  /** 이번 질문에 붙이려고 끌어다 놓은 파일 */
  attachments: AttachRef[]
  /** PDF 자료의 전체 쪽 수(칩에 "/N쪽"으로 보여 준다) */
  materialPages: Record<string, number>
  /** 첨부가 크레딧을 더 쓰는지(자가진단만) */
  showCost: boolean
  /** 첨부를 더한다. 못 붙이는 이유가 있으면 안내 문구를 돌려준다 */
  onAttach: (r: AttachRef) => string | null
  onDetach: (r: AttachRef) => void
  onPages: (path: string, pages: string) => void
}) {
  const [draft, setDraft] = useState('')
  const [dragging, setDragging] = useState(false)
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
    if (!text || busy || disabled || over || noTurnsLeft || !sendable(attachments)) return
    stick.current = true
    setDraft('') // 보낸 질문은 대화창으로 옮기고, 실패하면 입력창에 되돌린다
    if (!(await onSend(text))) setDraft(text)
  }
  const nextTurn = turns.length + 1
  const left = turnsLeft(limits.turns, turns)
  const noTurnsLeft = left === 0
  return (
    <section
      className={cx('relative flex h-full min-h-0 flex-col border-l border-line bg-panel', disabled && 'opacity-50')}
      onDragOver={(e) => {
        // 파일 트리에서 끌어온 것만 받는다(외부 파일은 무시)
        if (disabled || !e.dataTransfer.types.includes(ATTACH_MIME)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={(e) => {
        if (disabled || !e.dataTransfer.types.includes(ATTACH_MIME)) return
        e.preventDefault()
        setDragging(false)
        const ref = decodeDrop(e.dataTransfer.getData(ATTACH_MIME))
        if (ref) setNotice(onAttach(ref))
      }}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center border-2 border-dashed border-brand bg-brand-dim text-[15px] font-semibold text-text">
          <Paperclip size={18} className="mr-2" aria-hidden /> 여기에 놓으면 질문에 첨부됩니다 ({attachments.length}/{limits.maxAttach})
        </div>
      )}
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-line px-4">
        <Bot size={18} strokeWidth={1.75} className="text-info" aria-hidden />
        <span className="label">AI ASSISTANT</span>
        <span
          className={cx('tnum ml-auto font-mono text-[12px]', left <= 2 ? 'text-alert' : 'text-text-faint')}
          title={`질문 ${limits.turns}번까지 · 한 번에 첨부 ${limits.maxAttach}개 · 첨부 합계 ${charsLabel(limits.contextChars)}`}
        >
          남은 질문 {left}/{limits.turns}
        </span>
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
          <li className="text-[14px] leading-6 text-text-muted">AI는 이 대화창에 붙여 넣거나, 파일 탐색기에서 끌어다 놓은 파일의 내용만 볼 수 있습니다. 필요한 코드, 로그, 자료를 함께 전달하세요.</li>
        )}
        {turns.map((m) =>
          m.role === 'user' ? (
            <li key={m.turn} className="ml-8 flex flex-col items-end gap-1">
              <span className="flex gap-2 font-mono text-[12px] text-text-faint">
                <span>#T{String(m.turn).padStart(2, '0')}</span>
                <span>{m.time}</span>
              </span>
              <p className="rounded-md bg-panel-raised px-3 py-2 text-[15px] leading-6 whitespace-pre-wrap">{m.text}</p>
              {m.attachments && m.attachments.length > 0 && (
                <ul className="flex flex-wrap justify-end gap-1" aria-label="이 질문에 붙인 파일">
                  {m.attachments.map((a) => (
                    <li key={a.id} className="inline-flex max-w-full items-center gap-1 rounded-sm border border-line px-1.5 py-0.5 font-mono text-[12px] text-text-muted" title={`${a.path}${a.pages ? ` ${a.pages}쪽` : ''} · ${a.chars.toLocaleString()}자`}>
                      <Paperclip size={12} aria-hidden />
                      <span className="truncate">{attachLabel({ source: a.source, path: a.path, pages: a.pages ?? undefined })}</span>
                    </li>
                  ))}
                </ul>
              )}
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
          {attachments.length > 0 && (
            <div className="px-2 pt-2">
              <ul className="flex flex-wrap gap-1.5" aria-label="붙일 파일">
                {attachments.map((a) => (
                  <li key={`${a.source}|${a.path}`} className="inline-flex max-w-full items-center gap-1 rounded-sm border border-line bg-panel px-1.5 py-1 font-mono text-[12px]">
                    <Paperclip size={12} className="shrink-0 text-text-faint" aria-hidden />
                    <span className="truncate" title={a.path}>
                      {a.path.split('/').pop()}
                    </span>
                    {a.source === 'TASK_FILE' && (
                      <>
                        <input
                          aria-label={`${a.path.split('/').pop()} 쪽 범위`}
                          value={a.pages ?? ''}
                          onChange={(e) => onPages(a.path, e.target.value.replace(/\s/g, ''))}
                          aria-invalid={!validPages(a.pages)}
                          className={cx(
                            'w-14 rounded-sm border bg-panel-raised px-1 text-center outline-none focus:border-brand',
                            validPages(a.pages) ? 'border-line' : 'border-alert',
                          )}
                        />
                        <span className="shrink-0 text-text-faint">/{materialPages[a.path] ?? '?'}쪽</span>
                      </>
                    )}
                    <button
                      type="button"
                      aria-label={`${a.path.split('/').pop()} 첨부 빼기`}
                      onClick={() => onDetach(a)}
                      className="inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-text-faint hover:bg-panel-raised hover:text-text"
                    >
                      <X size={12} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
              <p className="tnum mt-1 font-mono text-[11px] text-text-faint">
                첨부 {attachments.length}/{limits.maxAttach} · 합계 {charsLabel(limits.contextChars)} 이하
                {showCost && ` · 크레딧 +${attachCost(attachments)} (파일당 ${ATTACH_CREDIT})`}
                {!sendable(attachments) && <span className="ml-1 text-alert">PDF 쪽 범위를 확인하세요 (예: 1-2)</span>}
              </p>
            </div>
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
            placeholder={noTurnsLeft ? `질문 ${limits.turns}번을 모두 썼습니다. 지금까지의 답을 바탕으로 마무리하세요` : '맥락을 충분히 담아 질문하세요. 파일 탐색기의 파일을 이 창으로 끌어 놓으면 AI에게 함께 보여 줍니다'}
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
            <SendKey ready={draft.trim().length > 0 && sendable(attachments)} disabled={disabled || busy || over || noTurnsLeft || !sendable(attachments)} onClick={() => void send()} />
          </div>
        </div>
      </div>
    </section>
  )
}
