// 과제 형태 아이콘과 난이도 막대. 자가진단 과제 목록(2a)과 콘솔 과제 목록(9-1)이 같이 쓴다.
import { FileText } from 'lucide-react'
import { KIND_ICON } from './taskKindIcons'
import { cx } from './cx'


export type Level = '쉬움' | '보통' | '어려움'
const LEVELS: string[] = ['쉬움', '보통', '어려움']
const LEVEL_PIPS: Record<Level, number> = { 쉬움: 1, 보통: 2, 어려움: 3 }

// 마이그레이션 전 DB·옛 기록은 예전 이름(초급/중급/고급)을 줄 수 있어, 표시할 때 새 이름으로 바꾼다
const OLD_LEVEL: Record<string, Level> = { 초급: '쉬움', 중급: '보통', 고급: '어려움' }
/** 서버가 준 난이도 문자열 → 새 이름. 모르는 값이면 null */
export function normalizeLevel(v?: string | null): Level | null {
  if (!v) return null
  const x = OLD_LEVEL[v] ?? v
  return LEVELS.includes(x) ? (x as Level) : null
}
/** 난이도 글자 표시용: 옛 이름은 새 이름으로, 모르는 값은 그대로 */
export const levelLabel = (v?: string | null) => normalizeLevel(v) ?? v ?? ''

export function LevelPips({ level, stage }: { level: Level; stage?: boolean }) {
  const n = LEVEL_PIPS[level]
  return (
    <span className="inline-flex items-center gap-1.5" aria-label={`난이도 ${level}`}>
      <span className="flex gap-0.5" aria-hidden>
        {[1, 2, 3].map((i) => (
          <span key={i} className={cx('h-3 w-1.5 rounded-full', i <= n ? (stage ? 'bg-stage-brand' : 'bg-brand') : stage ? 'bg-stage-line' : 'bg-line-strong')} />
        ))}
      </span>
      <span className={cx('text-[13px]', stage ? 'text-stage-muted' : 'text-text-muted')}>{level}</span>
    </span>
  )
}

/** 형태 아이콘 칸. 공개 과제는 브랜드 그라데이션 칸, 그 밖은 옅은 칸 */
export function KindTile({ kind, size = 36, vivid }: { kind: string; size?: number; vivid?: boolean }) {
  const Icon = KIND_ICON[kind] ?? FileText
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-lg',
        vivid ? 'bg-brand-gradient text-white shadow-md' : 'border border-line bg-panel-raised text-text-muted',
      )}
    >
      <Icon size={Math.round(size * 0.5)} strokeWidth={1.9} />
    </span>
  )
}
