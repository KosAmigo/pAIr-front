// 콘솔: 응시자의 환경 점검 결과(통과·경고·실패와 사유)를 보고, 응시자 화면으로 안내 메시지를 보낸다.
// 입장 대기 중에는 응시자가 올리는 진행 상태(실시간), 시작 뒤에는 저장된 결과를 보여 준다. 응시자 답장은 없고 "읽음"만 보인다.
import { useState } from 'react'
import { CheckCheck, CircleAlert, CircleCheck, CircleDashed, CircleX, Send } from 'lucide-react'
import { cx } from '../../components/cx'
import { ErrorState } from '../../components/ErrorState'
import { Button } from '../../components/ui'
import { consoleApi, type ParticipantView, type SessionSummary } from '../../consoleApi'
import { useLoad } from '../../data/consoleSessions'
import { summarizeEnvCheck, type SummaryStatus } from '../../proctor/check/envCheckSummary'
import { fmtTime } from './format'
import { Loading } from './Loading'

/** 서버(NoticeService.MAX_LENGTH)와 같은 한도 */
const NOTICE_MAX = 500

const STATUS_VIEW: Record<SummaryStatus, { text: string; cls: string; Icon: typeof CircleX }> = {
  fail: { text: '실패', cls: 'text-alert', Icon: CircleX },
  warn: { text: '주의', cls: 'text-caution', Icon: CircleAlert },
  pass: { text: '통과', cls: 'text-signal', Icon: CircleCheck },
  pending: { text: '미완료', cls: 'text-text-faint', Icon: CircleDashed },
}

export default function EnvCheckCard({ session, p, pollMs }: { session: SessionSummary; p: ParticipantView; pollMs?: number }) {
  const check = useLoad(`envchk-${session.id}-${p.id}`, () => consoleApi.envCheck(session.id, p.id), pollMs)
  const notices = useLoad(`notice-${session.id}-${p.id}`, () => consoleApi.notices(session.id, p.id), pollMs)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const closed = session.phase === 'ENDED' || session.phase === 'CANCELED'
  const summary = summarizeEnvCheck(check.data?.result)
  const trimmed = text.trim()

  const send = () => {
    if (!trimmed || sending) return
    setSending(true)
    setSendError(null)
    consoleApi.sendNotice(session.id, p.id, trimmed).then(
      (n) => {
        setText('')
        setSending(false)
        notices.setData((list) => [...(list ?? []), n])
      },
      (e: unknown) => {
        setSending(false)
        setSendError(e instanceof Error ? e.message : String(e))
      },
    )
  }

  return (
    <section aria-label="환경 점검과 안내" className="mb-4 rounded-xl border border-line bg-panel p-4">
      <div className="flex items-center gap-2">
        <h3 className="text-[14px] font-semibold text-text">환경 점검</h3>
        {check.data && (
          <span className="rounded-full bg-panel-raised px-2 py-0.5 text-[12px] text-text-muted">
            {check.data.source === 'LIVE' ? '실시간 (점검 중)' : '저장된 결과'}
          </span>
        )}
        {check.data && <span className="ml-auto text-[12px] text-text-faint">{fmtTime(check.data.updatedAt)} 기준</span>}
      </div>

      {check.error && !check.data ? (
        <ErrorState compact message={check.error} onRetry={check.reload} className="mt-3" />
      ) : check.loading ? (
        <Loading className="py-6" />
      ) : !check.data ? (
        <p className="mt-3 text-[13px] text-text-muted">아직 점검을 시작하지 않았습니다. 응시자가 점검 화면에 들어오면 여기에 나타납니다.</p>
      ) : (
        <>
          <p className="mt-2 text-[13px] text-text-muted">
            실패 {summary.counts.fail} · 주의 {summary.counts.warn} · 통과 {summary.counts.pass}
            {summary.counts.pending > 0 && ` · 미완료 ${summary.counts.pending}`}
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {summary.items.map((i) => {
              const v = STATUS_VIEW[i.status]
              return (
                <li key={i.id} className="flex items-start gap-2 text-[13px]">
                  <v.Icon size={16} className={cx('mt-0.5 shrink-0', v.cls)} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-text">{i.label}</span>
                    <span className={cx('ml-1.5 text-[12px] font-semibold', v.cls)}>{v.text}</span>
                    {i.detail && <span className="mt-0.5 block text-text-muted">{i.detail}</span>}
                  </span>
                </li>
              )
            })}
          </ul>
        </>
      )}

      <div className="mt-4 border-t border-line pt-3">
        <label htmlFor={`notice-${p.id}`} className="text-[13px] font-semibold text-text">
          응시자에게 안내 보내기
        </label>
        <textarea
          id={`notice-${p.id}`}
          value={text}
          maxLength={NOTICE_MAX}
          rows={3}
          disabled={closed}
          onChange={(e) => setText(e.target.value)}
          placeholder={closed ? '끝났거나 취소된 회차에는 보낼 수 없습니다.' : '예: 조명이 어둡습니다. 스탠드를 켜고 다시 점검해 주세요.'}
          className="mt-1.5 w-full resize-none rounded-lg border border-line-strong bg-bg px-3 py-2 text-[13px] text-text disabled:opacity-50"
        />
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-[12px] text-text-faint">
            {text.length}/{NOTICE_MAX} · 응시자 화면에 배너로 뜨며 시험은 멈추지 않습니다
          </span>
          <Button size="sm" className="ml-auto" disabled={closed || sending || !trimmed} onClick={send}>
            <Send size={14} aria-hidden /> {sending ? '보내는 중' : '보내기'}
          </Button>
        </div>
        {sendError && (
          <p role="alert" className="mt-1.5 text-[12px] text-alert">
            {sendError}
          </p>
        )}

        {(notices.data ?? []).length > 0 && (
          <ul className="mt-3 flex flex-col gap-2" aria-label="보낸 안내">
            {[...(notices.data ?? [])].reverse().map((n) => (
              <li key={n.id} className="rounded-lg bg-panel-raised px-3 py-2 text-[13px]">
                <p className="break-words whitespace-pre-wrap text-text">{n.message}</p>
                <p className="mt-1 flex items-center gap-1.5 text-[12px] text-text-faint">
                  {fmtTime(n.sentAt)} 보냄 ·
                  {n.readAt ? (
                    <span className="inline-flex items-center gap-1 font-semibold text-signal">
                      <CheckCheck size={13} aria-hidden /> 읽음 {fmtTime(n.readAt)}
                    </span>
                  ) : (
                    <span>아직 읽지 않음</span>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
