// DESIGN.md §7-9-4a 감독 패널: 시험 시간 축 + 이벤트 카드 + 담당자 판단(문제 없음 / 부정 의심)
// 이벤트는 백엔드(응시자별 감독 이벤트)에서 불러오고, 판단은 바로 백엔드에 저장한다.
import { useEffect, useState } from 'react'
import {
  AppWindow,
  BookOpen,
  Camera,
  ClipboardPaste,
  EyeOff,
  Hand,
  Loader2,
  Maximize2,
  Monitor,
  MousePointer2,
  PersonStanding,
  ScanFace,
  Smartphone,
  Users,
  ImageOff,
  ShieldCheck,
  ShieldAlert,
  type LucideIcon,
  WifiOff,
} from 'lucide-react'
import { cx } from '../../components/cx'
import { ErrorState } from '../../components/ErrorState'
import { canReviewProctor, useAuth } from '../../auth/auth'
import { consoleApi, type EnvScanPhotoView, type EventReview, type EventType, type ParticipantView, type ProctorEventView, type SessionSummary } from '../../consoleApi'
import { EVENT_LABEL, isCameraEvent, useLoad } from '../../data/consoleSessions'
import { countUnconfirmed, serverCheckBadge } from '../../proctor/core/serverCheck'
import { Modal } from './common'
import { fmtTime } from './format'
import LiveWatch from './LiveWatch'
import { Loading } from './Loading'

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
}
const LOW = 0.8

const elapsed = (s: SessionSummary, iso: string) => {
  const sec = Math.max(0, Math.round((Date.parse(iso) - Date.parse(s.startsAt)) / 1000))
  return `${String(Math.floor(sec / 3600)).padStart(2, '0')}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`
}

/** detail(JSON 문자열)을 읽기 쉬운 한 줄로 */
function detailText(detail: string | null): string | null {
  if (!detail) return null
  try {
    const o = JSON.parse(detail) as unknown
    if (o && typeof o === 'object')
      return Object.entries(o as Record<string, unknown>)
        .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
        .join(' │ ')
    return String(o)
  } catch {
    return detail
  }
}

type Filter = 'all' | 'open' | 'suspect'
const byTime = (list: ProctorEventView[]) => [...list].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt))

export default function ProctorPanel({
  session,
  p,
  pollMs,
  className,
}: {
  session: SessionSummary
  p: ParticipantView
  /** 주면 이 간격(ms)으로 이벤트를 다시 불러온다 (실시간 현황) */
  pollMs?: number
  className?: string
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const [focus, setFocus] = useState<number | null>(null)
  const [photo, setPhoto] = useState<ProctorEventView | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const loaded = useLoad(session.proctoring ? `pev-${session.id}-${p.id}` : null, () => consoleApi.participantEvents(session.id, p.id), pollMs)
  const scan = useLoad(session.proctoring ? `env-${session.id}-${p.id}` : null, () => consoleApi.envScanPhotos(session.id, p.id))
  const events = byTime(loaded.data ?? [])
  const unconfirmed = countUnconfirmed(events)
  const shown = events.filter((e) => (filter === 'open' ? !e.review : filter === 'suspect' ? e.review === 'SUSPECT' : true))
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
          <span className="tnum ml-auto font-mono text-[12px] text-text-muted">이벤트 {events.length}건</span>
        </div>
        {session.proctoring ? (
          <p className="mt-1 text-[13px] text-text-muted">{p.enteredAt ? `${fmtTime(p.enteredAt)} 입장` : '아직 입장 전'}</p>
        ) : (
          <p className="mt-1 text-[13px] text-text-muted">감독을 쓰지 않은 회차입니다.</p>
        )}
      </header>

      {/* 실시간 영상: 응시 중인 응시자만. 열었을 때만 응시자 PC 가 영상을 보낸다 */}
      {session.proctoring && session.phase === 'LIVE' && p.enteredAt && !p.submittedAt && <LiveWatch key={p.id} sessionId={session.id} participantId={p.id} />}
      {session.proctoring && scan.data && scan.data.length > 0 && <EnvScanSection sessionId={session.id} photos={scan.data} />}
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
                ['open', `미확인 ${events.filter((e) => !e.review).length}`],
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
              <EventCard key={e.id} e={e} time={elapsed(session, e.startedAt)} focused={focus === e.id} onPhoto={() => setPhoto(e)} onReview={(r, note) => review(e, r, note)} />
            ))}
          </ol>
        </>
      )}

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
  onPhoto,
  onReview,
}: {
  e: ProctorEventView
  time: string
  focused: boolean
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
  const detail = detailText(e.detail)
  const check = serverCheckBadge(e)
  return (
    <li
      id={`ev-${e.id}`}
      className={cx('relative overflow-hidden rounded-md border bg-panel transition-shadow', focused ? 'border-brand shadow-md' : 'border-line', !e.review && 'border-l-2 border-l-caution')}
    >
      <div className={cx('flex gap-3 p-3', low && 'opacity-60')}>
        <span className={cx('inline-flex size-9 shrink-0 items-center justify-center rounded-md', cam ? 'bg-alert/10 text-alert' : 'bg-caution/10 text-caution')}>
          <Icon size={18} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[15px] font-semibold text-text">{EVENT_LABEL[e.type] ?? e.type}</p>
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
          {detail && <p className="mt-1 text-[13px] break-all text-text">{detail}</p>}
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
                보관 기간 지나 삭제됨
              </span>
            ) : (
              <span className="flex aspect-video w-full items-center justify-center bg-panel-raised text-text-faint">
                <Camera size={16} aria-hidden />
              </span>
            )}
          </button>
        )}
      </div>
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
    </li>
  )
}

/** 있으면 안 되는 물체(감지 이름 → 화면 이름). 방 스캔에서 잡히면 감독관이 사진으로 확인하고 치우도록 안내한다 */
const SUSPECT_LABEL: Record<string, string> = { person: '다른 사람', 'cell phone': '휴대폰', book: '책', tv: '화면', laptop: '화면' }

/** 이 사진에서 잡힌 의심 물체 이름 (중복 없이) */
function suspectsOf(f: EnvScanPhotoView): string[] {
  return [...new Set(f.objects.map((o) => SUSPECT_LABEL[o]).filter((x): x is string => !!x))]
}

/** 방향 이름: 방 스캔은 "방 90°", 책상은 "책상 위" */
function scanLabel(f: EnvScanPhotoView): string {
  return f.stage === 'DESK' ? '책상 위' : f.angle === null ? '방' : `방 ${f.angle}°`
}

/**
 * 환경 점검 사진(방 360도 방향별, 책상 위). 있으면 안 되는 물체가 감지된 장면이 있으면 먼저 펼쳐 감독관이 확인하게 한다
 * (방 스캔은 막지 않고 경고만 남기므로, 감독관이 사진을 보고 치우도록 안내한다. 응시자가 "휴대폰이 아니다"라고 답한 경우도 근거가 된다).
 */
function EnvScanSection({ sessionId, photos }: { sessionId: number; photos: EnvScanPhotoView[] }) {
  const flagged = photos.filter((f) => suspectsOf(f).length > 0).length
  return (
    <details className="border-b border-line px-4 py-3" open={flagged > 0}>
      <summary className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-text">
        환경 점검 사진 {photos.length}장
        {flagged > 0 && <span className="rounded-sm bg-caution/15 px-1.5 py-0.5 text-[12px] font-semibold text-caution">확인 필요 {flagged}장</span>}
      </summary>
      {flagged > 0 && (
        <p className="mt-2 text-[12px] leading-5 break-keep text-text-muted">
          표시된 사진에서 있으면 안 되는 물체가 감지됐습니다. 응시자에게는 경고만 보여 주고 막지 않았습니다. 사진을 확인하고 필요하면 치우도록 안내해 주세요.
        </p>
      )}
      <ul className="mt-3 grid grid-cols-3 gap-2">
        {photos.map((f) => (
          <li key={f.id} className="flex flex-col gap-1">
            <ScanThumb sessionId={sessionId} photo={f} />
            <span className="flex flex-wrap items-center gap-x-1 text-[12px] text-text-muted">
              {scanLabel(f)}
              {suspectsOf(f).length > 0 && <span className="font-semibold text-caution">{suspectsOf(f).join('·')}?</span>}
            </span>
          </li>
        ))}
      </ul>
    </details>
  )
}

function ScanThumb({ sessionId, photo }: { sessionId: number; photo: EnvScanPhotoView }) {
  const [state, setState] = useState<{ id: number; url?: string; error?: string } | null>(null)
  useEffect(() => {
    if (photo.deleted) return
    let alive = true
    let url: string | undefined
    consoleApi.envScanImageUrl(sessionId, photo.id).then(
      (u) => {
        if (!alive) return URL.revokeObjectURL(u)
        url = u
        setState({ id: photo.id, url: u })
      },
      (e: unknown) => alive && setState({ id: photo.id, error: e instanceof Error ? e.message : String(e) }),
    )
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [sessionId, photo.id, photo.deleted])
  const cur = state?.id === photo.id ? state : null
  if (cur?.url) {
    return (
      <a href={cur.url} target="_blank" rel="noreferrer" title="크게 보기">
        <img src={cur.url} alt={`환경 점검 사진 ${scanLabel(photo)}`} className={cx('aspect-[4/3] w-full rounded-md object-cover', suspectsOf(photo).length > 0 && 'ring-2 ring-caution')} />
      </a>
    )
  }
  return (
    <span className="flex aspect-[4/3] w-full items-center justify-center rounded-md bg-panel-raised text-text-muted">
      {photo.deleted || cur?.error ? <ImageOff size={20} aria-hidden /> : <Loader2 size={18} className="animate-spin text-brand" aria-hidden />}
    </span>
  )
}

/** 스냅샷 사진: 로그인 헤더가 필요해 blob URL 로 받는다. 닫으면 URL 을 풀어 준다 */
function Snapshot({ sessionId, eventId }: { sessionId: number; eventId: number }) {
  const [state, setState] = useState<{ id: number; url?: string; error?: string } | null>(null)
  useEffect(() => {
    let alive = true
    let url: string | undefined
    consoleApi.snapshotUrl(sessionId, eventId).then(
      (u) => {
        if (!alive) return URL.revokeObjectURL(u)
        url = u
        setState({ id: eventId, url: u })
      },
      (e: unknown) => alive && setState({ id: eventId, error: e instanceof Error ? e.message : String(e) }),
    )
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [sessionId, eventId])
  const cur = state?.id === eventId ? state : null
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
