// 콘솔 "점검 미통과" 탭: 환경 점검에서 실패한 항목이 있는데도 입장한 응시자를 모아 보여 준다.
// 환경 점검 내용(점검 결과·안내 보내기·점검 사진)은 응시자 서랍이 아니라 이 탭에서만 본다. 회차 단계와 상관없이 행을 누르면 아래에 연다.
import { useState } from 'react'
import { Eye, MailCheck } from 'lucide-react'
import { ErrorState } from '../../components/ErrorState'
import { consoleApi, type EnvCheckFailureView, type ParticipantView, type SessionSummary } from '../../consoleApi'
import { useLoad } from '../../data/consoleSessions'
import EnvCheckCard from './EnvCheckCard'
import { EnvScanSection } from './EnvScanSection'
import { fmtShort } from './format'
import { Loading } from './Loading'

const POLL_MS = 5000

/** 점검 사진(방 360도·책상 위). 없으면 아무것도 그리지 않는다 */
function ScanPhotos({ s, participantId }: { s: SessionSummary; participantId: number }) {
  const scan = useLoad(`env-${s.id}-${participantId}`, () => consoleApi.envScanPhotos(s.id, participantId))
  if (!scan.data || scan.data.length === 0) return null
  return (
    <section className="rounded-md border border-line bg-panel shadow-sm">
      <EnvScanSection sessionId={s.id} photos={scan.data} />
    </section>
  )
}

export default function EnvFailures({ s, participants }: { s: SessionSummary; participants: ParticipantView[] }) {
  const list = useLoad(`envfail-${s.id}`, () => consoleApi.envCheckFailures(s.id), POLL_MS)
  const [selected, setSelected] = useState<number | null>(null)
  const rows = list.data ?? []
  const chosen = selected == null ? undefined : participants.find((p) => p.id === selected)

  const open = (r: EnvCheckFailureView) => setSelected(selected === r.participantId ? null : r.participantId)

  if (list.error && !list.data) return <ErrorState compact message={list.error} onRetry={list.reload} />
  if (!list.data) return <Loading />

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-md border border-line bg-panel shadow-sm">
        <header className="flex items-center gap-2 border-b border-line px-4 py-3">
          <h2 className="text-[15px] font-semibold text-text">점검 미통과 입장자</h2>
          <span className="tnum font-mono text-[13px] text-text-muted">{rows.length}명</span>
          <span className="ml-auto text-[12px] text-text-faint">점검에서 실패한 항목이 있는데도 입장한 응시자입니다</span>
        </header>
        {rows.length === 0 ? (
          <p className="py-16 text-center text-[14px] text-text-muted">점검에 실패한 채 입장한 응시자가 없습니다.</p>
        ) : (
          <table className="w-full text-[14px]">
            <thead>
              <tr className="h-9 border-b border-line text-left">
                {['응시자', '실패한 항목', '입장', '안내', ''].map((h) => (
                  <th key={h} className="px-4 text-[13px] font-semibold text-text-muted">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.participantId} className="border-b border-line align-top last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium text-text">{r.name}</p>
                    <p className="font-mono text-[12px] text-text-muted">{r.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <ul className="flex flex-col gap-1">
                      {r.failed.map((f) => (
                        <li key={f.id} className="text-[13px]">
                          <span className="font-semibold text-alert">{f.label}</span>
                          {f.detail && <span className="text-text-muted"> · {f.detail}</span>}
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="tnum px-4 py-3 font-mono text-[13px] text-text">{fmtShort(r.enteredAt)}</td>
                  <td className="px-4 py-3 text-[13px]">
                    {r.noticeSent ? (
                      <span className="inline-flex items-center gap-1 text-signal">
                        <MailCheck size={14} aria-hidden /> 보냄
                      </span>
                    ) : (
                      <span className="text-text-faint">안 보냄</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => open(r)}
                      aria-label={`${r.name} 점검 결과 보기`}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[13px] font-semibold text-brand hover:bg-panel-raised"
                    >
                      <Eye size={14} aria-hidden /> 점검 결과
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {chosen && (
        <>
          <EnvCheckCard session={s} p={chosen} pollMs={POLL_MS} />
          <ScanPhotos s={s} participantId={chosen.id} />
        </>
      )}
    </div>
  )
}
