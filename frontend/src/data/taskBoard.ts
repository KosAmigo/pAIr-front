// 과제 콘솔의 화면 규칙(탭 나누기, 거르기, 용도 바꾸기 상태, 검수 체크리스트)을 모은 순수 로직.
// 화면·API 를 부르지 않으므로 node 테스트(tests/task-board.test.mjs)에서 바로 쓴다.
// 상태 이름은 화면에 영어로 보이지 않게 여기서 "검수 전 / 자가진단 / 실전"로 바꾼다 (2026-11-20 결정).
import type { AdminQuestion, ConsoleTaskSummary, TaskUsage } from '../consoleApi'
import type { Question } from './questions'

/** 검수 전 = HIDDEN, 자가진단 = OPEN(또는 내림 CLOSED) + SELF, 실전 = OPEN(또는 CLOSED) + LIVE */
export type TaskTab = 'draft' | 'public' | 'private'
export const TAB_LABEL: Record<TaskTab, string> = { draft: '검수 전', public: '자가진단', private: '실전' }
export const TAB_HINT: Record<TaskTab, string> = {
  draft: '어디에도 안 보여요. 사람이 확인해야 해요',
  public: '누구나 자가진단에서 풀 수 있어요',
  private: '회차에만 쓰고 자가진단에는 안 보여요',
}

type Row = Pick<ConsoleTaskSummary, 'status' | 'usage'>

export function tabOf(t: Row): TaskTab {
  if (t.status === 'HIDDEN') return 'draft'
  return t.usage === 'LIVE' ? 'private' : 'public'
}

/** 공개했다가 내린(CLOSED) 과제: 목록에는 남고 새 응시는 막힌다 */
export const isClosed = (t: Pick<ConsoleTaskSummary, 'status'>) => t.status === 'CLOSED'

export function countTabs(list: Row[]): Record<TaskTab, number> {
  const c: Record<TaskTab, number> = { draft: 0, public: 0, private: 0 }
  for (const t of list) c[tabOf(t)]++
  return c
}

/** 탭 순서: 검수 전 → 자가진단 → 실전. 처음에는 검수 전, 검수 전이 비어 있으면 자가진단 */
export const TAB_ORDER: TaskTab[] = ['draft', 'public', 'private']
export const firstTab = (counts?: Record<TaskTab, number>): TaskTab => (!counts || counts.draft > 0 ? 'draft' : 'public')

export type Track = 'DEV' | 'BIZ'
export type TrackFilter = 'ALL' | Track

/** 새 칸(track)이 없으면 예전 칸(type: dev | biz)으로 판단 */
export const trackOf = (t: Pick<ConsoleTaskSummary, 'type' | 'track'>): Track => t.track ?? (t.type === 'biz' ? 'BIZ' : 'DEV')
export const TRACK_LABEL: Record<Track, string> = { DEV: '개발', BIZ: '비개발' }

/** 만든 날(없으면 수정·공개 시각). 정렬과 카드 표시에 쓴다 */
export const madeAt = (t: Pick<ConsoleTaskSummary, 'createdAt' | 'updatedAt' | 'publishedAt'>) => t.createdAt ?? t.updatedAt ?? t.publishedAt ?? null

/** 검색용 글자 정리: 공백을 모두 없애고 소문자로 */
export const normalizeSearch = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, '').toLowerCase()

/** 제목·한 줄 소개·주제(category)·코드에 검색어가 들어 있는지. 부분 일치, 공백·대소문자 무시 */
export function matchesQuery(t: Pick<ConsoleTaskSummary, 'title' | 'id' | 'summary' | 'category'>, q: string): boolean {
  const n = normalizeSearch(q)
  return !n || [t.title, t.summary, t.category, t.id].some((v) => normalizeSearch(v).includes(n))
}

/** 탭, 직군, 검색어로 거르고 최근 만든 것부터 */
export function filterTasks<T extends ConsoleTaskSummary>(list: T[], f: { tab: TaskTab; track: TrackFilter; q: string }): T[] {
  return list
    .filter((t) => tabOf(t) === f.tab)
    .filter((t) => f.track === 'ALL' || trackOf(t) === f.track)
    .filter((t) => matchesQuery(t, f.q))
    .sort((a, b) => (madeAt(b) ?? '').localeCompare(madeAt(a) ?? ''))
}

/** 자동 확인 배지: AI 생성이 아니면 없음 */
export function checkBadge(t: Pick<ConsoleTaskSummary, 'generated' | 'checksOk'>): 'pass' | 'fail' | null {
  if (!t.generated || t.checksOk == null) return null
  return t.checksOk ? 'pass' : 'fail'
}

// ── 용도 바꾸기 ──────────────────────────────

/** 용도는 검수 전일 때만, 그리고 복사본이 아닐 때만 바꿀 수 있다 (백엔드 409 와 같은 규칙) */
export function usageLock(t: Pick<ConsoleTaskSummary, 'status' | 'parentId'>): string | null {
  if (t.status !== 'HIDDEN') return '공개한 과제는 용도를 바꿀 수 없어요. 숨긴 뒤에도 공개한 적이 있으면 바뀌지 않아요.'
  if (t.parentId) return '다른 과제의 복사본이라 용도를 바꿀 수 없어요.'
  return null
}

/**
 * 용도 토글 상태. 누르는 즉시 화면을 바꾸고(낙관적), 실패하면 원래 값으로 되돌리며 이유를 남긴다.
 * request → success(서버 값) | fail(이유)
 */
export type UsageState = { usage: TaskUsage; saving: boolean; prev: TaskUsage | null; error: string | null }
export type UsageAction =
  | { type: 'request'; usage: TaskUsage }
  | { type: 'success'; usage: TaskUsage }
  | { type: 'fail'; error: string }
  | { type: 'reset'; usage: TaskUsage }

export function usageReducer(s: UsageState, a: UsageAction): UsageState {
  switch (a.type) {
    case 'request':
      if (s.saving || a.usage === s.usage) return s
      return { usage: a.usage, saving: true, prev: s.usage, error: null }
    case 'success':
      return { usage: a.usage, saving: false, prev: null, error: null }
    case 'fail':
      return { usage: s.prev ?? s.usage, saving: false, prev: null, error: a.error }
    case 'reset':
      return { usage: a.usage, saving: false, prev: null, error: null }
  }
}

export function usageErrorMessage(e: unknown): string {
  const status = (e as { status?: number } | null)?.status
  if (status === 409) return '공개한 적 있는 과제이거나 복사본이라 용도를 바꿀 수 없어요.'
  if (status === 403) return '관리자만 용도를 바꿀 수 있어요.'
  if (status === 404) return '용도 바꾸기 기능이 아직 서버에 없어요. 백엔드를 최신으로 받아 주세요.'
  return e instanceof Error ? e.message : '용도를 바꾸지 못했어요.'
}

// ── 응시자로 보기 ────────────────────────────

/** 관리자 문항(정답·근거 포함)을 응시자 화면 문항 모양으로. 정답, 인정 답안, 근거는 빼서 화면에 새지 않게 한다 */
export function toCandidateQuestion(q: AdminQuestion): Question {
  return {
    id: q.id,
    seq: q.seq,
    type: q.type,
    content: q.content,
    points: q.points,
    choices: [...q.choices].sort((a, b) => a.seq - b.seq).map(({ id, seq, content }) => ({ id, seq, content })),
    answer: null,
  }
}
