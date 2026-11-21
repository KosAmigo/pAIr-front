// 복기 화면: 질문에 붙였던 첨부의 원문(그때 AI 에게 실제로 보낸 글자)을 펼쳐 본다.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, Paperclip, X } from 'lucide-react'
import { api, ApiError, type AttachmentDetail, type TurnAttachment } from '../../api'
import { ErrorState } from '../ErrorState'
import { IconButton } from '../ui'

export function AttachmentModal({ attemptId, turn, attachment, onClose }: { attemptId: string; turn: number; attachment: TurnAttachment; onClose: () => void }) {
  const [state, setState] = useState<{ detail: AttachmentDetail | null; error: string | null }>({ detail: null, error: null })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    api
      .attachment(attemptId, attachment.id)
      .then((detail) => alive && setState({ detail, error: null }))
      .catch((e: ApiError) => alive && setState({ detail: null, error: e.message }))
    return () => {
      alive = false
    }
  }, [attemptId, attachment.id, tick])
  useEffect(() => {
    // 뒤의 대화 서랍도 Esc 로 닫히므로, 캡처 단계에서 먼저 받아 이 창만 닫는다
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])
  const name = attachment.path.split('/').pop() ?? attachment.path
  return createPortal(
    <div
      className="fade-in fixed inset-0 z-[70] flex items-center justify-center bg-bg/70 p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="attach-title"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex h-[min(720px,86vh)] w-[min(880px,94vw)] flex-col rounded-lg border border-line bg-panel shadow-modal">
        <header className="flex h-11 shrink-0 items-center gap-3 border-b border-line px-4">
          <Paperclip size={16} className="text-text-muted" aria-hidden />
          <span className="font-mono text-[12px] text-text-faint">#T{String(turn).padStart(2, '0')}</span>
          <h2 id="attach-title" className="min-w-0 truncate font-mono text-[14px] text-text" title={attachment.path}>
            {name}
            {attachment.pages && <span className="ml-2 font-sans text-[12px] text-info">{attachment.pages}쪽</span>}
          </h2>
          <span className="tnum ml-auto font-mono text-[12px] text-text-muted">{attachment.chars.toLocaleString()}자</span>
          <IconButton label="닫기 (Esc)" onClick={onClose}>
            <X size={18} aria-hidden />
          </IconButton>
        </header>
        <p className="shrink-0 border-b border-line bg-panel-raised px-4 py-2 text-[13px] text-text-muted">
          이 질문을 보낼 때 AI에게 실제로 보낸 글자입니다. 그 뒤에 파일을 고쳤어도 이 기록은 바뀌지 않습니다.
        </p>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {state.error ? (
            <ErrorState compact message={state.error} onRetry={() => setTick((t) => t + 1)} />
          ) : !state.detail ? (
            <p className="flex items-center gap-2 text-[14px] text-text-muted">
              <Loader2 size={16} className="animate-spin" aria-hidden /> 불러오는 중
            </p>
          ) : (
            <pre className="font-mono text-[13px] leading-5 break-words whitespace-pre-wrap text-text">{state.detail.sentText}</pre>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
