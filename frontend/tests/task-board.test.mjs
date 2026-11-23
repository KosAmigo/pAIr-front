import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  tabOf,
  countTabs,
  firstTab,
  filterTasks,
  matchesQuery,
  TAB_ORDER,
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

test('tabOf: 검수 전 = HIDDEN, 자가진단 = OPEN/CLOSED + SELF, 실전 = OPEN/CLOSED + LIVE', () => {
  assert.equal(tabOf(t({ status: 'HIDDEN', usage: 'LIVE' })), 'draft')
  assert.equal(tabOf(t({ status: 'OPEN', usage: 'SELF' })), 'public')
  assert.equal(tabOf(t({ status: 'CLOSED', usage: 'SELF' })), 'public')
  assert.equal(tabOf(t({ status: 'OPEN', usage: 'LIVE' })), 'private')
  assert.equal(tabOf(t({ status: 'CLOSED', usage: 'LIVE' })), 'private')
})

test('countTabs and firstTab: 처음에는 늘 자가진단, 탭 순서는 자가진단 → 실전 → 검수 전', () => {
  const list = [t({}), t({ status: 'OPEN' }), t({ status: 'OPEN', usage: 'LIVE' }), t({ status: 'CLOSED', usage: 'LIVE' })]
  assert.deepEqual(countTabs(list), { draft: 1, public: 1, private: 2 })
  assert.equal(firstTab(countTabs(list)), 'public')
  assert.equal(firstTab({ draft: 0, public: 0, private: 3 }), 'public')
  assert.deepEqual(TAB_ORDER, ['public', 'private', 'draft'])
})

test('matchesQuery: 부분 일치, 공백·대소문자 무시, 결과 없음', () => {
  const a = t({ id: 'T-1', title: '쿠폰 할인 계산', summary: '중복 적용 함정', category: 'Backend API' })
  assert.equal(matchesQuery(a, ''), true)
  assert.equal(matchesQuery(a, '할인'), true) // 부분 일치
  assert.equal(matchesQuery(a, '쿠폰할인'), true) // 공백 무시
  assert.equal(matchesQuery(a, '  쿠 폰  '), true)
  assert.equal(matchesQuery(a, '중복적용'), true) // 한 줄 소개
  assert.equal(matchesQuery(a, 'BACKEND api'), true) // 대소문자·공백 무시, 주제
  assert.equal(matchesQuery(a, '환불'), false)
  assert.equal(matchesQuery(t({ title: 'x', summary: null, category: null }), '환불'), false)
})

test('filterTasks 검색은 탭·직군 안에서만 찾고, 결과가 없으면 빈 목록', () => {
  const list = [
    t({ id: 'A', title: '쿠폰 계산' }),
    t({ id: 'B', type: 'biz', title: '쿠폰 요금제' }),
    t({ id: 'C', status: 'OPEN', title: '쿠폰 공개' }),
  ]
  assert.deepEqual(filterTasks(list, { tab: 'draft', track: 'ALL', q: '쿠 폰' }).map((x) => x.id).sort(), ['A', 'B'])
  assert.deepEqual(filterTasks(list, { tab: 'draft', track: 'BIZ', q: '쿠폰' }).map((x) => x.id), ['B'])
  assert.deepEqual(filterTasks(list, { tab: 'public', track: 'BIZ', q: '쿠폰' }), [])
  assert.deepEqual(filterTasks(list, { tab: 'draft', track: 'ALL', q: '없는말' }), [])
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
