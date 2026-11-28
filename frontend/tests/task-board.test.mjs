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

test('countTabs and firstTab: 처음에는 검수 전(비었으면 자가진단), 탭 순서는 검수 전 → 자가진단 → 실전', () => {
  const list = [t({}), t({ status: 'OPEN' }), t({ status: 'OPEN', usage: 'LIVE' }), t({ status: 'CLOSED', usage: 'LIVE' })]
  assert.deepEqual(countTabs(list), { draft: 1, public: 1, private: 2 })
  assert.equal(firstTab(countTabs(list)), 'draft')
  assert.equal(firstTab({ draft: 0, public: 0, private: 3 }), 'public')
  assert.deepEqual(TAB_ORDER, ['draft', 'public', 'private'])
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

test('toCandidateQuestion hides answers, accepted answers and sources', () => {
  const q = toCandidateQuestion({
    id: 7, seq: 2, type: 'SINGLE', content: '어느 것?', points: 5,
    choices: [{ id: 2, seq: 2, content: 'B', correct: true }, { id: 1, seq: 1, content: 'A', correct: false }],
    answers: ['42'], sources: [{ path: '자료/a.pdf', pages: '1' }],
  })
  assert.deepEqual(q, { id: 7, seq: 2, type: 'SINGLE', content: '어느 것?', points: 5, choices: [{ id: 1, seq: 1, content: 'A' }, { id: 2, seq: 2, content: 'B' }], answer: null })
  assert.equal(JSON.stringify(q).includes('correct'), false)
})

test('matchesQuery: 정규식 특수문자는 글자 그대로, 낱말 순서·위치 무관, 초성, 한글 이름, 직군·상태 이름', () => {
  const a = t({ id: 'incident-log-7', title: '쿠폰 할인 계산 (v2)', summary: '중복 적용 함정', category: 'incident', status: 'OPEN', track: 'DEV' })
  for (const q of ['[', '*', '?', String.fromCharCode(92), '.', '+', '|', '$', '^']) assert.equal(matchesQuery(a, q), false, q)
  assert.equal(matchesQuery(a, '(v2)'), true)
  assert.equal(matchesQuery(a, '계산 쿠폰'), true) // 낱말 순서 무관
  assert.equal(matchesQuery(a, '쿠폰 환불'), false)
  assert.equal(matchesQuery(a, 'ㅋㅍ'), true) // 초성
  assert.equal(matchesQuery(a, 'ㅎㅇ'), true) // 할인
  assert.equal(matchesQuery(a, 'ㅋㅋ'), false)
  assert.equal(matchesQuery(a, 'incident-log'), true) // 코드, 하이픈
  assert.equal(matchesQuery(a, 'incidentlog'), true)
  assert.equal(matchesQuery(a, '장애'), false) // 이름 함수 없으면 못 찾음
  assert.equal(matchesQuery(a, '장애분석', () => '장애 분석'), true) // 주제의 한글 이름
  assert.equal(matchesQuery(a, '개발'), true) // 직군 이름
  assert.equal(matchesQuery(a, '비개발'), false)
  assert.equal(matchesQuery(a, '자가진단'), true) // 상태 이름
  assert.equal(matchesQuery(a, '검수전'), false)
  assert.equal(matchesQuery(a, '　쿠폰　'), true) // 전각 공백
  assert.equal(matchesQuery(a, '쿠폰'.normalize('NFD')), true) // 풀어쓴 한글(맥)
  assert.equal(matchesQuery(a, '   '), true) // 공백만 = 거르지 않음
})
