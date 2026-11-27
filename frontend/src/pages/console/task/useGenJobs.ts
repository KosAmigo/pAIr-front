// 만드는 중인 작업 목록 조회 (공용): GET /api/admin/task-gen/jobs?active=true
// React Query 가 조회 하나를 들고 있다. 화면이 몇 군데에서 써도 같은 키라서 구독자가 있는 동안 한 줄로만 조회한다.
// 도는 작업(대기·진행)이 있으면 3초마다, 없으면 30초마다(jobsPollMs). 숨은 탭에서는 쉬고, 앞 조회가 끝난 뒤에 다음 시간을 잰다.
// 작업이 DONE 으로 바뀌는 것을 보면 doneSeq 가 늘어난다 (과제 목록이 이 값이 바뀔 때 다시 불러온다).
import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { queryClient } from '../../../queryClient'
import { queryKeys, errorMessage } from '../../../data/queryKeys'
import { taskGenApi, type JobRow } from '../../../data/taskGen'
import { activeCount, jobsPollMs, newlyDone } from '../../../data/taskGenJobs'

export { JOBS_BUSY_MS as JOBS_POLL_MS } from '../../../data/taskGenJobs'

type Jobs = { rows: JobRow[]; doneSeq: number }

async function fetchJobs(): Promise<Jobs> {
  const next = await taskGenApi.jobs()
  const rows = Array.isArray(next) ? next : []
  const prev = queryClient.getQueryData<Jobs>(queryKeys.genJobs)
  const done = newlyDone(prev?.rows ?? null, rows)
  return { rows, doneSeq: (prev?.doneSeq ?? 0) + (done.length ? 1 : 0) }
}

/** 새 작업을 넣거나 취소한 직후 바로 한 번 더 가져온다 (간격도 다시 잰다). 조회 중이면 그 조회를 그대로 쓴다 */
export function refreshGenJobs() {
  return queryClient.invalidateQueries({ queryKey: queryKeys.genJobs }, { cancelRefetch: false })
}

// 새로고침 버튼이 도는 상태: 여러 화면이 같이 보도록 캐시에 둔다
const setRefreshing = (v: boolean) => queryClient.setQueryData(queryKeys.genJobsRefreshing, v)

/** 새로고침 버튼: 바로 다시 불러오고, 도는 동안(최소 0.5초) refreshing 이 켜져 아이콘이 돈다 */
export async function refreshGenJobsNow() {
  setRefreshing(true)
  try {
    await Promise.all([refreshGenJobs(), new Promise((r) => window.setTimeout(r, 500))])
  } finally {
    setRefreshing(false)
  }
}

export function useGenJobs() {
  const q = useQuery({
    queryKey: queryKeys.genJobs,
    queryFn: fetchJobs,
    staleTime: 0,
    refetchInterval: (query) => jobsPollMs(query.state.data?.rows ?? null),
    refetchIntervalInBackground: false,
  })
  const flag = useQuery({ queryKey: queryKeys.genJobsRefreshing, queryFn: () => false, enabled: false, initialData: false, staleTime: Infinity })
  const rows = q.data?.rows ?? null
  const refresh = useCallback(() => void refreshGenJobs(), [])
  return {
    rows,
    error: errorMessage(q.error),
    doneSeq: q.data?.doneSeq ?? 0,
    fetchedAt: q.dataUpdatedAt || null,
    refreshing: flag.data,
    active: activeCount(rows),
    refresh,
    refreshNow: refreshGenJobsNow,
  }
}
