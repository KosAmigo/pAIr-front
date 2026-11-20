import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { taskGenApi, pollJob, stepStates, startErrorMessage, validateForm, allChecksOk } from '../src/data/taskGen.ts'

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

const job = (o) => ({ status: 'RUNNING', step: '생성 중', taskCode: null, checks: [], error: null, ...o })
const REQ = { track: 'DEV', jobRole: '백엔드', difficulty: '중급', topic: '쿠폰', trap: '중복', usage: 'SELF', minutes: 60 }

test('start posts the form and maps 429/403/400 to easy sentences', async () => {
  globalThis.fetch = async (url, o) => {
    assert.equal(url, '/api/admin/task-gen')
    assert.equal(o.method, 'POST')
    assert.deepEqual(JSON.parse(o.body), REQ)
    return Response.json({ message: 'x' }, { status: 429 })
  }
  await assert.rejects(taskGenApi.start(REQ), (e) => /다른 과제를 만드는 중/.test(startErrorMessage(e)))
  globalThis.fetch = async () => Response.json({ message: 'x' }, { status: 403 })
  await assert.rejects(taskGenApi.start(REQ), (e) => /관리자만/.test(startErrorMessage(e)))
  globalThis.fetch = async () => Response.json({ message: '주제가 비었어요' }, { status: 400 })
  await assert.rejects(taskGenApi.start(REQ), (e) => /주제가 비었어요/.test(startErrorMessage(e)))
})

test('pollJob reports every state and stops on DONE', async () => {
  const seq = [job(), job({ step: '확인 중' }), job({ status: 'DONE', step: '저장 중', taskCode: 'T-1', checks: [{ name: 'a', ok: true, detail: '' }] })]
  const seen = []
  const done = await pollJob('j', (j) => seen.push(j.step), { signal: new AbortController().signal, intervalMs: 1, fetchJob: async () => seq.shift() })
  assert.deepEqual(seen, ['생성 중', '확인 중', '저장 중'])
  assert.equal(done.taskCode, 'T-1')
  assert.equal(allChecksOk(done), true)
})

test('pollJob stops when aborted and survives one failed lookup', async () => {
  const ac = new AbortController()
  let n = 0
  const p = pollJob('j', () => ac.abort(), { signal: ac.signal, intervalMs: 1, fetchJob: async () => { n++; if (n === 1) throw new Error('net'); return job() } })
  await assert.rejects(p, { name: 'AbortError' })
  assert.equal(n, 2)
})

test('pollJob gives up after repeated failures', async () => {
  await assert.rejects(pollJob('j', () => {}, { signal: new AbortController().signal, intervalMs: 1, maxErrors: 2, fetchJob: async () => { throw new Error('down') } }), /down/)
})

test('stepStates hides the retry step unless it happened', () => {
  assert.deepEqual(stepStates('확인 중', false).map((s) => s.step), ['생성 중', '확인 중', '저장 중'])
  assert.deepEqual(stepStates('확인 중', false).map((s) => s.state), ['done', 'active', 'todo'])
  assert.deepEqual(stepStates('저장 중', true).map((s) => s.state), ['done', 'done', 'done', 'active'])
})

test('validateForm allows 비개발 and blocks empty fields', () => {
  assert.deepEqual(Object.keys(validateForm({ ...REQ })), [])
  assert.deepEqual(Object.keys(validateForm({ ...REQ, track: 'BIZ' })), [])
  assert.deepEqual(Object.keys(validateForm({ ...REQ, jobRole: ' ', topic: '', trap: '' })).sort(), ['jobRole', 'topic', 'trap'])
})

// ── AI 추천 (2026-11-20) ──
import { suggestRequest, applySuggestion, overwriteConflicts, nextExclude, suggestErrorMessage, progressOf, stepNarration } from '../src/data/taskGen.ts'

const SUG = { jobRole: '백엔드', difficulty: '고급', topic: '재고 차감 동시성', trap: '락 없이 읽고 쓰면 재고가 음수', trapType: '동시성', why: '흔한 실수' }

test('suggest posts track, optional jobRole and exclude', async () => {
  assert.deepEqual(suggestRequest({ track: 'BIZ', jobRole: ' ', difficulty: '중급' }), { track: 'BIZ' })
  assert.deepEqual(suggestRequest({ track: 'DEV', jobRole: ' 백엔드 ', difficulty: '중급' }, ['a']), { track: 'DEV', jobRole: '백엔드', exclude: ['a'] })
  globalThis.fetch = async (url, o) => {
    assert.equal(url, '/api/admin/task-gen/suggestions')
    assert.equal(o.method, 'POST')
    assert.deepEqual(JSON.parse(o.body), { track: 'DEV', exclude: ['x'] })
    return Response.json({ suggestions: [SUG, SUG, SUG] })
  }
  const res = await taskGenApi.suggest({ track: 'DEV', exclude: ['x'] })
  assert.equal(res.suggestions.length, 3)
})

test('suggest errors 429/503/404 become plain sentences', async () => {
  for (const [status, re] of [[429, /1분에 10번/], [503, /추천을 만들지 못했어요/], [404, /아직 서버에 없어요/], [403, /관리자만/]]) {
    globalThis.fetch = async () => Response.json({ message: 'x' }, { status })
    await assert.rejects(taskGenApi.suggest({ track: 'DEV' }), (e) => re.test(suggestErrorMessage(e)))
  }
})

test('applySuggestion fills jobRole, difficulty, topic, trap and keeps the rest', () => {
  const f = { ...REQ, jobRole: '', topic: '', trap: '', usage: 'LIVE', minutes: 40 }
  assert.deepEqual(applySuggestion(f, SUG), { ...f, jobRole: '백엔드', difficulty: '고급', topic: '재고 차감 동시성', trap: '락 없이 읽고 쓰면 재고가 음수' })
})

test('overwriteConflicts only lists fields the user typed differently', () => {
  assert.deepEqual(overwriteConflicts({ jobRole: '', topic: '', trap: '' }, SUG), [])
  assert.deepEqual(overwriteConflicts({ jobRole: '백엔드', topic: '내 주제', trap: '  ' }, SUG), ['topic'])
  assert.deepEqual(overwriteConflicts({ jobRole: '프런트', topic: SUG.topic, trap: 'x' }, SUG), ['jobRole', 'trap'])
})

test('nextExclude stacks earlier topics without duplicates and keeps the latest', () => {
  assert.deepEqual(nextExclude([], [{ topic: 'a' }, { topic: 'b' }]), ['a', 'b'])
  assert.deepEqual(nextExclude(['a', 'b'], [{ topic: 'b' }, { topic: ' c ' }]), ['a', 'b', 'c'])
  assert.deepEqual(nextExclude(['a', 'b', 'c'], [{ topic: 'd' }], 2), ['c', 'd'])
})

test('progressOf grows within a step, never goes back across steps, stays below 1', () => {
  const a = progressOf('생성 중', false, 0)
  const b = progressOf('생성 중', false, 20)
  const c = progressOf('확인 중', false, 0)
  const d = progressOf('저장 중', false, 999)
  assert.equal(a, 0)
  assert.ok(b > a && b < c, `${b} < ${c}`)
  assert.ok(d < 1 && d > c)
  assert.ok(progressOf('다시 생성 중', true, 0) > progressOf('확인 중', true, 0))
  assert.match(stepNarration('확인 중', 'DEV'), /테스트/)
  assert.match(stepNarration('저장 중', 'BIZ'), /PDF/)
})

test('start error about shared DB + local storage is explained', async () => {
  globalThis.fetch = async () => Response.json({ message: '공용 DB에 연결돼 있어 PDF를 이 PC에만 저장할 수 없습니다.' }, { status: 500 })
  await assert.rejects(taskGenApi.start(REQ), (e) => /local 저장소/.test(startErrorMessage(e)) && /PAIR_TASKFILE_STORAGE=s3/.test(startErrorMessage(e)))
})

test('validateForm asks for a track first', () => {
  assert.deepEqual(Object.keys(validateForm({ ...REQ, track: null })), ['track'])
})
