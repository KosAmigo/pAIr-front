import { TriangleAlert } from 'lucide-react'
import { useCamHub } from './useCamHub.ts'

/** 서버 추론이 멈췄을 때만 보이는 안내. 응시자가 할 일은 없고 시험은 계속된다 */
export function VisionDownBanner() {
  const { serverMode, vision } = useCamHub()
  if (!serverMode || vision !== 'down') return null
  return (
    <div
      role="status"
      data-testid="vision-down-banner"
      className="fixed top-14 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-2 rounded-md border border-caution/40 bg-panel-raised px-4 py-2 text-[14px] shadow-modal"
    >
      <TriangleAlert size={16} className="text-caution" aria-hidden />
      감독이 일시 중단되었습니다. 시험은 계속됩니다.
    </div>
  )
}
