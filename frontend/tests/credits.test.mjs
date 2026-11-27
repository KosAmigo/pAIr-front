import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { api, chatStream } from '../src/api.ts'
import { createCreditStore, fetchCredits } from '../src/data/credits.ts'

const originalFetch = globalThis.fetch
const originalStorage = globalThis.localStorage

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalStorage === undefined) delete globalThis.localStorage
  else globalThis.localStorage = originalStorage
})

function session(token) {
  globalThis.localStorage = {
    getItem: () => token ? JSON.stringify({ token, user: { id: 1, role: 'USER' } }) : null,
  }
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail })
  return { promise, resolve, reject }
}

test('balance request sends bearer authentication and validates the response', async () => {
  session('token-a')
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/credits')
    assert.equal(options.headers.Authorization, 'Bearer token-a')
    return Response.json({ balance: 0 })
  }
  assert.equal(await fetchCredits(), 0)
  globalThis.fetch = async () => Response.json({})
  await assert.rejects(fetchCredits(), /응답이 올바르지 않습니다/)
})

test('loading, successful refresh and failure remain distinct', async () => {
  let next = deferred()
  const store = createCreditStore('a', () => next.promise, () => 'a')
  const loading = store.getState().refresh()
  assert.deepEqual(store.getState().state, { status: 'loading' })
  next.resolve(200)
  await loading
  assert.deepEqual(store.getState().state, { status: 'ready', balance: 200 })

  next = deferred()
  const refreshed = store.getState().refresh()
  assert.deepEqual(store.getState().state, { status: 'loading' })
  next.resolve(190)
  await refreshed
  assert.deepEqual(store.getState().state, { status: 'ready', balance: 190 })

  next = deferred()
  const failed = store.getState().refresh()
  next.reject(new Error('offline'))
  await failed
  assert.deepEqual(store.getState().state, { status: 'error' })
})

test('older responses and responses after logout or account change cannot overwrite current balance', async () => {
  let token = 'a'
  const requests = []
  const store = createCreditStore('a', () => {
    const request = deferred()
    requests.push(request)
    return request.promise
  }, () => token)
  const first = store.getState().refresh()
  const second = store.getState().refresh()
  requests[1].resolve(190)
  await second
  requests[0].resolve(200)
  await first
  assert.deepEqual(store.getState().state, { status: 'ready', balance: 190 })

  const pending = store.getState().refresh()
  token = 'b'
  requests[2].resolve(180)
  await pending
  assert.deepEqual(store.getState().state, { status: 'loading' })
  await store.getState().refresh()
  assert.equal(requests.length, 3)
  token = undefined
  await store.getState().refresh()
  assert.equal(requests.length, 3)
})

test('cancel ignores the in-flight response and the store notifies subscribers', async () => {
  const next = deferred()
  const store = createCreditStore('a', () => next.promise, () => 'a')
  const seen = []
  const unsubscribe = store.subscribe((s) => seen.push(s.state.status))
  const pending = store.getState().refresh()
  store.getState().cancel()
  next.resolve(500)
  await pending
  assert.deepEqual(store.getState().state, { status: 'loading' })
  assert.deepEqual(seen, ['loading'])
  unsubscribe()
})

test('HTTP 402 preserves the backend message for start and non-streaming chat', async () => {
  session('token-a')
  globalThis.fetch = async () => Response.json({ message: '크레딧이 부족합니다.' }, { status: 402 })
  await assert.rejects(api.start('task'), /크레딧이 부족합니다\./)
  await assert.rejects(api.chat('attempt', 'question'), /크레딧이 부족합니다\./)
  await assert.rejects(chatStream('attempt', 'question', () => {}), /크레딧이 부족합니다\./)
})

test('stream errors preserve JSON and plain-text messages, including split CRLF', async () => {
  session('token-a')
  for (const payload of ['{"message":"크레딧이 부족합니다."}', '크레딧이 부족합니다.']) {
    globalThis.fetch = async () => new Response(new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder()
        controller.enqueue(encoder.encode(`event: error\r`))
        controller.enqueue(encoder.encode(`\ndata: ${payload}\r\n\r\n`))
        controller.close()
      },
    }))
    await assert.rejects(chatStream('attempt', 'question', () => {}), /크레딧이 부족합니다\./)
  }
})

test('successful streaming returns saved turns and forwards deltas', async () => {
  session('token-a')
  globalThis.fetch = async () => new Response(
    'event: delta\ndata: {"t":"안녕"}\n\nevent: done\ndata: [{"role":"ai","text":"안녕"}]\n\n',
  )
  const deltas = []
  const turns = await chatStream('attempt', 'question', (text) => deltas.push(text))
  assert.deepEqual(deltas, ['안녕'])
  assert.equal(turns[0].text, '안녕')
})
