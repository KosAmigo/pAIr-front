// 부드럽게 펼쳐지고 접히는 영역. 높이를 직접 애니메이션하지 않고 grid-template-rows 0fr↔1fr 로 편다.
// 접힌 동안은 inert 라 탭 이동·스크린 리더에서 빠진다. 모션 줄이기 설정이면 바로 바뀐다.
import type { ReactNode } from 'react'
import { cx } from '../../../components/cx'

export function Collapse({ open, children, className }: { open: boolean; children: ReactNode; className?: string }) {
  return (
    <div
      inert={!open}
      className={cx(
        'grid transition-[grid-template-rows,opacity,visibility] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
        open ? 'grid-rows-[1fr] opacity-100' : 'invisible grid-rows-[0fr] opacity-0',
        className,
      )}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  )
}
