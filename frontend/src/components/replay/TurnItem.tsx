import { useState } from 'react'
import { Bot, Paperclip, User } from 'lucide-react'
import type { Turn, TurnAttachment } from '../../api'
import { attachLabel } from '../../lib/chatAttach'
import { cx } from '../cx'
import { AttachmentModal } from './AttachmentModal'

/** AI 대화 한 턴 (복기 화면의 대화 기록). attemptId 가 있으면 붙였던 파일을 눌러 그때 보낸 원문을 볼 수 있다 */
export function TurnItem({ t, attemptId }: { t: Turn; attemptId?: string }) {
  const ai = t.role === 'ai'
  const [open, setOpen] = useState<TurnAttachment | null>(null)
  const attachments = t.attachments ?? []
  return (
    <li className={cx('rounded-sm border-l-2 bg-panel-raised px-4 py-3', ai ? 'border-info' : 'border-text-muted')}>
      <div className="flex items-center gap-2 font-mono text-[12px] text-text-muted">
        {ai ? <Bot size={14} className="text-info" aria-hidden /> : <User size={14} aria-hidden />}
        <span>#T{String(t.turn).padStart(2, '0')}</span>
        <span className={ai ? 'text-info' : 'text-text'}>{ai ? 'AI' : '응시자'}</span>
        <span>{t.time}</span>
      </div>
      <p className="mt-1 text-[15px] leading-6 break-words whitespace-pre-wrap text-text">{t.text}</p>
      {attachments.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="이 질문에 붙인 파일">
          {attachments.map((a) => {
            const label = attachLabel({ source: a.source, path: a.path, pages: a.pages ?? undefined })
            const info = `${a.path}${a.pages ? ` ${a.pages}쪽` : ''} · ${a.chars.toLocaleString()}자`
            return (
              <li key={a.id}>
                {attemptId ? (
                  <button
                    type="button"
                    onClick={() => setOpen(a)}
                    title={`${info} — 눌러서 그때 AI에게 보낸 내용 보기`}
                    className="inline-flex max-w-full items-center gap-1 rounded-sm border border-line bg-panel px-1.5 py-0.5 font-mono text-[12px] text-text-muted hover:border-line-strong hover:text-text"
                  >
                    <Paperclip size={12} aria-hidden />
                    <span className="truncate">{label}</span>
                  </button>
                ) : (
                  <span title={info} className="inline-flex max-w-full items-center gap-1 rounded-sm border border-line px-1.5 py-0.5 font-mono text-[12px] text-text-muted">
                    <Paperclip size={12} aria-hidden />
                    <span className="truncate">{label}</span>
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {open && attemptId && <AttachmentModal attemptId={attemptId} turn={t.turn} attachment={open} onClose={() => setOpen(null)} />}
    </li>
  )
}
