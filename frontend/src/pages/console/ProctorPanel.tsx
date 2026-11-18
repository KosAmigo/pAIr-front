// DESIGN.md §7-9-4a 감독 패널: 시험 시간 축 + 이벤트 카드 + 담당자 판단(문제 없음 / 부정 의심)
import { useState } from 'react'
import {
  AppWindow,
  Camera,
  ClipboardPaste,
  EyeOff,
  Maximize2,
  ScanFace,
  Smartphone,
  Users,
  ImageOff,
  ShieldCheck,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react'
import { cx } from '../../components/cx'
import { canReviewProctor, useAuth } from '../../auth/auth'
import {
  EVENT_LABEL,
  isCameraEvent,
  reviewEvent,
  type PEvent,
  type PEventType,
  type Participant,
  type Review,
  type Session,
} from '../../data/consoleSessions'
import { Modal } from './common'
import { fmtTime } from './format'

const ICON: Record<PEventType, LucideIcon> = {
  TAB_HIDDEN: AppWindow,
  WINDOW_BLUR: EyeOff,
  PASTE: ClipboardPaste,
  FULLSCREEN_EXIT: Maximize2,
  NO_FACE: ScanFace,
  MULTI_FACE: Users,
  HEAD_TURN: ScanFace,
  PHONE: Smartphone,
}
const LOW = 0.8

const elapsed = (s: Session, iso: string) => {
  const sec = Math.max(0, Math.round((Date.parse(iso) - Date.parse(s.startsAt)) / 1000))
  return `${String(Math.floor(sec / 3600)).padStart(2, '0')}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`
}

type Filter = 'all' | 'open' | 'suspect'

export default function ProctorPanel({ session, p, className }: { session: Session; p: Participant; className?: string }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [focus, setFocus] = useState<string | null>(null)
  const [photo, setPhoto] = useState<PEvent | null>(null)
  const events = [...p.events].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  const shown = events.filter((e) => (filter === 'open' ? !e.review : filter === 'suspect' ? e.review === 'SUSPECT' : true))
  const span = Date.parse(session.endsAt) - Date.parse(session.startsAt)
  const pos = (iso: string) => Math.min(100, Math.max(0, ((Date.parse(iso) - Date.parse(session.startsAt)) / span) * 100))

  return (
    <section className={cx('flex flex-col rounded-md border border-line bg-panel shadow-sm', className)} aria-label="감독 기록">
      <header className="border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="label">PROCTORING</span>
          <span className="tnum ml-auto font-mono text-[12px] text-text-muted">
            이벤트 {events.length}건
          </span>
        </div>
        {session.proctoring ? (
          <p className="mt-1 text-[13px] text-text-muted">
            {p.enteredAt ? `${fmtTime(p.enteredAt)} 동의` : '아직 입장 전'}
            {p.enteredAt && ' │ 카메라 정상 │ 전체 화면 정상 │ Chrome 142'}
          </p>
        ) : (
          <p className="mt-1 text-[13px] text-text-muted">감독을 쓰지 않은 회차입니다.</p>
        )}
      </header>

      {session.proctoring && (
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
                  aria-label={`${EVENT_LABEL[e.type]} ${elapsed(session, e.at)}`}
                  title={`${EVENT_LABEL[e.type]} ${elapsed(session, e.at)}`}
                  className={cx(
                    'absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 border-2 border-panel',
                    isCameraEvent(e.type) ? 'rounded-full bg-alert' : 'rotate-45 rounded-[2px] bg-caution',
                    focus === e.id && 'ring-2 ring-brand',
                  )}
                  style={{ left: `${pos(e.at)}%` }}
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

          <ol className="flex flex-col gap-3 p-4">
            {shown.length === 0 && <li className="py-8 text-center text-[14px] text-text-muted">{events.length ? '조건에 맞는 이벤트가 없습니다.' : '감독 이벤트가 없습니다.'}</li>}
            {shown.map((e) => (
              <EventCard
                key={e.id}
                e={e}
                time={elapsed(session, e.at)}
                focused={focus === e.id}
                onPhoto={() => setPhoto(e)}
                onReview={(r, note, by) => reviewEvent(session.id, p.id, e.id, r, note, by)}
              />
            ))}
          </ol>
        </>
      )}

      {photo && (
        <Modal title={`${EVENT_LABEL[photo.type]} 스냅샷`} onClose={() => setPhoto(null)} actions={null}>
          <SnapshotPlaceholder big />
          <p className="tnum mt-3 font-mono text-[13px]">
            {elapsed(session, photo.at)} │ 확신도 {photo.confidence?.toFixed(2)}
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
  e: PEvent
  time: string
  focused: boolean
  onPhoto: () => void
  onReview: (r: Review | undefined, note: string | undefined, by: string) => void
}) {
  const { user } = useAuth()
  // 판단은 감독관·매니저·관리자 (모든 콘솔 권한). 권한이 늘면 canReviewProctor 에서 막는다
  const canReview = canReviewProctor(user?.role)
  const [note, setNote] = useState(e.reviewNote ?? '')
  const Icon = ICON[e.type]
  const low = e.confidence != null && e.confidence < LOW
  const cam = isCameraEvent(e.type)
  return (
    <li
      id={`ev-${e.id}`}
      className={cx(
        'relative overflow-hidden rounded-md border bg-panel transition-shadow',
        focused ? 'border-brand shadow-md' : 'border-line',
        !e.review && 'border-l-2 border-l-caution',
      )}
    >
      <div className={cx('flex gap-3 p-3', low && 'opacity-60')}>
        <span className={cx('inline-flex size-9 shrink-0 items-center justify-center rounded-md', cam ? 'bg-alert/10 text-alert' : 'bg-caution/10 text-caution')}>
          <Icon size={18} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[15px] font-semibold text-text">{EVENT_LABEL[e.type]}</p>
            {low && <span className="rounded-sm bg-panel-raised px-1.5 text-[11px] font-semibold text-text-muted">확신도 낮음</span>}
          </div>
          <p className="tnum font-mono text-[12px] text-text-muted">
            {time}
            {e.durationMs > 0 && ` │ ${(e.durationMs / 1000).toFixed(e.durationMs < 10000 ? 1 : 0)}초`}
            {e.confidence != null && ` │ 확신도 ${e.confidence.toFixed(2)}`}
          </p>
          {e.detail && <p className="mt-1 text-[13px] text-text">{e.detail}</p>}
        </div>
        {cam && (
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
              <SnapshotPlaceholder />
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
              onClick={() => onReview(e.review === v ? undefined : v, note || undefined, user?.name ?? '감독관')}
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
          onBlur={() => e.review && note !== (e.reviewNote ?? '') && onReview(e.review, note, user?.name ?? '감독관')}
          readOnly={!canReview}
          placeholder={canReview ? '메모 (선택)' : '감독관만 판단할 수 있습니다'}
          className="mt-2 h-8 w-full rounded-sm border border-line bg-panel px-2 text-[13px] outline-none focus:border-brand"
        />
        {e.review && e.reviewedAt && (
          <p className="tnum mt-1.5 font-mono text-[11px] text-text-faint">
            {e.reviewedBy} │ {fmtTime(e.reviewedAt)}
          </p>
        )}
      </div>
    </li>
  )
}

/** 목업 스냅샷: 실제 사진 대신 카메라 화면 자리 */
function SnapshotPlaceholder({ big }: { big?: boolean }) {
  return (
    <span className={cx('flex aspect-video w-full items-center justify-center bg-panel-raised text-text-faint', big ? 'rounded-md' : '')}>
      <Camera size={big ? 32 : 16} aria-hidden />
    </span>
  )
}
