// 고른 작업 하나의 상태(GET /task-gen/{id})와 만들어진 내용(GET /task-gen/{id}/content)을 3초마다 가져온다.
// 끝난 작업(DONE·FAILED·CANCELED)은 한 번 더 받고 멈춘다. 작업을 바꾸면 이전 결과는 보여 주지 않는다.
// content 조회가 실패해도(백엔드가 아직 없거나 404) 상태는 계속 보인다 — 내용 칸은 '아직 만들지 않았어요'로 둔다.
import { useQuery } from '@tanstack/react-query'
import { queryClient } from '../../../queryClient'
import { queryKeys } from '../../../data/queryKeys'
import { taskGenApi, type GenContent, type TaskGenJob } from '../../../data/taskGen'
import { isEnded } from '../../../data/taskGenJobs'

const DETAIL_POLL_MS = 3000

export type JobDetail = { jobId: string; job: TaskGenJob | null; content: GenContent | null; error: string | null; contentError: string | null }

export function useGenJobDetail(jobId: string | null, intervalMs = DETAIL_POLL_MS): JobDetail | null {
  const key = queryKeys.genJobDetail(jobId ?? '')
  const q = useQuery({
    queryKey: key,
    enabled: !!jobId,
    queryFn: async (): Promise<JobDetail> => {
      const id = jobId!
      const [j, c] = await Promise.allSettled([taskGenApi.job(id), taskGenApi.content(id)])
      const err = (r: PromiseRejectedResult) => (r.reason instanceof Error ? r.reason.message : String(r.reason))
      const old = queryClient.getQueryData<JobDetail>(key)
      return {
        jobId: id,
        // 조회가 한 번 실패해도 앞서 받은 값은 그대로 둔다
        job: j.status === 'fulfilled' ? j.value : (old?.job ?? null),
        content: c.status === 'fulfilled' ? c.value : (old?.content ?? null),
        error: j.status === 'rejected' ? err(j) : null,
        contentError: c.status === 'rejected' ? err(c) : null,
      }
    },
    // 끝난 작업은 한 번 더 받고 멈춘다. 숨은 탭에서는 쉰다(refetchIntervalInBackground 기본값)
    refetchInterval: (query) => (query.state.data?.job && isEnded(query.state.data.job.status) ? false : intervalMs),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  })
  return jobId && q.data?.jobId === jobId ? q.data : null
}
