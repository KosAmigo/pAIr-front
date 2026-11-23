// 콘솔(감독관·매니저)이 보낸 안내 메시지를 응시자 화면 위쪽에 띄운다.
// 시험을 막지 않는다: 화면 전체를 가리지 않고, 시간도 멈추지 않으며, 배너 밖은 그대로 눌린다. "확인"을 누르면 읽음이 서버에 남는다.
// 답장 기능은 없다 (일방향 안내).
import { useCallback, useEffect, useState } from 'react'
import { Megaphone } from 'lucide-react'
import { proctorApi, type InviteNotice } from '../api/proctorApi.ts'
import { unreadNotices } from '../check/envCheckSummary.ts'

/** 새 안내를 가져오는 간격 */
export const NOTICE_POLL_MS = 5000

export default function NoticeBanner({ invite }: { invite: string | null | undefined }) {
  const [notices, setNotices] = useState<InviteNotice[]>([])
  // 확인을 누른 직후 서버 응답을 기다리지 않고 바로 접는다 (다음 가져오기에서 서버 값으로 맞춰진다)
  const [dismissed, setDismissed] = useState<ReadonlySet<number>>(new Set())

  useEffect(() => {
    if (!invite) return
    let alive = true
    const load = () =>
      proctorApi.notices(invite).then(
        (list) => alive && setNotices(list),
        () => undefined, // 못 가져와도 시험은 계속된다. 다음 주기에 다시 가져온다
      )
    void load()
    const id = window.setInterval(load, NOTICE_POLL_MS)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [invite])

  const confirm = useCallback(
    (noticeId: number) => {
      if (!invite) return
      setDismissed((prev) => new Set(prev).add(noticeId))
      // 읽음 전송이 실패하면 다시 보이게 해서 한 번 더 누르게 한다
      proctorApi.readNotice(invite, noticeId).catch(() =>
        setDismissed((prev) => {
          const next = new Set(prev)
          next.delete(noticeId)
          return next
        }),
      )
    },
    [invite],
  )

  const shown = unreadNotices(notices).filter((n) => !dismissed.has(n.id))
  if (!invite || shown.length === 0) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[70] flex flex-col items-center gap-2 px-4" role="region" aria-label="감독관 안내">
      {shown.map((n) => (
        <div
          key={n.id}
          role="status"
          aria-live="polite"
          className="pointer-events-auto flex w-full max-w-[560px] items-start gap-3 rounded-xl border border-line-strong bg-panel px-4 py-3 shadow-lg"
        >
          <Megaphone size={18} className="mt-0.5 shrink-0 text-brand" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold text-text-muted">감독관 안내</p>
            <p className="mt-0.5 text-[14px] leading-5 break-words whitespace-pre-wrap text-text">{n.message}</p>
          </div>
          <button
            type="button"
            onClick={() => confirm(n.id)}
            className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-[13px] font-semibold text-on-accent hover:opacity-90"
          >
            확인
          </button>
        </div>
      ))}
    </div>
  )
}
