import { branchColor, compareScores, type TreeRow } from '../../lib/replayTree'

const color = (branch: number) => `var(--color-branch-${branchColor(branch)})`

type Scored = TreeRow & { score: NonNullable<TreeRow['score']> }

function Diff({ v }: { v: number | null }) {
  if (v == null) return <span className="text-text-muted">-</span>
  if (v === 0) return <span className="text-text-muted">0</span>
  return <span className={v > 0 ? 'text-signal' : 'text-alert'}>{v > 0 ? `+${v}` : v}</span>
}

/** 두 풀이의 채점 점수를 항목별로 나란히 보여 주는 표. 차이는 B 에서 A 를 뺀 값이다 */
export function ScoreTable({ a, b }: { a: Scored; b: Scored }) {
  const { items, total } = compareScores(a.score, b.score)
  const head = (tag: string, r: TreeRow) => (
    <th scope="col" className="px-2 py-1.5 text-right font-mono text-[13px]" style={{ color: color(r.branch) }}>
      {tag} · {r.label}
    </th>
  )
  return (
    <table className="w-full text-[14px] text-text">
      <caption className="sr-only">두 풀이의 항목별 점수</caption>
      <thead>
        <tr className="border-b border-line text-left text-text-muted">
          <th scope="col" className="px-2 py-1.5 font-medium">항목</th>
          {head('A', a)}
          {head('B', b)}
          <th scope="col" className="px-2 py-1.5 text-right font-medium">B−A</th>
        </tr>
      </thead>
      <tbody>
        {items.map((i) => (
          <tr key={i.key} className="border-b border-line/60">
            <th scope="row" className="px-2 py-1.5 text-left font-normal">
              {i.name} <span className="font-mono text-[12px] text-text-muted">/{i.max}</span>
            </th>
            <td className="tnum px-2 py-1.5 text-right font-mono">{i.a ?? '-'}</td>
            <td className="tnum px-2 py-1.5 text-right font-mono">{i.b ?? '-'}</td>
            <td className="tnum px-2 py-1.5 text-right font-mono"><Diff v={i.diff} /></td>
          </tr>
        ))}
        <tr className="font-semibold">
          <th scope="row" className="px-2 py-2 text-left">
            총점 <span className="font-mono text-[12px] font-normal text-text-muted">/{total.max}</span>
          </th>
          <td className="tnum px-2 py-2 text-right font-mono">{total.a}</td>
          <td className="tnum px-2 py-2 text-right font-mono">{total.b}</td>
          <td className="tnum px-2 py-2 text-right font-mono"><Diff v={total.diff} /></td>
        </tr>
      </tbody>
    </table>
  )
}
