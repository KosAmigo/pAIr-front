// 과제 콘솔 작은 부품: 직군 아이콘 칸, AI 생성 배지, 자동 확인 배지, 시간 칩.
// 직군 색은 개발 = branch-2(파랑), 비개발 = comp-6(청록). 상태 색(검수 전 caution, 자가진단 brand, 실전 text)과 섞지 않는다.
import { CircleCheck, CircleX, Clock, Sparkles, TriangleAlert } from 'lucide-react'
import { cx } from '../../../components/cx'
import { TRACK_ICON } from '../../../components/domainIcons'
import { STATS } from '../../../data/dashboard'
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

/** 카드용: 자동 확인이 실패했을 때만 쓰는 작은 주의 표시 (빨강보다 차분하게) */
export function CheckFailNote() {
  return (
    <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-caution/10 px-2 text-[12px] font-semibold text-caution">
      <TriangleAlert size={12} aria-hidden /> 자동 확인 실패
    </span>
  )
}

/** 역량 배지: STATS 의 이름과 옅은 색, 앞에 역량 색 점. 한 줄에 두고 넘치면 말줄임. 알 수 없는 key 는 버린다 */
export function CompetencyBadges({ keys }: { keys?: string[] | null }) {
  const list = (keys ?? []).map((k) => STATS.find((s) => s.key === k)).filter((s): s is (typeof STATS)[number] => !!s).slice(0, 2)
  if (list.length === 0) return null
  return (
    <ul aria-label="이 과제가 보는 역량" className="flex min-w-0 flex-nowrap items-center gap-1.5 overflow-hidden">
      {list.map((st) => (
        <li
          key={st.key}
          style={{ backgroundColor: `color-mix(in srgb, ${st.color} 14%, transparent)` }}
          className="inline-flex h-6 min-w-0 shrink items-center gap-1.5 rounded-full px-2.5 text-[12px] font-bold text-text"
        >
          <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: st.color }} />
          <span className="truncate">{st.name}</span>
        </li>
      ))}
    </ul>
  )
}
