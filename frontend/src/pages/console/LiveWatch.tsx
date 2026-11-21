// 감독관 실시간 영상 보기 (5단계). 열었을 때만 응시자 PC 가 휴대폰·웹캠·화면 공유 영상을 보내고, 닫거나 화면을 떠나면 멈춘다.
// 감독관은 한 번에 응시자 한 명만 본다 (ProctorPanel 이 key={참가자}로 쓰므로 다른 응시자를 열면 이전 연결이 닫힌다).
// 영상은 이 브라우저에서 보여 주기만 하고 서버에도, 이 브라우저에도 저장하지 않는다.
import { useEffect, useReducer, useRef, useState } from 'react'
import { Loader2, Video, VideoOff } from 'lucide-react'
import { cx } from '../../components/cx'
import { VIEW_CHANNELS, VIEW_CHANNEL_LABEL, type ViewChannel } from '../../proctor/relay/viewerSignal'
import { ViewerSession } from '../../proctor/watch/ViewerSession'
import { CHANNEL_TEXT, WATCH_IDLE, reduceWatch, watchStatusText, type ChannelPhase } from '../../proctor/watch/watchState'

type Streams = Record<ViewChannel, MediaStream | null>
const NO_STREAMS: Streams = { phone: null, webcam: null, screen: null }

export default function LiveWatch({ sessionId, participantId }: { sessionId: number; participantId: number }) {
  const [open, setOpen] = useState(false)
  const [state, dispatch] = useReducer(reduceWatch, WATCH_IDLE)
  const [streams, setStreams] = useState<Streams>(NO_STREAMS)

  useEffect(() => {
    if (!open) return
    dispatch({ type: 'open' })
    const session = new ViewerSession({ sessionId, participantId }, dispatch, (channel, stream) => setStreams((s) => (s[channel] === stream ? s : { ...s, [channel]: stream })))
    return () => {
      // 닫기·응시자 바꾸기·화면 이동: 서버에 unwatch 를 보내 응시자 쪽 전송을 멈춘다
      session.close()
      dispatch({ type: 'close' })
      setStreams(NO_STREAMS)
    }
  }, [open, sessionId, participantId])

  const text = watchStatusText(state)
  const connecting = state.phase === 'connecting' || (state.phase === 'watching' && text !== null)
  const retryable = state.phase === 'denied' || state.phase === 'full' || state.phase === 'error'

  return (
    <div className="border-b border-line px-4 py-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-pressed={open}
          className={cx(
            'inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-[13px] font-semibold transition-colors',
            open ? 'border-brand bg-brand-dim text-brand' : 'border-line-strong bg-panel text-text-muted hover:text-text',
          )}
        >
          {open ? <VideoOff size={15} aria-hidden /> : <Video size={15} aria-hidden />}
          {open ? '영상 닫기' : '영상 보기'}
        </button>
        {open && connecting && <Loader2 size={15} className="animate-spin text-brand" aria-hidden />}
        {open && text && (
          <p role="status" className="text-[13px] text-text-muted">
            {text}
          </p>
        )}
        {open && retryable && (
          <button
            type="button"
            onClick={() => {
              setOpen(false)
              setTimeout(() => setOpen(true), 0)
            }}
            className="h-7 rounded-md border border-line-strong px-2 text-[12px] font-semibold text-text-muted hover:text-text"
          >
            다시 시도
          </button>
        )}
      </div>
      {!open && <p className="mt-1.5 text-[12px] text-text-faint">열 때만 응시자 PC가 영상을 보냅니다. 영상은 저장되지 않습니다.</p>}
      {open && (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {VIEW_CHANNELS.map((c) => (
            <VideoTile key={c} channel={c} stream={streams[c]} phase={state.channels[c]} />
          ))}
        </div>
      )}
    </div>
  )
}

function VideoTile({ channel, stream, phase }: { channel: ViewChannel; stream: MediaStream | null; phase: ChannelPhase }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const v = ref.current
    if (!v) return
    v.srcObject = stream
    if (stream) void v.play().catch(() => undefined)
  }, [stream])
  return (
    <figure className="flex flex-col gap-1">
      <div className="relative aspect-video overflow-hidden rounded-md bg-panel-raised">
        <video ref={ref} autoPlay muted playsInline aria-label={`${VIEW_CHANNEL_LABEL[channel]} 영상`} className={cx('size-full object-contain', !stream && 'invisible')} />
        {!stream && (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-2 text-center text-[12px] text-text-muted">
            {phase === 'connecting' || phase === 'waiting' ? <Loader2 size={16} className="animate-spin text-brand" aria-hidden /> : <VideoOff size={16} aria-hidden />}
            {CHANNEL_TEXT[phase]}
          </span>
        )}
      </div>
      <figcaption className="text-[12px] font-medium text-text-muted">{VIEW_CHANNEL_LABEL[channel]}</figcaption>
    </figure>
  )
}
