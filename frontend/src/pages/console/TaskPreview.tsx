// DESIGN.md §7-9-3 응시자로 보기: 응시자에게 보일 과제 내용을 미리보기 띠와 함께 띄운다.
// 데이터는 백엔드 과제 정의(/api/console/tasks/{id}). 응시 기록은 남지 않는다.
import { Eye, Loader2, X } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { ErrorState } from '../../components/ErrorState'
import { useTaskDetail } from '../../data/consoleTasks'
import { TaskDefinitionView } from './ConsoleTaskEdit'

export default function TaskPreview() {
  const { taskId } = useParams()
  const { detail, error, reload } = useTaskDetail(taskId)
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-8 shrink-0 items-center gap-2 bg-info px-4 text-[13px] font-medium text-on-accent">
        <Eye size={14} aria-hidden />
        미리보기 — {detail?.summary.title ?? '과제'} │ 응시 기록이 남지 않습니다
        <button type="button" onClick={() => window.close()} className="ml-auto inline-flex items-center gap-1 rounded-sm px-2 py-0.5 hover:bg-white/15">
          <X size={14} aria-hidden /> 닫기
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto bg-bg p-8">
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : !detail ? (
          <p className="flex items-center justify-center gap-2 py-32 text-[14px] text-text-muted">
            <Loader2 size={18} className="animate-spin text-brand" aria-hidden /> 과제를 불러오는 중
          </p>
        ) : (
          <div className="mx-auto flex max-w-[1080px] flex-col gap-5">
            <header>
              <h1 className="text-[26px] font-bold tracking-tight text-text">{detail.summary.title}</h1>
              <p className="mt-1 text-[14px] text-text-muted">제한 시간 {detail.summary.minutes}분</p>
            </header>
            <TaskDefinitionView definition={detail.definition} grading={false} />
          </div>
        )}
      </div>
    </div>
  )
}
