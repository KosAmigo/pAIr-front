import { X } from 'lucide-react'
import { branchColor, compareScores, type TreeRow } from '../../lib/replayTree'

const color = (branch: number) => `var(--color-branch-${branchColor(branch)})`

function Diff({ v }: { v: number | null }) {
  if (v == null) return <span className="text-stage-muted">-</span>
  if (v === 0) return <span className="text-stage-muted">0</span>
  return <span className={v > 0 ? 'text-signal' : 'text-alert'}>{v > 0 ? `+${v}` : v}</span>
}

/** 두 갈래의 채점 점수를 항목별로 나란히 보여 준다. 차이는 B 에서 A 를 뺀 값이다 */
export function ScoreCompare({ a, b, onClear }: { a: TreeRow & { score: NonNullable<TreeRow['score']> }; b: TreeRow & { score: NonNullable<TreeRow['score']> }; onClear: () => void }) {
  const { items, total } = compareScores(a.score, b.score)
  const head = (tag: string, r: TreeRow) => (
    <th scope="col" className="px-2 py-1.5 text-right font-mono text-[13px]" style={{ color: color(r.branch) }}>
      {tag} · {r.label}
    </th>
  )
  return (
    <section aria-label="점수 비교" className="mt-4 rounded-lg border border-stage-line bg-stage-panel p-3">
      <header className="mb-2 flex items-center">
        <p className="label text-stage-muted">COMPARE</p>
        <span className="ml-2 text-[15px] font-semibold text-stage-text">두 풀이 점수 비교</span>
        <button type="button" onClick={onClear} aria-label="비교 닫기" title="비교 닫기" className="ml-auto rounded-md p-1 text-stage-muted hover:bg-stage-raised hover:text-stage-text">
          <X size={16} aria-hidden />
        </button>
      </header>
      <table className="w-full text-[14px] text-stage-text">
        <thead>
          <tr className="border-b border-stage-line text-left text-stage-muted">
            <th scope="col" className="px-2 py-1.5 font-medium">항목</th>
            {head('A', a)}
            {head('B', b)}
            <th scope="col" className="px-2 py-1.5 text-right font-medium">B−A</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.key} className="border-b border-stage-line/60">
              <th scope="row" className="px-2 py-1.5 text-left font-normal">
                {i.name} <span className="font-mono text-[12px] text-stage-muted">/{i.max}</span>
              </th>
              <td className="tnum px-2 py-1.5 text-right font-mono">{i.a ?? '-'}</td>
              <td className="tnum px-2 py-1.5 text-right font-mono">{i.b ?? '-'}</td>
              <td className="tnum px-2 py-1.5 text-right font-mono"><Diff v={i.diff} /></td>
            </tr>
          ))}
          <tr className="font-semibold">
            <th scope="row" className="px-2 py-2 text-left">
              총점 <span className="font-mono text-[12px] font-normal text-stage-muted">/{total.max}</span>
            </th>
            <td className="tnum px-2 py-2 text-right font-mono">{total.a}</td>
            <td className="tnum px-2 py-2 text-right font-mono">{total.b}</td>
            <td className="tnum px-2 py-2 text-right font-mono"><Diff v={total.diff} /></td>
          </tr>
        </tbody>
      </table>
    </section>
  )
}
