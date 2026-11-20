import { X } from 'lucide-react'
import { branchColor, type TreeRow } from '../../lib/replayTree'
import { CheckReasons } from './CheckReasons'
import { ScoreTable } from './ScoreTable'

type Scored = TreeRow & { score: NonNullable<TreeRow['score']> }

const color = (branch: number) => `var(--color-branch-${branchColor(branch)})`

/**
 * 두 풀이를 골랐을 때 복기 트리와 AI 대화 기록 아래에 열리는 상세 박스.
 * 왼쪽은 항목별 점수 비교, 오른쪽은 점수가 왜 달라졌는지(결과가 바뀐 감점 체크와 채점 이유·근거).
 */
export function CompareDetail({ a, b, onClear }: { a: Scored; b: Scored; onClear: () => void }) {
  return (
    <section aria-label="두 풀이 비교 상세" className="rounded-xl border border-line bg-panel p-5 shadow-sm">
      <header className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="label">COMPARE</p>
        <h2 className="text-[17px] font-semibold text-text">두 풀이 비교</h2>
        <p className="font-mono text-[14px]">
          <span style={{ color: color(a.branch) }}>A · {a.label} {a.score.total}점</span>
          <span className="mx-2 text-text-muted">vs</span>
          <span style={{ color: color(b.branch) }}>B · {b.label} {b.score.total}점</span>
        </p>
        <button type="button" onClick={onClear} aria-label="비교 닫기" title="비교 닫기" className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-[14px] text-text-muted hover:bg-panel-raised hover:text-text">
          <X size={16} aria-hidden /> 닫기
        </button>
      </header>
      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <ScoreTable a={a} b={b} />
        </div>
        <div className="lg:col-span-7">
          <CheckReasons aId={a.attemptId} bId={b.attemptId} aLabel={a.label} bLabel={b.label} />
        </div>
      </div>
    </section>
  )
}
