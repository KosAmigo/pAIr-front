// 이벤트 앞뒤 증거 구간 타임라인: 웹캠 사진을 시간순으로 훑어보고 크게 본다 (예전 기록에 휴대폰 사진이 있으면 함께 보인다).
// 사진은 로그인 헤더가 필요해 blob URL 로 받는다 (모달을 열면 구간 사진을 모두 받는다. 웹캠 최대 12장, 장당 약 14KB).
import { useEffect, useState } from 'react'
import { ImageOff, Loader2 } from 'lucide-react'
import { cx } from '../../components/cx'
import { ErrorState } from '../../components/ErrorState'
import { consoleApi, type ClipFrameView } from '../../consoleApi'
import { useLoad } from '../../data/consoleSessions'
import { Modal } from './common'
import { nearestToEvent, offsetLabel, splitBySource } from './evidenceView'
import { Loading } from './Loading'

function useFrameImage(sessionId: number, eventId: number, frame: ClipFrameView) {
  const [state, setState] = useState<{ id: number; url?: string; error?: string } | null>(null)
  useEffect(() => {
    if (frame.deleted) return
    let alive = true
    let url: string | undefined
    consoleApi.clipImageUrl(sessionId, eventId, frame.id).then(
      (u) => {
        if (!alive) return URL.revokeObjectURL(u)
        url = u
        setState({ id: frame.id, url: u })
      },
      (e: unknown) => alive && setState({ id: frame.id, error: e instanceof Error ? e.message : String(e) }),
    )
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [sessionId, eventId, frame.id, frame.deleted])
  return state?.id === frame.id ? state : null
}

function Thumb({ sessionId, eventId, frame, selected, nearestId, onPick }: { sessionId: number; eventId: number; frame: ClipFrameView; selected: boolean; nearestId: number | null; onPick: () => void }) {
  const img = useFrameImage(sessionId, eventId, frame)
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={frame.deleted}
      aria-label={`${frame.source === 'PC_CAM' ? '웹캠' : '휴대폰'} ${offsetLabel(frame.offsetMs)} 사진`}
      className={cx('w-24 shrink-0 overflow-hidden rounded-sm border text-[11px]', selected ? 'border-brand ring-2 ring-brand' : 'border-line', frame.deleted && 'cursor-not-allowed')}
    >
      <span className="flex aspect-video items-center justify-center bg-panel-raised text-text-faint">
        {frame.deleted ? <ImageOff size={14} aria-hidden /> : img?.url ? <img src={img.url} alt="" className="size-full object-cover" /> : img?.error ? <ImageOff size={14} aria-hidden /> : <Loader2 size={14} className="animate-spin" aria-hidden />}
      </span>
      <span className={cx('tnum block px-1 py-0.5 text-center font-mono', nearestId === frame.id ? 'font-semibold text-alert' : 'text-text-muted')}>{offsetLabel(frame.offsetMs)}</span>
    </button>
  )
}

function Row({ title, frames, ...rest }: { title: string; frames: ClipFrameView[]; sessionId: number; eventId: number; selectedId: number | null; nearestId: number | null; onPick: (f: ClipFrameView) => void }) {
  return (
    <div>
      <p className="mb-1 text-[13px] font-semibold text-text">
        {title} <span className="font-normal text-text-muted">{frames.length}장</span>
      </p>
      {frames.length === 0 ? (
        <p className="rounded-sm bg-panel-raised px-3 py-3 text-[13px] text-text-muted">이 채널의 사진이 없습니다.</p>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {frames.map((f) => (
            <Thumb key={f.id} sessionId={rest.sessionId} eventId={rest.eventId} frame={f} selected={rest.selectedId === f.id} nearestId={rest.nearestId} onPick={() => rest.onPick(f)} />
          ))}
        </div>
      )}
    </div>
  )
}

function Big({ sessionId, eventId, frame }: { sessionId: number; eventId: number; frame: ClipFrameView }) {
  const img = useFrameImage(sessionId, eventId, frame)
  if (img?.url) return <img src={img.url} alt={`${offsetLabel(frame.offsetMs)} 사진`} className="max-h-[360px] w-full rounded-md object-contain" />
  return (
    <span className="flex aspect-video w-full items-center justify-center rounded-md bg-panel-raised text-[13px] text-text-muted">
      {img?.error ? `사진을 불러오지 못했습니다 (${img.error})` : <Loader2 size={22} className="animate-spin text-brand" aria-hidden />}
    </span>
  )
}

/** 증거 구간 보기 (이벤트 앞 8초·뒤 4초). 확정/기각은 이벤트 카드에서 한다 */
export function EvidenceClipModal({ sessionId, eventId, title, onClose }: { sessionId: number; eventId: number; title: string; onClose: () => void }) {
  const clip = useLoad(`clip-${sessionId}-${eventId}`, () => consoleApi.eventClip(sessionId, eventId))
  const [picked, setPicked] = useState<ClipFrameView | null>(null)
  const frames = clip.data?.frames ?? []
  const { pc, phone } = splitBySource(frames)
  const nearest = nearestToEvent(frames)
  const current = picked ?? nearest
  const allDeleted = frames.length > 0 && frames.every((f) => f.deleted)
  return (
    <Modal title={`${title} 증거 구간`} onClose={onClose} actions={null}>
      {clip.error && <ErrorState compact message={clip.error} onRetry={clip.reload} />}
      {clip.loading && <Loading text="증거 구간을 불러오는 중" className="py-8" />}
      {clip.data && frames.length === 0 && <p className="py-6 text-center text-[14px]">저장된 증거 구간이 없습니다.</p>}
      {allDeleted && <p className="rounded-sm bg-panel-raised px-3 py-2 text-[13px]">보관 기간이 지나 사진이 삭제되었습니다.</p>}
      {frames.length > 0 && (
        <div className="flex flex-col gap-3">
          {current && !current.deleted && <Big sessionId={sessionId} eventId={eventId} frame={current} />}
          <p className="text-[12px] text-text-muted">0초가 이벤트가 감지된 시각이고, 붉은 글씨가 그 시각에 가장 가까운 사진입니다. 앞 8초·뒤 4초 안의 사진만 보관합니다.</p>
          <Row title="웹캠" frames={pc} sessionId={sessionId} eventId={eventId} selectedId={current?.id ?? null} nearestId={nearest?.id ?? null} onPick={setPicked} />
          {/* 휴대폰 사진은 더 이상 모으지 않는다. 예전에 저장된 구간에만 있을 때 보여 준다 */}
          {phone.length > 0 && <Row title="휴대폰 (이전 기록)" frames={phone} sessionId={sessionId} eventId={eventId} selectedId={current?.id ?? null} nearestId={nearest?.id ?? null} onPick={setPicked} />}
        </div>
      )}
    </Modal>
  )
}
