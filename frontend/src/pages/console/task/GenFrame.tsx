// 과제 만들기 두 탭(자동 생성 / 직접 만들기)이 같이 쓰는 틀 (DESIGN.md §7-9-2).
// 위: 단계 표시(FlowSteps) / 왼쪽: 유리 폼 / 오른쪽 360px: 고른 값 요약 스포트라이트(스크롤해도 붙어 따라옴).
// 두 탭이 같은 폭·간격·카드를 써서 탭을 오가도 화면이 흔들리지 않는다.
import type { ReactNode } from 'react'
import { cx } from '../../../components/cx'
import { StageSection } from '../../../components/fx'

/** 폼(왼쪽) + 요약(오른쪽). 1024px 미만이면 요약이 폼 아래로 내려간다 */
export function GenFrame({ aside, children }: { aside: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto grid w-full max-w-[1180px] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0">{children}</div>
      <aside aria-label="고른 값 요약" className="lg:sticky lg:top-6">
        {aside}
      </aside>
    </div>
  )
}

export type SummaryRow = { label: string; value: ReactNode | null }

/** 오른쪽 요약: 고른 값 목록(비어 있으면 '아직 안 골랐어요') + 아래에 덧붙일 카드(주제 미리보기 등) */
export function GenSummary({ title = 'PREVIEW', rows, children }: { title?: string; rows: SummaryRow[]; children?: ReactNode }) {
  const filled = rows.filter((r) => r.value !== null && r.value !== '').length
  return (
    <StageSection aria-label="요약" className="min-h-[440px] px-6 py-6">
      <div className="flex items-baseline justify-between gap-3">
        <p className="label text-stage-brand">{title}</p>
        <p className="tnum font-mono text-[12px] text-stage-muted">
          채운 칸 {filled}/{rows.length}
        </p>
      </div>
      <dl className="mt-4 flex flex-col gap-3">
        {rows.map((r) => (
          <div key={r.label} className="flex items-start gap-3 border-b border-stage-line pb-2.5 last:border-b-0 last:pb-0">
            <dt className="w-16 shrink-0 pt-0.5 text-[13px] font-semibold text-stage-muted">{r.label}</dt>
            <dd className={cx('min-w-0 text-[15px] leading-6 font-semibold break-keep', r.value ? 'line-clamp-2 text-stage-text' : 'text-stage-faint')}>{r.value || '아직 안 골랐어요'}</dd>
          </div>
        ))}
      </dl>
      {children}
    </StageSection>
  )
}
