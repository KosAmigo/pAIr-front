// DESIGN.md §7-9-4a 감독 패널: 시험 시간 축 + 이벤트 카드 + 담당자 판단(문제 없음 / 부정 의심)
// 이벤트는 백엔드(응시자별 감독 이벤트)에서 불러오고, 판단은 바로 백엔드에 저장한다.
import { useEffect, useRef, useState } from 'react'
import {
  AppWindow,
  BellRing,
  BookOpen,
  Camera,
  ClipboardPaste,
  EyeOff,
  Film,
  Hand,
  Link2,
  ScreenShare,
  ScreenShareOff,
  Loader2,
  Maximize2,
  Monitor,
  MousePointer2,
  PersonStanding,
  ScanFace,
  Smartphone,
  Users,
  Volume2,
  VolumeX,
  ImageOff,
  ShieldCheck,
  ShieldAlert,
  Tablet,
  StickyNote,
  Watch,
  CirclePause,
  type LucideIcon,
  WifiOff,
  X,
} from 'lucide-react'
import { cx } from '../../components/cx'
import { ErrorState } from '../../components/ErrorState'
import { canReviewProctor, useAuth } from '../../auth/auth'
import { consoleApi, type EventReview, type EventType, type ParticipantView, type ProctorEventView, type SessionSummary } from '../../consoleApi'
import { useBlobUrl } from '../../data/blobUrl'
import { EVENT_LABEL, isCameraEvent, useLoad } from '../../data/consoleSessions'
import { LIVE_VIEW_ENABLED } from '../../proctor/features'
import { countUnconfirmed, serverCheckBadge } from '../../proctor/core/serverCheck'
import { Button } from '../../components/ui'
import { ConfirmModal, Modal } from './common'
import { fmtTime } from './format'
import { describeEvent } from './eventDetail'
import LiveWatch from './LiveWatch'
import { EvidenceClipModal } from './EvidenceClip'
import { StreamRangeModal } from './StreamRange'
import { Loading } from './Loading'
import NoticeSender from './NoticeSender'
import { RetentionBar } from './RetentionBar'
import { loadSoundPref, playAlertSound, saveSoundPref } from './alertSound'
import { useNewEvents } from './useNewEvents'

const ICON: Record<EventType, LucideIcon> = {
  TAB_HIDDEN: AppWindow,
  WINDOW_BLUR: EyeOff,
  MOUSE_LEAVE: MousePointer2,
  PASTE: ClipboardPaste,
  FULLSCREEN_EXIT: Maximize2,
  NO_FACE: ScanFace,
  MULTI_FACE: Users,
  HEAD_TURN: ScanFace,
  HEAD_DOWN: ScanFace,
  GAZE_AWAY: EyeOff,
  TORSO_SHIFT: PersonStanding,
  TORSO_TURN: PersonStanding,
  HAND_MISSING: Hand,
  HAND_MOVED: Hand,
  ARM_MOVE: Hand,
  PHONE: Smartphone,
  EXTRA_SCREEN: Monitor,
  BOOK: BookOpen,
  PHONE_DISCONNECTED: Smartphone,
  CONNECTION_LOST: WifiOff,
  LINK_EXPIRED: WifiOff,
  LINK_RESTORED: Link2,
  SCREEN_STOPPED: ScreenShareOff,
  SCREEN_PARTIAL: ScreenShare,
  SCREEN_RESTARTED: ScreenShare,
  HANDS_OUT: Hand,
  HAND_OUT_ONE: Hand,
  TABLET: Tablet,
  NOTE: StickyNote,
  SMARTWATCH: Watch,
  PHONE_MOVED: Smartphone,
  SUPERVISION_PAUSED: CirclePause,
}
const LOW = 0.8

const elapsed = (s: SessionSummary, iso: string) => {
  const sec = Math.max(0, Math.round((Date.parse(iso) - Date.parse(s.startsAt)) / 1000))
  return `${String(Math.floor(sec / 3600)).padStart(2, '0')}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`
}

type Filter = 'all' | 'open' | 'suspect'
const byTime = (list: ProctorEventView[]) => [...list].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))

export default function ProctorPanel({
  session,
  p,
  pollMs,
  className,
  onRestored,
}: {
  session: SessionSummary
  p: ParticipantView
  /** 주면 이 간격(ms)으로 이벤트를 다시 불러온다 (실시간 현황) */
  pollMs?: number
  className?: string
  /** 만료된 링크를 되살린 뒤 부른다. 대상자 목록(linkExpired)을 다시 불러오는 데 쓴다 */
  onRestored?: () => void
}) {
  const { user } = useAuth()
  const [filter, setFilter] = useState<Filter>('all')
  const [focus, setFocus] = useState<number | null>(null)
  const [photo, setPhoto] = useState<ProctorEventView | null>(null)
  const [clipFor, setClipFor] = useState<ProctorEventView | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [confirmRestore, setConfirmRestore] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  // 연결 유예를 넘겨 링크가 만료된 응시자는 매니저·감독관·관리자가 되살릴 수 있다 (시험 시간은 연장되지 않는다)
  const canRestore = canReviewProctor(user?.role) && session.phase === 'LIVE' && p.linkExpired && !p.submittedAt
  const loaded = useLoad(session.proctoring ? `pev-${session.id}-${p.id}` : null, () => consoleApi.participantEvents(session.id, p.id), pollMs)
  // 증거 구간(이벤트 앞 8초·뒤 4초 사진)이 있는 이벤트 → 장수
  const clips = useLoad(session.proctoring ? `clips-${session.id}` : null, () => consoleApi.clips(session.id), pollMs)
  const events = byTime(loaded.data ?? [])
  // 브라우저 이벤트는 이력만 보여 주므로 새 이벤트 알림·미확인 수에 세지 않는다 (판정 대상은 카메라 이벤트)
  const fresh = useNewEvents(`${session.id}-${p.id}`, loaded.data?.filter(isCameraEvent) ?? null)
  const [soundOn, setSoundOn] = useState(loadSoundPref)
  const alertedCount = useRef(0)
  const freshCount = fresh.items.length
  useEffect(() => {
    // 새 이벤트가 늘었을 때만 울린다 (확인해서 비워지거나 소리를 켜고 끌 때는 울리지 않는다)
    if (soundOn && freshCount > alertedCount.current) playAlertSound()
    alertedCount.current = freshCount
  }, [freshCount, soundOn])
  const toggleSound = () => {
    const next = !soundOn
    setSoundOn(next)
    saveSoundPref(next)
    if (next) playAlertSound() // 켜자마자 한 번 들려 줘서 소리가 나는지 확인하게 한다
  }
  const freshIds = new Set(fresh.items.map((e) => e.id))
  const latestFresh = fresh.items.length ? byTime(fresh.items)[fresh.items.length - 1] : null
  const unconfirmed = countUnconfirmed(events)
  const showFresh = () => {
    if (!latestFresh) return
    setFilter('all')
    setFocus(latestFresh.id)
    fresh.dismiss()
    // 필터를 '전체'로 돌린 뒤 카드가 그려지고 나서 움직인다
    window.setTimeout(() => document.getElementById(`ev-${latestFresh.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50)
  }
  const openCount = events.filter((e) => isCameraEvent(e) && !e.review).length
  const shown = events.filter((e) => (filter === 'open' ? isCameraEvent(e) && !e.review : filter === 'suspect' ? e.review === 'SUSPECT' : true))
  const span = Date.parse(session.endsAt) - Date.parse(session.startsAt)
  const pos = (iso: string) => Math.min(100, Math.max(0, ((Date.parse(iso) - Date.parse(session.startsAt)) / span) * 100))
  const review = (e: ProctorEventView, r: EventReview | null, note: string | undefined) => {
    setSaveError(null)
    consoleApi.review(session.id, e.id, r, note).then(
      // 저장하면 돌아온 이벤트로 바로 바꾼다
      (u) => loaded.setData((list) => list && list.map((x) => (x.id === u.id ? u : x))),
      (err: unknown) => setSaveError(err instanceof Error ? err.message : String(err)),
    )
  }

  const restore = () => {
    setRestoring(true)
    setRestoreError(null)
    consoleApi.restoreLink(session.id, p.id).then(
      () => {
        setRestoring(false)
        setConfirmRestore(false)
        loaded.reload()
        onRestored?.()
      },
      (err: unknown) => {
        setRestoring(false)
        setConfirmRestore(false)
        setRestoreError(err instanceof Error ? err.message : String(err))
      },
    )
  }

  return (
    <section className={cx('flex flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-md', className)} aria-label="감독 기록">
      <header className="border-b border-line bg-[linear-gradient(120deg,var(--color-brand-dim),transparent_70%)] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="label">PROCTORING</span>
          {unconfirmed > 0 && (
            <span className="rounded-sm bg-caution/15 px-1.5 py-0.5 text-[12px] font-semibold text-caution" title="서버가 사진에서 찾지 못한 이벤트입니다. 직접 확인해 주세요">
              서버 미확인 {unconfirmed}건
            </span>
          )}
          <span className={cx('tnum ml-auto font-mono text-[12px]', fresh.items.length ? 'font-semibold text-alert' : 'text-text-muted')}>이벤트 {events.length}건</span>
          <button
            type="button"
            onClick={toggleSound}
            aria-pressed={soundOn}
            aria-label={soundOn ? '새 이벤트 알림음 끄기' : '새 이벤트 알림음 켜기'}
            title={soundOn ? '알림음 켜짐 (누르면 끔)' : '알림음 꺼짐 (누르면 켬)'}
            className={cx('inline-flex size-7 items-center justify-center rounded-md hover:bg-panel-raised', soundOn ? 'text-brand' : 'text-text-faint')}
          >
            {soundOn ? <Volume2 size={15} aria-hidden /> : <VolumeX size={15} aria-hidden />}
          </button>
        </div>
        {latestFresh && (
          <div role="alert" className="mt-3 flex items-center gap-2 rounded-md border border-alert bg-alert/10 px-3 py-2 text-[13px] text-alert">
            <BellRing size={16} className="shrink-0 animate-pulse" aria-hidden />
            <span className="min-w-0 flex-1 break-keep">
              <strong className="font-semibold">새 이벤트{fresh.items.length > 1 && ` ${fresh.items.length}건`}</strong> · {EVENT_LABEL[latestFresh.type] ?? latestFresh.type}
              <span className="tnum ml-1 font-mono text-[12px]">{elapsed(session, latestFresh.startedAt)}</span>
            </span>
            <Button size="sm" variant="secondary" onClick={showFresh}>
              확인하기
            </Button>
            <button type="button" onClick={fresh.dismiss} aria-label="알림 닫기" className="inline-flex size-7 shrink-0 items-center justify-center rounded-md hover:bg-alert/15">
              <X size={15} aria-hidden />
            </button>
          </div>
        )}
        {session.proctoring ? (
          <p className="mt-1 text-[13px] text-text-muted">{p.enteredAt ? `${fmtTime(p.enteredAt)} 입장` : '아직 입장 전'}</p>
        ) : (
          <p className="mt-1 text-[13px] text-text-muted">감독을 쓰지 않은 회차입니다.</p>
        )}
        {session.proctoring && session.phase === 'ENDED' && <RetentionBar sessionId={session.id} serverVision={session.serverVision === true} className="mt-3" />}
        {canRestore && (
          <div role="alert" className="mt-3 flex items-center gap-2 rounded-md border border-alert/40 bg-alert/10 px-3 py-2 text-[13px] text-alert">
            <WifiOff size={16} className="shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 break-keep">연결이 5분 넘게 끊겨 입장 링크가 만료되었습니다.</span>
            <Button size="sm" variant="secondary" onClick={() => setConfirmRestore(true)}>
              링크 복구
            </Button>
          </div>
        )}
      </header>
      {session.proctoring && session.phase === 'LIVE' && p.enteredAt && !p.submittedAt && <NoticeSender key={p.id} sessionId={session.id} participantId={p.id} />}
      {restoreError && <ErrorState compact className="mx-4 mt-3" message={`링크를 되살리지 못했습니다: ${restoreError}`} />}

      {/* 실시간 영상: 스위치(LIVE_VIEW_ENABLED)가 켜져 있을 때만. 응시 중인 응시자만, 열었을 때만 응시자 PC 가 영상을 보낸다 */}
      {LIVE_VIEW_ENABLED && session.proctoring && session.phase === 'LIVE' && p.enteredAt && !p.submittedAt && <LiveWatch key={p.id} sessionId={session.id} participantId={p.id} />}
      {session.proctoring && loaded.error && <ErrorState compact className="m-4" message={loaded.error} onRetry={loaded.reload} />}
      {session.proctoring && loaded.loading && <Loading text="감독 이벤트를 불러오는 중" className="py-8" />}
      {saveError && <ErrorState compact className="mx-4 mt-3" message={`판단을 저장하지 못했습니다: ${saveError}`} />}

      {session.proctoring && loaded.data && (
        <>
          {/* 시험 시간 축 */}
          <div className="border-b border-line px-4 py-4">
            <div className="relative h-6">
              <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-panel-raised" />
              {events.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => {
                    setFilter('all')
                    setFocus(e.id)
                    document.getElementById(`ev-${e.id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
                  }}
                  aria-label={`${EVENT_LABEL[e.type]} ${elapsed(session, e.startedAt)}`}
                  title={`${EVENT_LABEL[e.type]} ${elapsed(session, e.startedAt)}`}
                  className={cx(
                    'absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 border-2 border-panel',
                    isCameraEvent(e) ? 'rounded-full bg-alert' : 'rotate-45 rounded-[2px] bg-caution',
                    focus === e.id && 'ring-2 ring-brand',
                    freshIds.has(e.id) && 'animate-pulse ring-2 ring-alert',
                  )}
                  style={{ left: `${pos(e.startedAt)}%` }}
                />
              ))}
            </div>
            <div className="tnum mt-1 flex justify-between font-mono text-[11px] text-text-faint">
              <span>00:00</span>
              <span>{Math.round(span / 60_000)}분</span>
            </div>
          </div>

          <div role="radiogroup" aria-label="이벤트 거르기" className="flex gap-1.5 px-4 pt-3">
            {(
              [
                ['all', `전체 ${events.length}`],
                ['open', `미확인 ${openCount}`],
                ['suspect', `부정 의심 ${events.filter((e) => e.review === 'SUSPECT').length}`],
              ] as const
            ).map(([v, l]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={filter === v}
                onClick={() => setFilter(v)}
                className={cx('h-7 rounded-full px-3 text-[13px] font-medium', filter === v ? 'bg-brand-dim text-brand' : 'bg-panel-raised text-text-muted hover:text-text')}
              >
                {l}
              </button>
            ))}
          </div>

          <ol className="fx-cards flex flex-col gap-3 p-4">
            {shown.length === 0 && <li className="py-8 text-center text-[14px] text-text-muted">{events.length ? '조건에 맞는 이벤트가 없습니다.' : '감독 이벤트가 없습니다.'}</li>}
            {shown.map((e) => (
              <EventCard key={e.id} e={e} time={elapsed(session, e.startedAt)} focused={focus === e.id} fresh={freshIds.has(e.id)} clipCount={clips.data?.[String(e.id)] ?? 0} serverVision={session.serverVision === true} onClip={() => setClipFor(e)} onPhoto={() => setPhoto(e)} onReview={(r, note) => review(e, r, note)} />
            ))}
          </ol>
        </>
      )}

      {confirmRestore && (
        <ConfirmModal
          title={`${p.name}님의 링크를 되살릴까요?`}
          body="응시자가 같은 링크로 다시 들어와 이어서 풀 수 있습니다. 종료 시각은 그대로이고 끊긴 동안 흐른 시간은 돌려주지 않습니다. 누가 되살렸는지는 감독 기록에 남습니다."
          confirm={restoring ? '처리 중' : '되살리기'}
          disabled={restoring}
          onConfirm={restore}
          onClose={() => !restoring && setConfirmRestore(false)}
        />
      )}

      {clipFor && clipFor.type === 'SUPERVISION_PAUSED' && <StreamRangeModal sessionId={session.id} participantId={p.id} event={clipFor} onClose={() => setClipFor(null)} />}
      {clipFor && clipFor.type !== 'SUPERVISION_PAUSED' && <EvidenceClipModal sessionId={session.id} eventId={clipFor.id} title={EVENT_LABEL[clipFor.type] ?? clipFor.type} onClose={() => setClipFor(null)} />}
      {photo && (
        <Modal title={`${EVENT_LABEL[photo.type]} 스냅샷`} onClose={() => setPhoto(null)} actions={null}>
          <Snapshot sessionId={session.id} eventId={photo.id} />
          <p className="tnum mt-3 font-mono text-[13px]">
            {elapsed(session, photo.startedAt)}
            {photo.confidence != null && ` │ 확신도 ${photo.confidence.toFixed(2)}`}
          </p>
        </Modal>
      )}
    </section>
  )
}

function EventCard({
  e,
  time,
  focused,
  fresh,
  clipCount,
  serverVision,
  onClip,
  onPhoto,
  onReview,
}: {
  e: ProctorEventView
  time: string
  focused: boolean
  /** 방금 들어와 아직 확인하지 않은 이벤트 */
  fresh: boolean
  /** 증거 구간 사진 장수 (0 이면 없음) */
  clipCount: number
  /** 서버 추론 회차: 사진이 이벤트를 연 순간에 승격되므로 사진 수를 모르는 채로도 구간 보기를 연다 */
  serverVision: boolean
  onClip: () => void
  onPhoto: () => void
  onReview: (r: EventReview | null, note: string | undefined) => void
}) {
  const { user } = useAuth()
  // 판단은 감독관·매니저·관리자 (모든 콘솔 권한). 권한이 늘면 canReviewProctor 에서 막는다
  const canReview = canReviewProctor(user?.role)
  const [note, setNote] = useState(e.reviewNote ?? '')
  const Icon = ICON[e.type] ?? Camera
  const low = e.confidence != null && e.confidence < LOW
  const cam = isCameraEvent(e)
  const detailLines = describeEvent(e.type, e.detail)
  const check = serverCheckBadge(e)
  return (
    <li
      id={`ev-${e.id}`}
      className={cx(
        'relative overflow-hidden rounded-md border bg-panel transition-shadow',
        focused ? 'border-brand shadow-md' : 'border-line',
        cam && !e.review && 'border-l-2 border-l-caution',
        fresh && 'ring-2 ring-alert',
      )}
    >
      <div className={cx('flex gap-3 p-3', low && 'opacity-60')}>
        <span className={cx('inline-flex size-9 shrink-0 items-center justify-center rounded-md', cam ? 'bg-alert/10 text-alert' : 'bg-caution/10 text-caution')}>
          <Icon size={18} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[15px] font-semibold text-text">{EVENT_LABEL[e.type] ?? e.type}</p>
            {fresh && <span className="rounded-sm bg-alert px-1.5 text-[11px] font-bold text-white">NEW</span>}
            {low && <span className="rounded-sm bg-panel-raised px-1.5 text-[11px] font-semibold text-text-muted">확신도 낮음</span>}
            {check && (
              <span
                title={check.hint}
                className={cx(
                  'rounded-sm px-1.5 text-[11px] font-semibold',
                  check.tone === 'caution' && 'bg-caution/15 text-caution',
                  check.tone === 'signal' && 'bg-signal/10 text-signal',
                  check.tone === 'neutral' && 'bg-panel-raised text-text-muted',
                )}
              >
                {check.label}
              </span>
            )}
          </div>
          <p className="tnum font-mono text-[12px] text-text-muted">
            {time}
            {e.durationMs > 0 && ` │ ${(e.durationMs / 1000).toFixed(e.durationMs < 10000 ? 1 : 0)}초`}
            {e.confidence != null && ` │ 확신도 ${e.confidence.toFixed(2)}`}
          </p>
          {detailLines.map((line) => (
            <p key={line} className="mt-1 text-[13px] break-keep text-text">
              {line}
            </p>
          ))}
          {(clipCount > 0 || e.type === 'SUPERVISION_PAUSED' || (serverVision && cam)) && (
            <button type="button" onClick={onClip} className="mt-1.5 inline-flex items-center gap-1 text-[13px] font-semibold text-brand hover:underline">
              <Film size={14} aria-hidden /> {e.type === 'SUPERVISION_PAUSED' ? '이 구간 사진 보기 (AI 감독이 멈춘 동안의 웹캠 사진)' : clipCount > 0 ? `증거 구간 보기 (${clipCount}장)` : '증거 구간 보기'}
            </button>
          )}
        </div>
        {e.snapshot && (
          <button
            type="button"
            onClick={onPhoto}
            disabled={e.snapshot === 'deleted'}
            aria-label={e.snapshot === 'deleted' ? '보관 기간이 지나 삭제된 스냅샷' : '스냅샷 크게 보기'}
            title={e.snapshot === 'deleted' ? '보관 기간이 지나 삭제됨' : '크게 보기'}
            className="w-24 shrink-0 overflow-hidden rounded-sm disabled:cursor-not-allowed"
          >
            {e.snapshot === 'deleted' ? (
              <span className="flex aspect-video flex-col items-center justify-center gap-0.5 bg-panel-raised text-[10px] leading-3 text-text-faint">
                <ImageOff size={14} aria-hidden />
                사진 없음 · 보관 기간 삭제
              </span>
            ) : (
              <span className="flex aspect-video w-full items-center justify-center bg-panel-raised text-text-faint">
                <Camera size={16} aria-hidden />
              </span>
            )}
          </button>
        )}
        {!e.snapshot && e.snapshotMissing && (
          <span
            className="flex aspect-video w-24 shrink-0 flex-col items-center justify-center gap-0.5 rounded-sm bg-panel-raised text-center text-[10px] leading-3 text-text-faint"
            title={MISSING_SNAPSHOT[e.snapshotMissing].hint}
          >
            <ImageOff size={14} aria-hidden />
            {MISSING_SNAPSHOT[e.snapshotMissing].label}
          </span>
        )}
      </div>
      {cam && (
      <div className="border-t border-line bg-panel-raised/50 px-3 py-2.5">
        <div role="radiogroup" aria-label="판단" className="flex gap-2">
          {(
            [
              ['OK', '문제 없음', ShieldCheck, 'border-signal bg-signal/10 text-signal'],
              ['SUSPECT', '부정 의심', ShieldAlert, 'border-alert bg-alert/10 text-alert'],
            ] as const
          ).map(([v, l, I, on]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={e.review === v}
              disabled={!canReview}
              title={canReview ? undefined : '감독관만 판단할 수 있습니다'}
              onClick={() => onReview(e.review === v ? null : v, note || undefined)}
              className={cx(
                'inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                e.review === v ? on : 'border-line-strong bg-panel text-text-muted hover:text-text',
              )}
            >
              <I size={15} aria-hidden /> {l}
            </button>
          ))}
        </div>
        <input
          aria-label="판단 메모"
          value={note}
          onChange={(x) => setNote(x.target.value)}
          onBlur={() => e.review && note !== (e.reviewNote ?? '') && onReview(e.review, note)}
          readOnly={!canReview}
          placeholder={canReview ? '메모 (선택)' : '감독관만 판단할 수 있습니다'}
          className="mt-2 h-8 w-full rounded-sm border border-line bg-panel px-2 text-[13px] outline-none focus:border-brand"
        />
        {e.review && e.reviewedAt && (
          <p className="tnum mt-1.5 font-mono text-[11px] text-text-faint">
            {e.reviewedBy != null && `검토자 #${e.reviewedBy} │ `}
            {fmtTime(e.reviewedAt)}
          </p>
        )}
      </div>
      )}
    </li>
  )
}

/** 사진이 없는 이유 (보관 기간 삭제는 snapshot === 'deleted' 로 따로 보여 준다) */
const MISSING_SNAPSHOT = {
  LIMIT_EXCEEDED: { label: '사진 없음 · 상한 초과', hint: '한 응시자당 사진 상한(300장)을 넘어 서버가 사진을 받지 않았습니다. 이벤트 기록은 남아 있습니다' },
  UPLOAD_FAILED: { label: '사진 없음 · 업로드 실패', hint: '사진이 서버에 올라가지 못했습니다 (네트워크 오류, 브라우저 보관 한도 초과 등). 이벤트 기록은 남아 있습니다' },
} as const

/** 스냅샷 사진: 로그인 헤더가 필요해 blob URL 로 받는다. 닫으면 URL 을 풀어 준다 */
function Snapshot({ sessionId, eventId }: { sessionId: number; eventId: number }) {
  const b = useBlobUrl(['snapshot', sessionId, eventId], () => consoleApi.snapshotBlob(sessionId, eventId))
  const cur = { url: b.url ?? undefined, error: b.error == null ? undefined : b.error instanceof Error ? b.error.message : String(b.error) }
  if (cur?.url) return <img src={cur.url} alt="감독 스냅샷" className="w-full rounded-md" />
  return (
    <span className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-md bg-panel-raised px-4 text-center text-[13px] text-text-muted">
      {cur?.error ? (
        <>
          <ImageOff size={28} aria-hidden /> 사진을 불러오지 못했습니다 ({cur.error})
        </>
      ) : (
        <>
          <Loader2 size={24} className="animate-spin text-brand" aria-hidden /> 사진을 불러오는 중
        </>
      )}
    </span>
  )
}
