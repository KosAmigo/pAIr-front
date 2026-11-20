import { cx } from '../cx'
import { branchColor, onPathTo, type TreeRow } from '../../lib/replayTree'
import { shortTime, STATUS_LABEL, turnLabel } from './format'

// DESIGN.md §6.13 복기 트리 노드 & 선: 세로 git 그래프. 시간은 위에서 아래로, 분기는 오른쪽 레인으로 갈라진다.
const LANE = 28
const ROW_H = 64
const PAD = 16
const MID = ROW_H / 2

const color = (branch: number) => `var(--color-branch-${branchColor(branch)})`
const laneX = (depth: number) => PAD + depth * LANE

/** 한 줄의 레인 그림: 지나가는 줄기, 부모에서 45° 로 꺾이는 분기선, 응시 노드 */
function Lanes({ row, next, width, selected, dim }: { row: TreeRow; next: TreeRow | undefined; width: number; selected: boolean; dim: Set<string> }) {
  const x = laneX(row.depth)
  const parent = row.path.length > 1 ? row.path[row.path.length - 2] : null
  return (
    <svg width={width} height={ROW_H} aria-hidden className="shrink-0 overflow-visible">
      {row.path.map((p) => {
        const reachesBottom = next !== undefined && next.depth > p.depth
        const isSelf = p.attemptId === row.attemptId
        const top = isSelf ? MID : 0
        const bottom = reachesBottom ? ROW_H : MID
        if (bottom <= top) return null
        return (
          <line key={p.attemptId} x1={laneX(p.depth)} x2={laneX(p.depth)} y1={top} y2={bottom} strokeWidth={3} strokeLinecap="round"
            stroke={color(p.branch)} opacity={dim.has(p.attemptId) ? 1 : 0.35} />
        )
      })}
      {parent && (
        <line x1={laneX(parent.depth)} y1={0} x2={x} y2={MID} strokeWidth={3} strokeLinecap="round" stroke={color(row.branch)} opacity={dim.has(row.attemptId) ? 1 : 0.35} />
      )}
      <circle cx={x} cy={MID} r={7} fill={color(row.branch)} opacity={dim.has(row.attemptId) ? 1 : 0.35}
        style={selected ? { filter: `drop-shadow(0 0 5px ${color(row.branch)})` } : undefined} />
    </svg>
  )
}

/**
 * 복기 트리 그래프. 줄을 누르면 그 응시의 복기로 이동한다. 현재 응시와 그 조상 줄기는 밝게, 나머지는 35% 로 내린다.
 * 채점이 끝난 줄에는 총점 칩과 "비교" 버튼이 있고, 두 개를 고르면(A·B 배지) 점수를 나란히 볼 수 있다.
 */
export function BranchGraph({ rows, currentId, onSelect, compare, onToggleCompare }: {
  rows: TreeRow[]
  currentId: string
  onSelect: (attemptId: string) => void
  compare: string[]
  onToggleCompare: (attemptId: string) => void
}) {
  const maxDepth = Math.max(0, ...rows.map((r) => r.depth))
  const width = PAD * 2 + maxDepth * LANE
  const highlighted = onPathTo(rows, currentId)
  return (
    <ol aria-label="분기 그래프" className="flex flex-col">
      {rows.map((row, i) => {
        const selected = row.attemptId === currentId
        return (
          <li key={row.attemptId} className={cx('flex items-center rounded-lg pr-3 transition-colors hover:bg-stage-raised', selected && 'bg-stage-raised')} style={{ height: ROW_H }}>
            <button
              type="button"
              onClick={() => onSelect(row.attemptId)}
              aria-current={selected ? 'true' : undefined}
              className="flex h-full min-w-0 flex-1 items-center text-left focus-visible:outline-2 focus-visible:outline-brand"
            >
              <Lanes row={row} next={rows[i + 1]} width={width} selected={selected} dim={highlighted} />
              <span className="ml-2 min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="font-mono text-[13px] font-semibold" style={{ color: color(row.branch) }}>{row.label}</span>
                  {selected && <span className="rounded-full bg-stage-line px-2 text-[12px] text-stage-text">지금 보는 풀이</span>}
                  {row.score && <span className="tnum font-mono text-[13px] text-stage-text">{row.score.total}/{row.score.max}점</span>}
                </span>
                <span className="block truncate text-[13px] text-stage-muted">
                  {row.forkedAtTurn != null ? `질문 ${turnLabel(row.forkedAtTurn)} 시점에서 갈라짐 · ` : '처음 풀이 · '}
                  {shortTime(row.startedAt)} · {STATUS_LABEL[row.status]}
                </span>
              </span>
            </button>
            {row.score ? (
              <button
                type="button"
                onClick={() => onToggleCompare(row.attemptId)}
                aria-pressed={compare.includes(row.attemptId)}
                aria-label={`${row.label} 비교 대상 ${compare.includes(row.attemptId) ? '해제' : '선택'}`}
                className={cx(
                  'ml-2 inline-flex h-7 min-w-9 shrink-0 items-center justify-center rounded-full border px-2 font-mono text-[13px] font-semibold',
                  compare.includes(row.attemptId) ? 'border-stage-line-strong bg-stage-line text-stage-text' : 'border-stage-line text-stage-muted hover:text-stage-text',
                )}
              >
                {compare.includes(row.attemptId) ? 'AB'[compare.indexOf(row.attemptId)] : '비교'}
              </button>
            ) : (
              <span className="ml-2 shrink-0 text-[12px] text-stage-muted">{row.status === 'DONE' ? '재채점 필요' : '채점 전'}</span>
            )}
          </li>
        )
      })}
    </ol>
  )
}
