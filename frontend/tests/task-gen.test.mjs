import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { taskGenApi, pollJob, stepStates, startErrorMessage, validateForm, allChecksOk } from '../src/data/taskGen.ts'

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

const job = (o) => ({ status: 'RUNNING', step: '생성 중', taskCode: null, checks: [], error: null, ...o })
const REQ = { track: 'DEV', topic: '쿠폰', trap: '중복', usage: 'SELF', minutes: 40 }

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
  assert.deepEqual(Object.keys(validateForm({ ...REQ, topic: '', trap: ' ' })).sort(), ['topic', 'trap'])
})

// ── AI 추천 (2026-11-23 새 API) ──
import {
  suggestRequest, applySuggestion, overwriteConflicts, nextExclude, suggestErrorMessage, progressOf, stepNarration,
  buildGenRequest, GEN_MINUTES, recordSuggestions, pickSuggestion, acceptTopicCheck, needsTopicCheck, visibleSuggestions,
  isAgain, excludeFor, topicCheckText,
} from '../src/data/taskGen.ts'

const sug = (n, o = {}) => ({ situation: `상황${n}`, trap: `함정${n}`, trapType: '경계값', competencies: ['control'], why: '흔한 실수', ...o })
const SUG = sug(1, { situation: '재고 차감 동시성', trap: '락 없이 읽고 쓰면 재고가 음수' })
const res = (ns, topicCheck = null) => ({ topicCheck, suggestions: ns.map((n) => sug(n)) })

test('suggest posts track, optional topic and exclude (no jobRole/difficulty)', async () => {
  assert.deepEqual(suggestRequest({ track: 'BIZ', topic: ' ' }), { track: 'BIZ' })
  assert.deepEqual(suggestRequest({ track: 'DEV', topic: ' 쿠폰 ' }, ['a']), { track: 'DEV', topic: '쿠폰', exclude: ['a'] })
  globalThis.fetch = async (url, o) => {
    assert.equal(url, '/api/admin/task-gen/suggestions')
    assert.equal(o.method, 'POST')
    assert.deepEqual(JSON.parse(o.body), { track: 'DEV', exclude: ['x'] })
    return Response.json(res([1, 2, 3]))
  }
  const r = await taskGenApi.suggest({ track: 'DEV', exclude: ['x'] })
  assert.equal(r.suggestions.length, 3)
  assert.equal(r.topicCheck, null)
})

test('suggest errors 429/503/404 become plain sentences', async () => {
  for (const [status, re] of [[429, /1분에 10번/], [503, /추천을 만들지 못했어요/], [404, /아직 서버에 없어요/], [403, /관리자만/]]) {
    globalThis.fetch = async () => Response.json({ message: 'x' }, { status })
    await assert.rejects(taskGenApi.suggest({ track: 'DEV' }), (e) => re.test(suggestErrorMessage(e)))
  }
})

test('generation request has no jobRole/difficulty and minutes is 20, 40 or 60', async () => {
  assert.deepEqual(GEN_MINUTES, [20, 40, 60])
  for (const m of GEN_MINUTES) {
    const body = buildGenRequest({ track: 'BIZ', topic: ' 요금제 ', trap: ' 중복 ', usage: 'LIVE', minutes: m, jobRole: '무시', difficulty: '고급' })
    assert.deepEqual(body, { track: 'BIZ', topic: '요금제', trap: '중복', usage: 'LIVE', minutes: m })
    assert.equal('jobRole' in body || 'difficulty' in body, false)
    globalThis.fetch = async (url, o) => {
      const sent = JSON.parse(o.body)
      assert.deepEqual(Object.keys(sent).sort(), ['minutes', 'topic', 'track', 'trap', 'usage'])
      assert.equal(sent.minutes, m)
      return Response.json({ jobId: 'j' })
    }
    assert.equal((await taskGenApi.start(body)).jobId, 'j')
  }
})

test('applySuggestion fills topic(=situation) and trap and keeps the rest', () => {
  const f = { ...REQ, topic: '', trap: '', usage: 'LIVE', minutes: 20 }
  assert.deepEqual(applySuggestion(f, SUG), { ...f, topic: '재고 차감 동시성', trap: '락 없이 읽고 쓰면 재고가 음수' })
})

test('overwriteConflicts only lists fields the user typed differently', () => {
  assert.deepEqual(overwriteConflicts({ topic: '', trap: '' }, SUG), [])
  assert.deepEqual(overwriteConflicts({ topic: '내 주제', trap: '  ' }, SUG), ['topic'])
  assert.deepEqual(overwriteConflicts({ topic: SUG.situation, trap: 'x' }, SUG), ['trap'])
})

test('nextExclude stacks earlier situations without duplicates and keeps the latest', () => {
  assert.deepEqual(nextExclude([], [{ situation: 'a' }, { situation: 'b' }]), ['a', 'b'])
  assert.deepEqual(nextExclude(['a', 'b'], [{ situation: 'b' }, { situation: ' c ' }]), ['a', 'b', 'c'])
  assert.deepEqual(nextExclude(['a', 'b', 'c'], [{ situation: 'd' }], 2), ['c', 'd'])
})

test('suggestions are kept per track: switching track and back keeps list and picked card', () => {
  let st = {}
  st = recordSuggestions(st, 'DEV', '', res([1, 2, 3]))
  st = pickSuggestion(st, 'DEV', '상황2')
  st = recordSuggestions(st, 'BIZ', '', res([4, 5, 6]))
  assert.deepEqual(st.DEV.items.map((s) => s.situation), ['상황1', '상황2', '상황3'])
  assert.equal(st.DEV.picked, '상황2')
  assert.deepEqual(st.BIZ.items.map((s) => s.situation), ['상황4', '상황5', '상황6'])
  assert.equal(st.BIZ.picked, null)
  assert.equal(visibleSuggestions(st.DEV).length, 3)
  assert.equal(visibleSuggestions(undefined), null)
})

test('"다시 추천" keeps excluding earlier situations of that track; a new topic starts a fresh list', () => {
  let st = recordSuggestions({}, 'DEV', '쿠폰', res([1, 2, 3]))
  assert.equal(isAgain(st.DEV, '쿠폰'), true)
  assert.deepEqual(excludeFor(st.DEV, ' 쿠폰 '), ['상황1', '상황2', '상황3'])
  st = recordSuggestions(st, 'DEV', '쿠폰', res([4, 5, 6]))
  assert.deepEqual(st.DEV.exclude, ['상황1', '상황2', '상황3', '상황4', '상황5', '상황6'])
  assert.equal(isAgain(st.DEV, '환불'), false)
  assert.deepEqual(excludeFor(st.DEV, '환불'), [])
  st = recordSuggestions(st, 'DEV', '환불', res([7, 8, 9]))
  assert.deepEqual(st.DEV.items.map((s) => s.situation), ['상황7', '상황8', '상황9'])
  assert.deepEqual(st.DEV.exclude, ['상황7', '상황8', '상황9'])
  assert.equal(st.BIZ, undefined)
})

test('topicCheck: ok=false hides the cards until "이대로 보기"; ok=true or null shows them at once', () => {
  const bad = { ok: false, understood: '쿠폰 할인 계산', message: '조금 달라 보여요.' }
  let st = recordSuggestions({}, 'DEV', '쿠뽕', res([1, 2, 3], bad))
  assert.equal(needsTopicCheck(st.DEV), true)
  assert.equal(visibleSuggestions(st.DEV), null)
  assert.equal(topicCheckText('쿠뽕', bad), "'쿠뽕'를 '쿠폰 할인 계산'(으)로 이해했어요. 조금 달라 보여요. 이대로 볼까요?")
  st = acceptTopicCheck(st, 'DEV')
  assert.equal(needsTopicCheck(st.DEV), false)
  assert.equal(visibleSuggestions(st.DEV).length, 3)
  const good = recordSuggestions({}, 'BIZ', '요금제', res([1, 2, 3], { ok: true, understood: '요금제' }))
  assert.equal(needsTopicCheck(good.BIZ), false)
  assert.equal(visibleSuggestions(good.BIZ).length, 3)
  assert.equal(needsTopicCheck(recordSuggestions({}, 'BIZ', '', res([1], null)).BIZ), false)
  assert.equal(topicCheckText('a', { ok: false, understood: 'b' }), "'a'를 'b'(으)로 이해했어요. 이대로 볼까요?")
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
