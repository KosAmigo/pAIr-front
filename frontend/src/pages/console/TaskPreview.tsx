// DESIGN.md §7-9-3 응시자로 보기: 응시 화면을 미리보기 띠와 함께 띄운다.
// 목업 단계라 응시 화면은 과제 직군에 맞는 예시 응시(개발/비개발)를 보여준다. 응시 기록은 남지 않는다.
import { Eye, X } from 'lucide-react'
import { useParams } from 'react-router-dom'
import Exam from '../Exam'
import { useConsoleTask } from '../../data/consoleTasks'

export default function TaskPreview() {
  const { taskId } = useParams()
  const task = useConsoleTask(taskId)
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-8 shrink-0 items-center gap-2 bg-info px-4 text-[13px] font-medium text-on-accent">
        <Eye size={14} aria-hidden />
        미리보기 — {task?.title ?? '과제'} │ 응시 기록이 남지 않습니다
        <button type="button" onClick={() => window.close()} className="ml-auto inline-flex items-center gap-1 rounded-sm px-2 py-0.5 hover:bg-white/15">
          <X size={14} aria-hidden /> 닫기
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <Exam />
      </div>
    </div>
  )
}
