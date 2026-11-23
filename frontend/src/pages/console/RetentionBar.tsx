// 사진 삭제 예정 표시와 보관 연장 (회차 단위). 삭제 예정 2일 전부터 7일씩 최대 2번 연장할 수 있다.
import { useState } from 'react'
import { CalendarClock, Loader2 } from 'lucide-react'
import { canReviewProctor, useAuth } from '../../auth/auth'
import { cx } from '../../components/cx'
import { ErrorState } from '../../components/ErrorState'
import { Button } from '../../components/ui'
import { consoleApi } from '../../consoleApi'
import { useLoad } from '../../data/consoleSessions'
import { ConfirmModal } from './common'
import { retentionNotice } from './evidenceView'
import { fmtTime } from './format'

export function RetentionBar({ sessionId, className }: { sessionId: number; className?: string }) {
  const { user } = useAuth()
  const r = useLoad(`retention-${sessionId}`, () => consoleApi.retention(sessionId))
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (r.error && !r.data) return <ErrorState compact className={className} message={`보관 기간: ${r.error}`} onRetry={r.reload} />
  if (!r.data) return null
  const d = r.data
  const n = retentionNotice(d, Date.now())
  const allowed = canReviewProctor(user?.role)
  const disabledReason = !allowed ? '감독관·매니저만 연장할 수 있습니다' : n.extendHint
  const extend = () => {
    setBusy(true)
    setError(null)
    consoleApi.extendRetention(sessionId).then(
      (next) => {
        r.setData(() => next)
        setBusy(false)
        setConfirm(false)
      },
      (e: unknown) => {
        setBusy(false)
        setConfirm(false)
        setError(e instanceof Error ? e.message : String(e))
      },
    )
  }
  return (
    <div className={cx('flex flex-col gap-2 rounded-md border px-3 py-2 text-[13px]', n.tone === 'neutral' ? 'border-line bg-panel' : 'border-caution/40 bg-caution/10', className)}>
      <div className="flex items-center gap-2">
        <CalendarClock size={15} className="shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 break-keep">
          <strong className="font-semibold">{n.text}</strong>
          <span className="tnum ml-1 font-mono text-[12px] text-text-muted">
            ({fmtTime(d.expiresAt)}) · {n.usage}
          </span>
        </span>
        <Button size="sm" variant="secondary" disabled={!d.canExtend || !allowed || busy} title={disabledReason ?? undefined} onClick={() => setConfirm(true)}>
          {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null} {d.extensionDays}일 연장
        </Button>
      </div>
      {disabledReason && !n.expired && <p className="text-[12px] text-text-muted">{disabledReason}</p>}
      {d.history.length > 0 && (
        <ul className="text-[12px] text-text-muted">
          {d.history.map((h) => (
            <li key={h.seq} className="tnum font-mono">
              {h.seq}회 연장: {fmtTime(h.extendedAt)} (사용자 #{h.extendedBy}) → {fmtTime(h.expiresAfter)}까지
            </li>
          ))}
        </ul>
      )}
      {error && <ErrorState compact message={`연장하지 못했습니다: ${error}`} />}
      {confirm && (
        <ConfirmModal
          title="사진 보관을 연장할까요?"
          body={`이 회차의 모든 사진(이벤트 대표 사진·증거 구간)의 삭제 시각이 ${d.extensionDays}일 늦춰집니다. 최대 ${d.maxExtensions}번까지 연장할 수 있고, 누가 언제 연장했는지 기록됩니다.`}
          confirm={busy ? '처리 중' : '연장하기'}
          disabled={busy}
          onConfirm={extend}
          onClose={() => !busy && setConfirm(false)}
        />
      )}
    </div>
  )
}
