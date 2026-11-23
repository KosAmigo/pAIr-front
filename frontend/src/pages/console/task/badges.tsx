// 과제 콘솔 작은 부품: 직군 아이콘 칸, AI 생성 배지, 자동 확인 배지, 시간 칩.
// 직군 색은 개발 = branch-2(파랑), 비개발 = comp-6(청록). 상태 색(검수 전 caution, 자가진단 brand, 실전 text)과 섞지 않는다.
import { CircleCheck, CircleX, Clock, Sparkles } from 'lucide-react'
import { cx } from '../../../components/cx'
import { TRACK_ICON } from '../../../components/domainIcons'
import { TRACK_LABEL, type Track } from '../../../data/taskBoard'
import { TRACK_TONE } from './trackTone'

/** 직군 아이콘 칸 */
export function TrackTile({ track, size = 44 }: { track: Track; size?: number }) {
  const Icon = TRACK_ICON[track]
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={cx('inline-flex shrink-0 items-center justify-center rounded-xl ring-1 ring-inset', TRACK_TONE[track].tile, TRACK_TONE[track].ring)}
    >
      <Icon size={Math.round(size * 0.5)} strokeWidth={1.9} />
    </span>
  )
}

export function TrackLabel({ track }: { track: Track }) {
  return <span className={cx('text-[13px] font-semibold', TRACK_TONE[track].text)}>{TRACK_LABEL[track]}</span>
}

export function AiBadge() {
  return (
    <span className="inline-flex h-[22px] items-center gap-1 rounded-full bg-brand-dim px-2 text-[12px] font-semibold text-brand">
      <Sparkles size={12} aria-hidden /> AI 생성
    </span>
  )
}

export function CheckBadge({ result }: { result: 'pass' | 'fail' }) {
  return result === 'pass' ? (
    <span className="inline-flex h-[22px] items-center gap-1 rounded-full bg-signal/10 px-2 text-[12px] font-semibold text-signal">
      <CircleCheck size={13} aria-hidden /> 자동 확인 통과
    </span>
  ) : (
    <span className="inline-flex h-[22px] items-center gap-1 rounded-full bg-alert/10 px-2 text-[12px] font-semibold text-alert">
      <CircleX size={13} aria-hidden /> 자동 확인 실패
    </span>
  )
}

export function MinutesChip({ minutes }: { minutes: number }) {
  return (
    <span className="inline-flex h-[22px] items-center gap-1 rounded-sm bg-panel-raised px-1.5 text-[13px] text-text-muted">
      <Clock size={13} aria-hidden />
      <span className="tnum font-mono">{minutes}</span>분
    </span>
  )
}
