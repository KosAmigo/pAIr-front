import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { PageHeader } from '../../components/SelfShell'
import { Button, Panel } from '../../components/ui'
import { taskIssuesApi, type TaskIssueCategory, type TaskIssueStatus } from '../../api'
import { queryKeys, errorMessage } from '../../data/queryKeys'

const categories: { value: TaskIssueCategory | 'ALL'; label: string }[] = [
  { value: 'ALL', label: '전체 카테고리' }, { value: 'QUESTION_ERROR', label: '문제 오류' },
  { value: 'ANSWER_EXPLANATION', label: '정답·해설 오류' }, { value: 'DESCRIPTION_GAP', label: '조건·설명 부족' },
  { value: 'DIFFICULTY', label: '난이도 의견' }, { value: 'OTHER', label: '기타' },
]
const statuses: { value: TaskIssueStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: '전체 상태' }, { value: 'NEW', label: '접수' }, { value: 'IN_REVIEW', label: '확인 중' },
  { value: 'RESOLVED', label: '반영 완료' }, { value: 'CLOSED', label: '종료' },
]
const categoryLabel = Object.fromEntries(categories.map((c) => [c.value, c.label])) as Record<string, string>
const statusLabel = Object.fromEntries(statuses.map((s) => [s.value, s.label])) as Record<string, string>
const date = (value: string) => new Date(value).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })

export default function ConsoleTaskIssues() {
  const [taskId, setTaskId] = useState('')
  const [category, setCategory] = useState<TaskIssueCategory | 'ALL'>('ALL')
  const [status, setStatus] = useState<TaskIssueStatus | 'ALL'>('ALL')
  const [page, setPage] = useState(0)
  const client = useQueryClient()
  const key = queryKeys.taskIssues(taskId, category, status, page)
  const q = useQuery({ queryKey: key, queryFn: () => taskIssuesApi.list({ taskId, category, status, page }), staleTime: 0 })
  async function update(id: number, next: TaskIssueStatus) {
    await taskIssuesApi.changeStatus(id, next)
    await client.invalidateQueries({ queryKey: ['admin-task-issues'] })
  }
  return <>
    <PageHeader label="TASK FEEDBACK" title="문제 건의함">
      {q.data && <span className="font-mono text-[13px] text-text-muted">총 {q.data.totalElements.toLocaleString('ko-KR')}건</span>}
    </PageHeader>
    <div className="flex flex-col gap-4 p-4 md:p-8">
      <div className="flex flex-wrap gap-2">
        <input aria-label="과제 코드" value={taskId} onChange={(e) => { setTaskId(e.target.value); setPage(0) }} placeholder="과제 코드" className="h-9 w-48 rounded-md border border-line-strong bg-panel px-3 text-sm text-text" />
        <select aria-label="카테고리" value={category} onChange={(e) => { setCategory(e.target.value as typeof category); setPage(0) }} className="h-9 rounded-md border border-line-strong bg-panel px-3 text-sm text-text">{categories.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select>
        <select aria-label="상태" value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(0) }} className="h-9 rounded-md border border-line-strong bg-panel px-3 text-sm text-text">{statuses.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}</select>
      </div>
      <Panel label="TASK FEEDBACK" title="접수된 건의" flush actions={q.isFetching ? <Loader2 size={16} className="animate-spin text-brand" aria-label="불러오는 중" /> : undefined}>
        {q.error ? <p role="alert" className="p-5 text-sm text-alert">{errorMessage(q.error) ?? '건의 목록을 불러오지 못했습니다.'} <button onClick={() => void q.refetch()} className="underline">다시 시도</button></p>
          : !q.data ? <p className="p-6 text-sm text-text-muted">불러오는 중…</p>
          : q.data.items.length === 0 ? <p className="p-10 text-center text-sm text-text-muted">접수된 건의가 없습니다.</p>
          : <div className="divide-y divide-line">
            {q.data.items.map((issue) => <article key={issue.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-start md:p-5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted"><span className="font-mono">{issue.taskId}</span><span>·</span><span>{issue.taskTitle}</span><span>·</span><span>{categoryLabel[issue.category] ?? issue.category}</span>{issue.questionNumber && <><span>·</span><span>{issue.questionNumber}</span></>}</div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-text">{issue.message}</p>
                <p className="mt-2 text-xs text-text-muted">{issue.submitterName} · {issue.submitterEmail} · {date(issue.createdAt)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-xs text-text-muted">{statusLabel[issue.status]}</span>
                <select aria-label={`${issue.taskTitle} 건의 상태`} value={issue.status} onChange={(e) => void update(issue.id, e.target.value as TaskIssueStatus)} className="h-9 rounded-md border border-line-strong bg-panel px-2 text-sm text-text">
                  {statuses.slice(1).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </article>)}
          </div>}
        {q.data && q.data.totalPages > 1 && <div className="flex items-center justify-end gap-3 border-t border-line p-3 text-sm"><span className="text-text-muted">{page + 1} / {q.data.totalPages}</span><Button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>이전</Button><Button disabled={page + 1 >= q.data.totalPages} onClick={() => setPage((p) => p + 1)}>다음</Button></div>}
      </Panel>
    </div>
  </>
}
