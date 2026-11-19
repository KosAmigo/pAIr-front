// DESIGN.md §7-9-2 AI로 과제 만들기 (ADMIN).
// 과제를 만드는(AI 생성) 백엔드 API 가 아직 없어 준비 중 안내만 보여 준다. 목업 생성 연출은 지웠다.
import { Sparkles } from 'lucide-react'
import { useConsoleCrumbs } from '../../components/consoleCrumbs'
import { PageHeader } from '../../components/SelfShell'
import { ButtonLink } from '../../components/ui'

export default function ConsoleTaskNew() {
  useConsoleCrumbs(['AI로 만들기'])
  return (
    <>
      <PageHeader label="NEW TASK" title="AI로 과제 만들기" />
      <div className="p-8">
        <div className="mx-auto flex max-w-[560px] flex-col items-center gap-3 rounded-2xl border border-line bg-panel px-10 py-14 text-center shadow-sm">
          <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-brand-dim text-brand">
            <Sparkles size={26} strokeWidth={1.9} aria-hidden />
          </span>
          <h2 className="mt-2 text-[20px] font-bold text-text">준비 중인 기능입니다</h2>
          <p className="text-[15px] leading-6 break-keep text-text-muted">
            AI로 과제 초안을 만드는 기능은 아직 서버에 없습니다. 지금은 등록된 과제를 확인하고 공개 상태만 바꿀 수 있습니다.
          </p>
          <ButtonLink to="/console/tasks" variant="primary" size="sm" className="mt-3">
            과제 목록으로
          </ButtonLink>
        </div>
      </div>
    </>
  )
}
