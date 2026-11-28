// 페이지 제목 옆 새로고침 아이콘 버튼. 누르면 바로 다시 불러오고, 마우스를 올리면 마지막 갱신 시각이 보인다.
import { RefreshCw } from 'lucide-react'

const clock = (ms: number | null) =>
  ms === null ? '아직 못 불러왔어요' : `마지막 갱신 ${[new Date(ms).getHours(), new Date(ms).getMinutes(), new Date(ms).getSeconds()].map((n) => String(n).padStart(2, '0')).join(':')}`

export function GenRefreshButton({ fetchedAt, refreshing, onRefresh }: { fetchedAt: number | null; refreshing: boolean; onRefresh: () => void }) {
  return (
    <button
      type="button"
      onClick={onRefresh}
      aria-label="새로고침"
      title={clock(fetchedAt)}
      className="inline-flex size-10 items-center justify-center rounded-lg text-text-muted transition-colors duration-150 outline-none hover:bg-panel-raised hover:text-text focus-visible:ring-4 focus-visible:ring-brand/30"
    >
      <RefreshCw size={16} aria-hidden className={refreshing ? 'motion-safe:animate-spin' : undefined} />
    </button>
  )
}
