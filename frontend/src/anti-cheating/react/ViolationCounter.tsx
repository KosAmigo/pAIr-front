export function ViolationCounter({ count }: { count: number }) {
  return (
    <span role="status" aria-label={`시험 화면 이탈 ${count}회`} className="rounded-sm border border-line px-2 py-1 font-mono text-[12px] text-text-muted" title="브라우저 이벤트 통합 기준 누적 횟수">
      이탈 {count}
    </span>
  )
}
