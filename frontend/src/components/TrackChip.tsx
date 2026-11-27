import type { TaskType } from '../api'
import { TRACK_LABEL } from '../data/taskBoard'
import { TRACK_TONE } from '../pages/console/task/trackTone'
import { cx } from './cx'
import { trackIconOf } from './domainIcons'

/** 개발·비개발 표시: 아이콘 + 글자 + 직군 색 */
export function TrackChip({ type, className }: { type: TaskType; className?: string }) {
  const track = type === 'biz' ? 'BIZ' : 'DEV'
  const Icon = trackIconOf(type)
  return (
    <span className={cx('inline-flex h-[22px] items-center gap-1 rounded-sm px-1.5 text-[12px] font-semibold', TRACK_TONE[track].tile, className)}>
      <Icon size={13} aria-hidden /> {TRACK_LABEL[track]}
    </span>
  )
}
