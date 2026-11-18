import { useState, type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileBarChart2, GitBranch, GitCompareArrows, RotateCcw, X } from 'lucide-react'
import { PageHeader, SelfShell } from '../components/SelfShell'
import { cx } from '../components/cx'
import { Button, ButtonLink, IconButton, ScoreChip } from '../components/ui'
import { branches, COMPETENCIES, treeNodes, type TreeNode } from '../data/mock'

// DESIGN.md §7-5 복기 트리 + §6.13 노드 & 선

const ROW = 56 // 행 높이
const LANE = 28 // 레인 폭 (dx ≤ ROW → 45° 대각선 유지)
const PAD_X = 20
const PAD_Y = 28
const color = (b: number) => `var(--color-branch-${(b % 5) + 1})`
const laneX = (b: number) => PAD_X + b * LANE
const rowY = (r: number) => PAD_Y + r * ROW

function branchPath(b: number) {
  const br = branches[b]
  const rows = treeNodes.filter((n) => n.branch === b).map((n) => n.row)
  const end = rowY(Math.max(...rows))
  const x = laneX(b)
  if (br.parent === undefined) return `M ${x} ${rowY(Math.min(...rows))} L ${x} ${end}`
  const px = laneX(br.parent)
  const y0 = rowY(br.forkFromRow!)
  const dx = Math.abs(x - px)
  return `M ${px} ${y0} L ${x} ${y0 + dx} L ${x} ${end}`
}

function Node({ n, dim, active }: { n: TreeNode; dim: boolean; active: boolean }) {
  const x = laneX(n.branch)
  const y = rowY(n.row)
  const c = color(n.branch)
  const style = { '--glow': c } as CSSProperties
  return (
    <g className={cx('transition-opacity duration-300', dim && 'opacity-35')} style={style}>
      {active && <circle cx={x} cy={y} r={14} fill="none" stroke="var(--color-text)" strokeOpacity={0.5} strokeDasharray="3 3" />}
      {n.kind === 'checkpoint' && <circle cx={x} cy={y} r={5} fill="var(--color-panel)" stroke={c} strokeWidth={3} />}
      {n.kind === 'fork' && <circle cx={x} cy={y} r={7} fill={c} className="glow-svg" />}
      {n.kind === 'submit' && (
        <g className="glow-svg">
          <rect x={x - 13} y={y - 9} width={26} height={18} rx={4} fill={c} />
          <text x={x} y={y + 3.5} textAnchor="middle" className="fill-on-accent font-mono text-[10px] font-semibold">
            {n.score}
          </text>
        </g>
      )}
    </g>
  )
}

function BranchGraph({
  selected,
  activeNode,
  onNode,
}: {
  selected: string[]
  activeNode: string | null
  onNode: (id: string) => void
}) {
  const navigate = useNavigate()
  const any = selected.length > 0
  const isSel = (b: number) => selected.includes(branches[b].id)
  const maxRow = Math.max(...treeNodes.map((n) => n.row))
  const H = rowY(maxRow) + PAD_Y
  const W = laneX(branches.length - 1) + PAD_X
  const node = treeNodes.find((n) => n.id === activeNode)

  return (
    <div className="relative" style={{ height: H }}>
      <svg width={W} height={H} className="absolute top-0 left-4" aria-hidden>
        {/* 비선택 분기 먼저, 선택 분기 위에 */}
        {[...branches.keys()]
          .sort((a, b) => Number(isSel(a)) - Number(isSel(b)))
          .map((b) => (
            <path
              key={b}
              d={branchPath(b)}
              fill="none"
              stroke={color(b)}
              strokeWidth={3}
              strokeLinejoin="round"
              strokeLinecap="round"
              style={{ '--glow': color(b) } as CSSProperties}
              className={cx('transition-opacity duration-300', any && !isSel(b) && 'opacity-35', isSel(b) && 'glow-svg')}
            />
          ))}
        {treeNodes.map((n) => (
          <Node key={n.id} n={n} dim={any && !isSel(n.branch)} active={n.id === activeNode} />
        ))}
      </svg>

      {/* 행 정보 */}
      <ol className="absolute inset-y-0 right-0" style={{ left: W + 32 }}>
        {treeNodes.map((n) => {
          const dim = any && !isSel(n.branch)
          return (
            <li key={n.id} className="absolute inset-x-0 flex items-center" style={{ top: rowY(n.row) - ROW / 2, height: ROW }}>
              <button
                type="button"
                onClick={() => onNode(n.id)}
                aria-expanded={activeNode === n.id}
                className={cx(
                  'flex h-10 w-full items-center gap-3 rounded-md px-3 text-left transition-[opacity,background-color] duration-300',
                  activeNode === n.id ? 'bg-panel-raised' : 'hover:bg-panel-raised/60',
                  dim && 'opacity-35',
                )}
              >
                <span className="tnum w-16 shrink-0 font-mono text-[13px] text-text-muted">{n.time}</span>
                <span className="w-10 shrink-0 font-mono text-[13px] font-semibold" style={{ color: color(n.branch) }}>
                  {branches[n.branch].name}
                </span>
                <span className={cx('truncate text-[14px]', n.kind === 'submit' ? 'font-semibold text-text' : 'text-text')}>{n.label}</span>
                {n.kind === 'submit' && <ScoreChip score={n.score!} className="ml-auto" />}
              </button>
            </li>
          )
        })}
      </ol>

      {/* 노드 상세 팝오버 */}
      {node && (
        <div
          className="fade-in absolute z-20 w-[300px] rounded-md border border-line bg-panel-raised shadow-modal"
          style={{ top: rowY(node.row) + ROW / 2 - 4, left: W + 140 }}
          role="dialog"
          aria-label="체크포인트 상세"
        >
          <header className="flex h-9 items-center gap-2 border-b border-line pr-1 pl-3">
            <span className="size-2 rounded-full" style={{ background: color(node.branch) }} aria-hidden />
            <span className="font-mono text-[13px] font-semibold" style={{ color: color(node.branch) }}>
              {branches[node.branch].name}
            </span>
            <span className="label">{node.kind === 'submit' ? 'SUBMIT' : node.kind === 'fork' ? 'FORK' : 'CHECKPOINT'}</span>
            <IconButton label="닫기" className="ml-auto" onClick={() => onNode(node.id)}>
              <X size={16} aria-hidden />
            </IconButton>
          </header>
          <div className="p-3">
            <div className="text-[15px] font-semibold">{node.label}</div>
            <div className="tnum mt-1 font-mono text-[13px] text-text-muted">경과 {node.time}</div>
            <div className="mt-3 flex gap-2">
              {node.kind === 'submit' ? (
                <ButtonLink to="/report/a-1107" size="sm" variant="secondary">
                  <FileBarChart2 size={16} aria-hidden /> 리포트
                </ButtonLink>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => navigate(`/exam/t-order-api?mode=self&from=${node.id}`)}>
                  <RotateCcw size={16} aria-hidden /> 여기서 다시 풀기
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SlotBadge({ slot }: { slot: 'A' | 'B' }) {
  return (
    <span className="inline-flex size-[18px] items-center justify-center rounded-sm bg-text font-mono text-[12px] font-semibold text-bg">{slot}</span>
  )
}

function Compare({ ids, onClear }: { ids: string[]; onClear: () => void }) {
  if (ids.length < 2) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-10 text-center">
        <svg width="96" height="72" viewBox="0 0 96 72" aria-hidden className="mb-5">
          <path d="M24 8 L24 64" stroke="var(--color-line-strong)" strokeWidth="3" strokeLinecap="round" />
          <path d="M24 20 L52 48 L52 64" stroke="var(--color-line-strong)" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="24" cy="64" r="6" fill="var(--color-panel)" stroke="var(--color-text-muted)" strokeWidth="2" />
          <circle cx="52" cy="64" r="6" fill="var(--color-panel)" stroke="var(--color-text-muted)" strokeWidth="2" />
          <text x="24" y="68" textAnchor="middle" className="fill-text-muted font-mono text-[9px]">A</text>
          <text x="52" y="68" textAnchor="middle" className="fill-text-muted font-mono text-[9px]">B</text>
        </svg>
        <p className="text-[16px] font-semibold">비교할 분기 두 개를 고르세요</p>
        <p className="mt-1 text-[14px] text-text-muted">상단 범례에서 분기를 선택하면 항목별 점수를 나란히 비교합니다.</p>
        <p className="mt-4 font-mono text-[13px] text-text-faint">{ids.length} / 2 SELECTED</p>
      </div>
    )
  }
  const a = branches.find((b) => b.id === ids[0])!
  const b = branches.find((x) => x.id === ids[1])!
  const ai = branches.indexOf(a)
  const bi = branches.indexOf(b)
  const diff = b.total - a.total

  return (
    <div className="fade-in flex h-full flex-col">
      {/* A vs B 헤더 */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-line px-4 py-4">
        {[
          [a, ai, 'A'] as const,
          null,
          [b, bi, 'B'] as const,
        ].map((x, i) =>
          x === null ? (
            <div key={i} className="flex flex-col items-center">
              <span className="label">DIFF</span>
              <span className={cx('tnum font-mono text-[21px] font-semibold', diff >= 0 ? 'text-signal' : 'text-alert')}>
                {diff >= 0 ? '+' : ''}
                {diff}
              </span>
            </div>
          ) : (
            <div key={i} className={cx('flex flex-col', i === 2 && 'items-end')}>
              <span className="flex items-center gap-1.5">
                <SlotBadge slot={x[2]} />
                <span className="font-mono text-[14px] font-semibold" style={{ color: color(x[1]) }}>
                  {x[0].name}
                </span>
              </span>
              <span className="tnum mt-1 font-mono text-metric font-semibold">{x[0].total}</span>
            </div>
          ),
        )}
      </div>

      {/* 항목별 마주보기 막대 */}
      <ul className="flex flex-col gap-3 px-4 py-4">
        {COMPETENCIES.map((c) => {
          const va = a.scores[c.key]
          const vb = b.scores[c.key]
          const d = vb - va
          return (
            <li key={c.key}>
              <div className="mb-1 flex items-baseline justify-between text-[14px]">
                <span className="tnum w-8 font-mono font-semibold">{va}</span>
                <span className="text-text-muted">{c.name}</span>
                <span className="tnum w-8 text-right font-mono font-semibold">{vb}</span>
              </div>
              <div className="grid grid-cols-[1fr_44px_1fr] items-center gap-2">
                <div className="flex h-2 justify-end rounded-full bg-panel-raised">
                  <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${va}%`, background: color(ai) }} />
                </div>
                <span
                  className={cx(
                    'tnum text-center font-mono text-[13px] font-semibold',
                    d > 0 ? 'text-signal' : d < 0 ? 'text-alert' : 'text-text-faint',
                  )}
                >
                  {d > 0 ? '+' : ''}
                  {d}
                </span>
                <div className="h-2 rounded-full bg-panel-raised">
                  <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${vb}%`, background: color(bi) }} />
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      {/* 분기점 이후 달라진 결정 */}
      <div className="min-h-0 flex-1 overflow-auto border-t border-line px-4 py-4">
        <h3 className="label">DECISIONS AFTER FORK</h3>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {[
            [a, ai, 'A'] as const,
            [b, bi, 'B'] as const,
          ].map(([br, idx, slot]) => (
            <div key={slot} className="rounded-md border-l-2 bg-panel-raised p-3" style={{ borderColor: color(idx) }}>
              <div className="flex items-center gap-1.5">
                <SlotBadge slot={slot} />
                <span className="font-mono text-[13px] font-semibold" style={{ color: color(idx) }}>
                  {br.name}
                </span>
              </div>
              <ol className="mt-2 space-y-1.5">
                {br.summary.map((s, i) => (
                  <li key={s} className="flex gap-2 text-[14px] leading-5">
                    <span className="font-mono text-[12px] leading-5 text-text-faint">{String(i + 1).padStart(2, '0')}</span>
                    {s}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
        <Button variant="ghost" size="sm" className="mt-4" onClick={onClear}>
          선택 해제
        </Button>
      </div>
    </div>
  )
}

export default function Replay() {
  const [selected, setSelected] = useState<string[]>(['main', 'b2'])
  const [activeNode, setActiveNode] = useState<string | null>(null)

  const toggle = (id: string) => {
    if (selected.includes(id)) setSelected(selected.filter((s) => s !== id))
    else setSelected(selected.length >= 2 ? [selected[1], id] : [...selected, id])
  }

  return (
    <SelfShell
      header={
        <PageHeader label="SELF-CHECK REPLAY" title="주문 API 장애 원인 분석 — 복기 트리">
          <ButtonLink to="/exam/t-order-api?mode=self" variant="primary">
            <GitBranch size={18} aria-hidden /> 새 분기에서 다시 풀기
          </ButtonLink>
        </PageHeader>
      }
    >
      <div className="flex h-full flex-col">
        {/* 분기 범례 + 선택 슬롯 */}
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-8">
          <span className="label mr-2">BRANCHES</span>
          {branches.map((b, i) => {
            const slot = selected.indexOf(b.id)
            const on = slot >= 0
            return (
              <button
                key={b.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(b.id)}
                className={cx(
                  'flex h-9 items-center gap-2 rounded-md border px-2.5 transition-colors duration-[120ms]',
                  on ? 'border-line-strong bg-panel-raised' : 'border-line hover:border-line-strong',
                )}
              >
                {on ? <SlotBadge slot={slot === 0 ? 'A' : 'B'} /> : <span className="size-[18px]" aria-hidden />}
                <span className="h-[3px] w-4 rounded-full" style={{ background: color(i) }} aria-hidden />
                <span className="font-mono text-[14px] font-semibold">{b.name}</span>
                <ScoreChip score={b.total} />
              </button>
            )
          })}
          <span className="ml-auto flex items-center gap-1.5 text-[14px] text-text-muted">
            <GitCompareArrows size={18} aria-hidden /> 분기 두 개를 골라 비교
          </span>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-12">
          <section className="dot-grid col-span-7 min-h-0 overflow-auto border-r border-line py-6 pr-6" aria-label="분기 그래프">
            <div className="mb-2 flex items-center gap-4 pl-6">
              <span className="label">BRANCH GRAPH</span>
              <span className="flex items-center gap-3 text-[13px] text-text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full border-2 border-text-muted" aria-hidden /> 체크포인트
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-full bg-text-muted" aria-hidden /> 분기 시작
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-3.5 rounded-[3px] bg-text-muted" aria-hidden /> 제출 점수
                </span>
              </span>
            </div>
            <BranchGraph selected={selected} activeNode={activeNode} onNode={(id) => setActiveNode(activeNode === id ? null : id)} />
          </section>
          <section className="col-span-5 min-h-0 bg-panel" aria-label="분기 비교">
            <header className="flex h-10 items-center border-b border-line px-4">
              <span className="label">COMPARE</span>
              <span className="ml-3 text-[16px] font-semibold">항목별 비교</span>
            </header>
            <div className="h-[calc(100%-40px)]">
              <Compare ids={selected} onClear={() => setSelected([])} />
            </div>
          </section>
        </div>
      </div>
    </SelfShell>
  )
}
