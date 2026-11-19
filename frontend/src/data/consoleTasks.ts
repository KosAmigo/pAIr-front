// 콘솔 과제 목록 (DESIGN.md §7-9-1 ~ 9-3). 데이터는 백엔드(/api/console/tasks)에서만 온다.
// 목록은 과제 화면과 콘솔 메뉴(검수 대기 숫자)가 같이 쓰므로, 받아 온 결과를 여기 한 곳에 담아 둔다.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { consoleApi, type ConsoleTaskDetail, type ConsoleTaskSummary, type TaskPublicationStatus } from '../consoleApi'
import { KINDS } from './catalog'

/** 목록 탭: 검수 대기 = HIDDEN, 공개 = OPEN (백엔드에는 이 두 상태만 있다) */
export type TaskTab = 'draft' | 'open'
export const tabOf = (status: TaskPublicationStatus): TaskTab => (status === 'OPEN' ? 'open' : 'draft')

export const kindName = (key: string) => KINDS.find((k) => k.key === key)?.name ?? key
/** 백엔드 과제 type(dev | biz) → 직군 이름 */
export const trackName = (type: string) => (type === 'biz' ? '비개발' : '개발')

type State = { list: ConsoleTaskSummary[] | null; error: string | null; loading: boolean }
let state: State = { list: null, error: null, loading: false }
const subs = new Set<() => void>()
const set = (s: Partial<State>) => {
  state = { ...state, ...s }
  subs.forEach((f) => f())
}
const subscribe = (f: () => void) => {
  subs.add(f)
  return () => subs.delete(f)
}

/** 과제 목록을 다시 받아 온다 */
export async function loadTasks() {
  set({ loading: true, error: null })
  try {
    set({ list: await consoleApi.tasks(), loading: false })
  } catch (e) {
    set({ error: e instanceof Error ? e.message : String(e), loading: false })
  }
}

/** 받아 온 과제 목록. 처음 쓸 때 한 번 불러온다. enabled=false 면 불러오지 않는다 (관리자 아닌 역할) */
export function useTaskList(enabled = true) {
  const s = useSyncExternalStore(subscribe, () => state)
  useEffect(() => {
    if (enabled && state.list == null && !state.loading && state.error == null) void loadTasks()
  }, [enabled])
  return s
}

/** 공개 상태 바꾸기(관리자). 바뀐 요약으로 목록을 고친다 */
export async function setPublished(id: string, open: boolean) {
  const next = open ? await consoleApi.publishTask(id) : await consoleApi.hideTask(id)
  if (state.list) set({ list: state.list.map((t) => (t.id === id ? next : t)) })
  return next
}

/** 과제 하나의 요약과 정의(설명·요구사항·후속 질문 등). setSummary 로 공개 상태가 바뀐 요약을 반영한다 */
export function useTaskDetail(id: string | undefined) {
  const [tick, setTick] = useState(0)
  // 어떤 요청(과제 ID + 다시 시도 횟수)의 결과인지 key 로 구분해, 이전 과제의 결과를 보여 주지 않는다
  const key = `${id}#${tick}`
  const [res, setRes] = useState<{ key: string; detail: ConsoleTaskDetail | null; error: string | null } | null>(null)
  useEffect(() => {
    if (!id) return
    let alive = true
    consoleApi.task(id).then(
      (d) => alive && setRes({ key, detail: d, error: null }),
      (e) => alive && setRes({ key, detail: null, error: e instanceof Error ? e.message : String(e) }),
    )
    return () => {
      alive = false
    }
  }, [id, key])
  const cur = res?.key === key ? res : null
  const reload = useCallback(() => setTick((n) => n + 1), [])
  const setSummary = useCallback(
    (summary: ConsoleTaskSummary) => setRes((r) => (r?.detail ? { ...r, detail: { ...r.detail, summary } } : r)),
    [],
  )
  return { detail: cur?.detail ?? null, error: cur?.error ?? null, reload, setSummary }
}
