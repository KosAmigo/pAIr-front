// 감독 패널: 시험 중인 응시자에게 경고 메시지를 보낸다 (일방향, 준비된 문구 또는 직접 입력).
// 보낸 기록·읽음은 여기에 보여 주지 않는다.
import { useState } from 'react'
import { Send } from 'lucide-react'
import { Button } from '../../components/ui'
import { consoleApi } from '../../consoleApi'
import { NOTICE_MAX, NOTICE_PRESETS, normalizeNotice } from './noticePresets'

export default function NoticeSender({ sessionId, participantId }: { sessionId: number; participantId: number }) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentOnce, setSentOnce] = useState(false)
  const message = normalizeNotice(text)

  const send = () => {
    if (!message || sending) return
    setSending(true)
    setError(null)
    consoleApi.sendNotice(sessionId, participantId, message).then(
      () => {
        setText('')
        setSending(false)
        setSentOnce(true)
      },
      (e: unknown) => {
        setSending(false)
        setError(e instanceof Error ? e.message : String(e))
      },
    )
  }

  const id = `warn-${participantId}`
  return (
    <div className="border-b border-line px-4 py-3">
      <label htmlFor={id} className="text-[13px] font-semibold text-text">
        응시자에게 경고 보내기
      </label>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {NOTICE_PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setText(p)}
            className="rounded-full bg-panel-raised px-2.5 py-1 text-left text-[12px] text-text-muted hover:text-text"
          >
            {p}
          </button>
        ))}
      </div>
      <textarea
        id={id}
        value={text}
        maxLength={NOTICE_MAX}
        rows={2}
        onChange={(e) => setText(e.target.value)}
        placeholder="문구를 고르거나 직접 입력하세요"
        className="mt-2 w-full resize-none rounded-lg border border-line-strong bg-bg px-3 py-2 text-[13px] text-text"
      />
      <div className="mt-1.5 flex items-center gap-2">
        <span className="text-[12px] text-text-faint">응시자 화면 위쪽에 배너로 뜨며 시험은 멈추지 않습니다</span>
        <Button size="sm" className="ml-auto" disabled={sending || !message} onClick={send}>
          <Send size={14} aria-hidden /> {sending ? '보내는 중' : '보내기'}
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-1.5 text-[12px] text-alert">
          {error}
        </p>
      )}
      {sentOnce && !error && !sending && <p className="mt-1.5 text-[12px] text-signal">보냈습니다.</p>}
    </div>
  )
}
