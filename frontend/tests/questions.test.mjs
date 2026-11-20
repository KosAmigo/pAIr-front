import assert from 'node:assert/strict'
import { afterEach, mock, test } from 'node:test'
import { answeredCount, createAnswerSaver, isAnswered, questionsApi, saveErrorMessage } from '../src/data/questions.ts'

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
  mock.timers.reset()
})

const err = (status) => Object.assign(new Error('x'), { status })
const tick = () => new Promise((r) => setImmediate(r))

function setup(save, debounceMs = 800) {
  const log = []
  let locked = 0
  const saver = createAnswerSaver({
    save,
    onState: (id, state, error) => log.push([id, state, error]),
    onLocked: () => locked++,
    debounceMs,
  })
  return { saver, log, locked: () => locked }
}

test('answer helpers', () => {
  assert.equal(isAnswered(null), false)
  assert.equal(isAnswered({ choiceIds: [] }), false)
  assert.equal(isAnswered({ choiceIds: [3] }), true)
  assert.equal(isAnswered({ text: '  ' }), false)
  assert.equal(isAnswered({ text: '12' }), true)
  assert.equal(answeredCount([{ answer: { text: 'a' } }, { answer: null }, { answer: { choiceIds: [1] } }]), 2)
})

test('questionsApi calls the agreed endpoints', async () => {
  const calls = []
  globalThis.fetch = async (url, o) => {
    calls.push([o.method, url, o.body])
    return Response.json([])
  }
  await questionsApi.list('att-1')
  await questionsApi.save('att-1', 7, { choiceIds: [1, 2] })
  await questionsApi.save('att-1', 8, { text: '42' })
  assert.deepEqual(calls[0], ['GET', '/api/attempts/att-1/questions', undefined])
  assert.deepEqual(calls[1], ['PUT', '/api/attempts/att-1/questions/7/answer', JSON.stringify({ choiceIds: [1, 2] })])
  assert.deepEqual(calls[2], ['PUT', '/api/attempts/att-1/questions/8/answer', JSON.stringify({ text: '42' })])
})

test('choice is saved at once: saving then saved', async () => {
  const sent = []
  const { saver, log } = setup(async (id, a) => sent.push([id, a]))
  saver.choose(1, [5])
  await saver.flush()
  assert.deepEqual(sent, [[1, { choiceIds: [5] }]])
  assert.deepEqual(log.map((l) => l[1]), ['saving', 'saved'])
})

test('typing is saved once, 0.8s after the last key', async () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  const sent = []
  const { saver, log } = setup(async (id, a) => sent.push(a))
  saver.type(2, '1')
  mock.timers.tick(500)
  saver.type(2, '12')
  mock.timers.tick(799)
  assert.equal(sent.length, 0)
  mock.timers.tick(1)
  await tick()
  assert.deepEqual(sent, [{ text: '12' }])
  assert.deepEqual(log.map((l) => l[1]), ['saving', 'saved'])
})

test('failure shows error, retry resends the same answer', async () => {
  let fail = true
  const sent = []
  const { saver, log } = setup(async (id, a) => {
    sent.push(a)
    if (fail) throw err(500)
  })
  saver.choose(1, [9])
  await saver.flush()
  assert.equal(log.at(-1)[1], 'error')
  assert.match(log.at(-1)[2], /다시 시도/)
  fail = false
  saver.retry(1)
  await saver.flush()
  assert.deepEqual(sent, [{ choiceIds: [9] }, { choiceIds: [9] }])
  assert.equal(log.at(-1)[1], 'saved')
})

test('answers changed during a save: only the latest is sent next, in order', async () => {
  const sent = []
  let release
  const { saver, log } = setup((id, a) => {
    sent.push(a)
    return sent.length === 1 ? new Promise((r) => (release = r)) : Promise.resolve()
  })
  saver.choose(1, [1])
  await tick()
  saver.choose(1, [1, 2])
  saver.choose(1, [2])
  assert.equal(sent.length, 1)
  release()
  await saver.flush()
  assert.deepEqual(sent, [{ choiceIds: [1] }, { choiceIds: [2] }])
  assert.equal(log.at(-1)[1], 'saved')
})

test('409 locks the panel and shows no error', async () => {
  const { saver, log, locked } = setup(async () => {
    throw err(409)
  })
  saver.choose(1, [1])
  await saver.flush()
  assert.equal(locked(), 1)
  assert.ok(!log.some((l) => l[1] === 'error'))
})

test('flush sends a waiting typed answer right away', async () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  const sent = []
  const { saver } = setup(async (id, a) => sent.push(a))
  saver.type(3, 'abc')
  await saver.flush()
  assert.deepEqual(sent, [{ text: 'abc' }])
})

test('error messages are easy sentences', () => {
  assert.match(saveErrorMessage(err(403)), /내 응시/)
  assert.match(saveErrorMessage(err(400)), /형식/)
  assert.match(saveErrorMessage(err(500)), /다시 시도/)
})

test('dispose sends what is waiting, and the saver still works afterwards (React StrictMode re-runs effects)', async () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  const sent = []
  const { saver } = setup(async (id, a) => sent.push(a))
  saver.type(1, 'abc')
  saver.dispose()
  await tick()
  saver.choose(2, [4])
  await saver.flush()
  assert.deepEqual(sent, [{ text: 'abc' }, { choiceIds: [4] }])
})
