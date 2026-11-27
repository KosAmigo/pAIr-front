// 만드는 중인 작업 목록 조회 (공용): GET /api/admin/task-gen/jobs?active=true
// 조회는 모듈에 하나뿐이다. 화면이 몇 군데에서 써도 구독자가 있는 동안 한 줄로만 조회한다(중복 조회 없음).
// 도는 작업(대기·진행)이 있으면 3초마다, 없으면 30초마다. 숨은 탭에서는 쉬고, 앞 조회가 끝난 뒤에 다음 시간을 잰다.
// 작업이 DONE 으로 바뀌는 것을 보면 doneSeq 가 늘어난다 (과제 목록이 이 값이 바뀔 때 다시 불러온다).
import { useCallback, useSyncExternalStore } from 'react'
import { taskGenApi, type JobRow } from '../../../data/taskGen'
import { activeCount, jobsPollMs, newlyDone } from '../../../data/taskGenJobs'

export { JOBS_BUSY_MS as JOBS_POLL_MS } from '../../../data/taskGenJobs'

type State = { rows: JobRow[] | null; error: string | null; doneSeq: number; fetchedAt: number | null; refreshing: boolean }
let state: State = { rows: null, error: null, doneSeq: 0, fetchedAt: null, refreshing: false }
const subs = new Set<() => void>()
let timer: number | undefined
let busy = false

const set = (s: Partial<State>) => {
  state = { ...state, ...s }
  subs.forEach((f) => f())
}

async function load() {
  if (busy) return
  busy = true
  try {
    const next = await taskGenApi.jobs()
    const rows = Array.isArray(next) ? next : []
    const done = newlyDone(state.rows, rows)
    set({ rows, error: null, fetchedAt: Date.now(), doneSeq: done.length ? state.doneSeq + 1 : state.doneSeq })
  } catch (e) {
    set({ error: e instanceof Error ? e.message : String(e) })
  } finally {
    busy = false
  }
}

function schedule() {
  window.clearTimeout(timer)
  if (subs.size === 0) return
  timer = window.setTimeout(() => void tick(), jobsPollMs(state.rows))
}

async function tick() {
  if (!document.hidden) await load()
  schedule()
}

function subscribe(f: () => void) {
  subs.add(f)
  if (subs.size === 1) void tick()
  return () => {
    subs.delete(f)
    if (subs.size === 0) window.clearTimeout(timer)
  }
}

/** 새 작업을 넣거나 취소한 직후 바로 한 번 더 가져온다 (간격도 다시 잰다) */
export function refreshGenJobs() {
  void load().then(schedule)
}

/** 새로고침 버튼: 바로 다시 불러오고, 도는 동안(최소 0.5초) refreshing 이 켜져 아이콘이 돈다 */
export async function refreshGenJobsNow() {
  set({ refreshing: true })
  await Promise.all([load(), new Promise((r) => window.setTimeout(r, 500))])
  set({ refreshing: false })
  schedule()
}

export function useGenJobs() {
  const s = useSyncExternalStore(subscribe, () => state)
  const refresh = useCallback(() => refreshGenJobs(), [])
  return { rows: s.rows, error: s.error, doneSeq: s.doneSeq, fetchedAt: s.fetchedAt, refreshing: s.refreshing, active: activeCount(s.rows), refresh, refreshNow: refreshGenJobsNow }
}
