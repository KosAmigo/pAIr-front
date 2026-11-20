import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  tabOf,
  countTabs,
  firstTab,
  filterTasks,
  trackOf,
  checkBadge,
  usageLock,
  usageReducer,
  usageErrorMessage,
  readChecklist,
  writeChecklist,
  checklistDone,
  toCandidateQuestion,
} from '../src/data/taskBoard.ts'

const t = (o) => ({ id: 'T', type: 'dev', title: '과제', minutes: 60, usage: 'SELF', parentId: null, status: 'HIDDEN', publishedAt: null, updatedAt: null, ...o })

test('tabOf: 검수 전 = HIDDEN, 공개 문제 = OPEN/CLOSED + SELF, 비공개 문제 = OPEN/CLOSED + LIVE', () => {
  assert.equal(tabOf(t({ status: 'HIDDEN', usage: 'LIVE' })), 'draft')
  assert.equal(tabOf(t({ status: 'OPEN', usage: 'SELF' })), 'public')
  assert.equal(tabOf(t({ status: 'CLOSED', usage: 'SELF' })), 'public')
  assert.equal(tabOf(t({ status: 'OPEN', usage: 'LIVE' })), 'private')
  assert.equal(tabOf(t({ status: 'CLOSED', usage: 'LIVE' })), 'private')
})

test('countTabs and firstTab open 검수 전 first only when it has tasks', () => {
  const list = [t({}), t({ status: 'OPEN' }), t({ status: 'OPEN', usage: 'LIVE' }), t({ status: 'CLOSED', usage: 'LIVE' })]
  assert.deepEqual(countTabs(list), { draft: 1, public: 1, private: 2 })
  assert.equal(firstTab(countTabs(list)), 'draft')
  assert.equal(firstTab({ draft: 0, public: 0, private: 3 }), 'private')
  assert.equal(firstTab({ draft: 0, public: 0, private: 0 }), 'public')
})

test('trackOf falls back to the old type field when track is missing', () => {
  assert.equal(trackOf(t({ type: 'biz' })), 'BIZ')
  assert.equal(trackOf(t({ type: 'dev', track: 'BIZ' })), 'BIZ')
  assert.equal(trackOf(t({ type: 'dev', track: null })), 'DEV')
})

test('filterTasks filters by tab, track, search (title, code, summary) and sorts newest first', () => {
  const list = [
    t({ id: 'A', title: '쿠폰 계산', createdAt: '2026-11-18T00:00:00Z' }),
    t({ id: 'B', type: 'biz', title: '요금제', summary: '손익 비교', createdAt: '2026-11-20T00:00:00Z' }),
    t({ id: 'C', status: 'OPEN', title: '쿠폰 공개' }),
  ]
  assert.deepEqual(filterTasks(list, { tab: 'draft', track: 'ALL', q: '' }).map((x) => x.id), ['B', 'A'])
  assert.deepEqual(filterTasks(list, { tab: 'draft', track: 'DEV', q: '' }).map((x) => x.id), ['A'])
  assert.deepEqual(filterTasks(list, { tab: 'draft', track: 'ALL', q: '손익' }).map((x) => x.id), ['B'])
  assert.deepEqual(filterTasks(list, { tab: 'draft', track: 'ALL', q: ' a ' }).map((x) => x.id), ['A'])
  assert.deepEqual(filterTasks(list, { tab: 'public', track: 'ALL', q: '쿠폰' }).map((x) => x.id), ['C'])
})

test('checkBadge only for AI generated tasks with a result', () => {
  assert.equal(checkBadge(t({})), null)
  assert.equal(checkBadge(t({ generated: true, checksOk: null })), null)
  assert.equal(checkBadge(t({ generated: true, checksOk: true })), 'pass')
  assert.equal(checkBadge(t({ generated: true, checksOk: false })), 'fail')
})

test('usageLock: only 검수 전 and not a copy', () => {
  assert.equal(usageLock(t({})), null)
  assert.match(usageLock(t({ status: 'OPEN' })), /공개한 과제/)
  assert.match(usageLock(t({ parentId: 'P' })), /복사본/)
})

test('usageReducer switches at once, keeps the server value, and rolls back on failure', () => {
  let s = { usage: 'SELF', saving: false, prev: null, error: null }
  s = usageReducer(s, { type: 'request', usage: 'LIVE' })
  assert.deepEqual(s, { usage: 'LIVE', saving: true, prev: 'SELF', error: null })
  // 저장 중에는 다시 눌러도 무시
  assert.equal(usageReducer(s, { type: 'request', usage: 'SELF' }), s)
  assert.deepEqual(usageReducer(s, { type: 'success', usage: 'LIVE' }), { usage: 'LIVE', saving: false, prev: null, error: null })
  const failed = usageReducer(s, { type: 'fail', error: '안 돼요' })
  assert.deepEqual(failed, { usage: 'SELF', saving: false, prev: null, error: '안 돼요' })
  // 같은 값을 고르면 아무 일도 없음
  assert.equal(usageReducer(failed, { type: 'request', usage: 'SELF' }), failed)
})

test('usageErrorMessage explains 409 in plain words', () => {
  assert.match(usageErrorMessage({ status: 409 }), /공개한 적 있는 과제이거나 복사본/)
  assert.match(usageErrorMessage({ status: 404 }), /아직 서버에 없어요/)
})

test('checklist storage survives a broken or blocked localStorage', () => {
  const mem = new Map()
  const store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) }
  assert.deepEqual(readChecklist('T-1', store), {})
  assert.equal(writeChecklist('T-1', { level: true, answer: true }, store), true)
  assert.deepEqual(readChecklist('T-1', store), { level: true, answer: true })
  assert.equal(checklistDone(readChecklist('T-1', store)), 2)
  mem.set('pair.taskReview.T-2', '{not json')
  assert.deepEqual(readChecklist('T-2', store), {})
  const blocked = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } }
  assert.deepEqual(readChecklist('T-1', blocked), {})
  assert.equal(writeChecklist('T-1', { level: true }, blocked), false)
  assert.deepEqual(readChecklist('T-1', undefined), {})
})

test('toCandidateQuestion hides answers, accepted answers and sources', () => {
  const q = toCandidateQuestion({
    id: 7, seq: 2, type: 'SINGLE', content: '어느 것?', points: 5,
    choices: [{ id: 2, seq: 2, content: 'B', correct: true }, { id: 1, seq: 1, content: 'A', correct: false }],
    answers: ['42'], sources: [{ path: '자료/a.pdf', pages: '1' }],
  })
  assert.deepEqual(q, { id: 7, seq: 2, type: 'SINGLE', content: '어느 것?', points: 5, choices: [{ id: 1, seq: 1, content: 'A' }, { id: 2, seq: 2, content: 'B' }], answer: null })
  assert.equal(JSON.stringify(q).includes('correct'), false)
})
