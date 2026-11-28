// 감독 중단 구간 사진 열람: AI 감독이 멈춘 동안의 웹캠·휴대폰 사진을 초 단위로 훑어본다.
// 열 수 있는 범위는 그 감독 중단 이벤트의 시작~끝뿐이다 (서버가 밖이면 403). 열람은 서버에 기록된다.
// 사진은 한 번에 한 장만 받는다 (구간이 길면 수백 장이라 모두 받지 않는다).
import { useCallback, useEffect, useState } from 'react'
import { ImageOff, Loader2 } from 'lucide-react'
import { cx } from '../../components/cx'
import { ErrorState } from '../../components/ErrorState'
import { Button } from '../../components/ui'
import { consoleApi, type ProctorEventView, type StreamChannel } from '../../consoleApi'
import { Modal } from './common'
import { fmtTime } from './format'

const CHANNELS: { id: StreamChannel; label: string }[] = [
  { id: 'webcam', label: '웹캠' },
  { id: 'phone', label: '휴대폰' },
]

type Frame = { t: string; n: number }

/** 목록 한 쪽을 받아 이어 붙인다. 채널을 바꾸면 처음부터 */
function useStreamFrames(sessionId: number, participantId: number, eventId: number, channel: StreamChannel) {
  const [frames, setFrames] = useState<Frame[]>([])
  const [next, setNext] = useState<string | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let alive = true
    consoleApi.streamFrames(sessionId, participantId, eventId, channel).then(
      (r) => {
        if (!alive) return
        setFrames(r.frames)
        setNext(r.next)
        setState('ready')
      },
      (e: unknown) => {
        if (!alive) return
        setError(e instanceof Error ? e.message : String(e))
        setState('error')
      },
    )
    return () => {
      alive = false
      setState('loading')
      setFrames([])
      setNext(null)
    }
  }, [sessionId, participantId, eventId, channel, reloadKey])

  const more = useCallback(() => {
    if (!next) return
    consoleApi.streamFrames(sessionId, participantId, eventId, channel, next).then(
      (r) => {
        setFrames((cur) => [...cur, ...r.frames])
        setNext(r.next)
      },
      (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    )
  }, [sessionId, participantId, eventId, channel, next])

  return { frames, hasMore: next !== null, state, error, more, reload: () => setReloadKey((n) => n + 1) }
}

function FrameView({ sessionId, participantId, eventId, channel, frame }: { sessionId: number; participantId: number; eventId: number; channel: StreamChannel; frame: Frame }) {
  const [img, setImg] = useState<{ t: string; url?: string; error?: string } | null>(null)
  useEffect(() => {
    let alive = true
    let url: string | undefined
    consoleApi.streamFrameUrl(sessionId, participantId, eventId, channel, frame.t).then(
      (u) => {
        if (!alive) return URL.revokeObjectURL(u)
        url = u
        setImg({ t: frame.t, url: u })
      },
      (e: unknown) => alive && setImg({ t: frame.t, error: e instanceof Error ? e.message : String(e) }),
    )
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [sessionId, participantId, eventId, channel, frame.t])
  const cur = img?.t === frame.t ? img : null
  if (cur?.url) return <img src={cur.url} alt={`${fmtTime(frame.t)} 사진`} className="max-h-[360px] w-full rounded-md object-contain" />
  return (
    <span className="flex aspect-video w-full items-center justify-center rounded-md bg-panel-raised text-[13px] text-text-muted">
      {cur?.error ? (
        <span className="flex items-center gap-1">
          <ImageOff size={16} aria-hidden /> 사진을 불러오지 못했습니다 ({cur.error})
        </span>
      ) : (
        <Loader2 size={22} className="animate-spin text-brand" aria-hidden />
      )}
    </span>
  )
}

export function StreamRangeModal({ sessionId, participantId, event, onClose }: { sessionId: number; participantId: number; event: ProctorEventView; onClose: () => void }) {
  const [channel, setChannel] = useState<StreamChannel>('webcam')
  const [index, setIndex] = useState(0)
  const s = useStreamFrames(sessionId, participantId, event.id, channel)
  const frame = s.frames[Math.min(index, Math.max(0, s.frames.length - 1))]
  return (
    <Modal title="감독 중단 구간 사진" onClose={onClose} actions={null}>
      <div className="flex flex-col gap-3">
        <p className="text-[13px] leading-5 break-keep text-text-muted">
          AI 감독이 멈춘 동안({fmtTime(event.startedAt)}부터)의 사진입니다. 이 구간 밖의 사진은 열 수 없고, 사진을 여는 기록은 서버에 남습니다. 휴대폰 영상은 실시간으로 볼 수 없습니다.
        </p>
        <div role="tablist" aria-label="채널" className="flex gap-1">
          {CHANNELS.map((c) => (
            <button
              key={c.id}
              role="tab"
              type="button"
              aria-selected={channel === c.id}
              onClick={() => {
                setChannel(c.id)
                setIndex(0)
              }}
              className={cx('rounded-md border px-3 py-1 text-[13px] font-semibold', channel === c.id ? 'border-brand bg-brand-dim text-brand' : 'border-line text-text-muted')}
            >
              {c.label}
            </button>
          ))}
        </div>
        {s.state === 'loading' && <p className="py-6 text-center text-[14px]">사진 목록을 불러오는 중입니다</p>}
        {s.state === 'error' && <ErrorState compact message={s.error} onRetry={s.reload} />}
        {s.state === 'ready' && s.frames.length === 0 && <p className="py-6 text-center text-[14px]">이 채널에 저장된 사진이 없습니다.</p>}
        {s.state === 'ready' && frame && (
          <>
            <FrameView sessionId={sessionId} participantId={participantId} eventId={event.id} channel={channel} frame={frame} />
            <label className="flex items-center gap-3 text-[13px] text-text-muted">
              <span className="tnum w-28 shrink-0 font-mono text-text">{fmtTime(frame.t)}</span>
              <input
                type="range"
                min={0}
                max={s.frames.length - 1}
                value={Math.min(index, s.frames.length - 1)}
                onChange={(e) => setIndex(Number(e.target.value))}
                aria-label="사진 시각"
                className="min-w-0 flex-1"
              />
              <span className="tnum shrink-0 font-mono">
                {Math.min(index, s.frames.length - 1) + 1}/{s.frames.length}
                {s.hasMore ? '+' : ''}
              </span>
            </label>
            {s.hasMore && (
              <Button size="sm" variant="secondary" className="self-start" onClick={s.more}>
                다음 구간 더 불러오기
              </Button>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
