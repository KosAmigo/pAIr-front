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
