import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import { authenticatedFetch, AuthRequestError, logoutAuthSession, readAuthSession, saveAuthSession, subscribeAuthSession } from '../../src/auth/authApi.ts'
import { call, chatStream } from '../../src/api.ts'

const originalFetch = globalThis.fetch
const originalStorage = globalThis.localStorage
const user = { id: 1, name: '사용자', email: 'user@example.com', role: 'USER' }
const initial = { token: 'access-old', refreshToken: 'refresh-old', expiresIn: 1800, user, sessionId: 'session-1' }
const renewed = { token: 'access-new', refreshToken: 'refresh-new', expiresIn: 1800, user }

beforeEach(() => {
  const data = new Map()
  globalThis.localStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  }
  saveAuthSession(initial)
})

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalStorage === undefined) delete globalThis.localStorage
  else globalThis.localStorage = originalStorage
})

function deferred() {
  let resolve
  const promise = new Promise((ok) => { resolve = ok })
  return { promise, resolve }
}

test('401 후 토큰 쌍을 교체하고 원래 요청을 한 번 재시도한다', async () => {
  const seen = []
  globalThis.fetch = async (url, init) => {
    seen.push({ url, init })
    if (url === '/api/auth/refresh') {
      assert.deepEqual(JSON.parse(init.body), { refreshToken: 'refresh-old' })
      return Response.json(renewed)
    }
    return init.headers.Authorization === 'Bearer access-old'
      ? new Response(null, { status: 401 })
      : Response.json({ ok: true })
  }
  const response = await authenticatedFetch('/api/resource', {
    method: 'POST',
    headers: { Authorization: 'Bearer access-old' },
    body: '{"x":1}',
  })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true })
  assert.deepEqual(readAuthSession(), { ...renewed, sessionId: 'session-1' })
  assert.equal(seen.length, 3)
  assert.equal(seen[2].init.body, '{"x":1}')
  assert.equal(seen[2].init.headers.Authorization, 'Bearer access-new')
  assert.equal(new Headers(seen[2].init.headers).get('authorization'), 'Bearer access-new')
})

test('동시 401 및 늦게 도착한 401은 같은 재발급 결과를 사용한다', async () => {
  const gate = deferred()
  const late = deferred()
  let refreshes = 0
  globalThis.fetch = async (url, init) => {
    if (url === '/api/auth/refresh') {
      refreshes++
      await gate.promise
      return Response.json(renewed)
    }
    if (init.headers.Authorization === 'Bearer access-new') return Response.json({ ok: true })
    if (url === '/api/late') await late.promise
    return new Response(null, { status: 401 })
  }
  const first = authenticatedFetch('/api/a')
  const second = authenticatedFetch('/api/b')
  const third = authenticatedFetch('/api/late')
  gate.resolve()
  assert.equal((await first).status, 200)
  assert.equal((await second).status, 200)
  late.resolve()
  assert.equal((await third).status, 200)
  assert.equal(refreshes, 1)
})

test('재발급 인증 실패는 세션을 지우고 반복하지 않는다', async () => {
  let requests = 0
  let expired = false
  const unsubscribe = subscribeAuthSession((session, isExpired) => { if (!session) expired = isExpired })
  globalThis.fetch = async () => {
    requests++
    return Response.json({ message: '인증이 만료되었습니다.' }, { status: 401 })
  }
  try {
    await assert.rejects(authenticatedFetch('/api/a'), (error) => error instanceof AuthRequestError && error.status === 401)
    assert.equal(requests, 2)
    assert.equal(readAuthSession(), null)
    assert.equal(expired, true)
  } finally {
    unsubscribe()
  }
})

test('이전 세션의 재발급 응답은 새 로그인 세션을 덮어쓰지 않는다', async () => {
  const started = deferred()
  const finish = deferred()
  globalThis.fetch = async (url) => {
    if (url !== '/api/auth/refresh') return new Response(null, { status: 401 })
    started.resolve()
    await finish.promise
    return Response.json(renewed)
  }
  const pending = authenticatedFetch('/api/a')
  await started.promise
  const newer = { ...initial, token: 'another-access', refreshToken: 'another-refresh', sessionId: 'session-2' }
  saveAuthSession(newer)
  finish.resolve()
  await assert.rejects(pending, (error) => error instanceof AuthRequestError && error.status === 401)
  assert.deepEqual(readAuthSession(), newer)
})

test('리프레시 토큰이 없는 이전 세션이 만료되면 로그인 상태를 지운다', async () => {
  saveAuthSession({ token: 'old-token', user })
  let requests = 0
  globalThis.fetch = async () => {
    requests++
    return new Response(null, { status: 401 })
  }
  await assert.rejects(authenticatedFetch('/api/a'), (error) => error instanceof AuthRequestError && error.status === 401)
  assert.equal(requests, 1)
  assert.equal(readAuthSession(), null)
})

test('재발급 서버 및 네트워크 오류는 세션을 보존한다', async () => {
  for (const failure of ['server', 'network']) {
    globalThis.fetch = async (url) => {
      if (url !== '/api/auth/refresh') return new Response(null, { status: 401 })
      if (failure === 'network') throw new TypeError('offline')
      return Response.json({ message: '서버 오류' }, { status: 503 })
    }
    await assert.rejects(authenticatedFetch('/api/a'), (error) =>
      error instanceof AuthRequestError && error.status === (failure === 'server' ? 503 : 0))
    assert.deepEqual(readAuthSession(), initial)
  }
})

test('로그아웃은 재발급이 완료될 때까지 기다린 후 최신 리프레시 토큰을 폐기한다', async () => {
  const started = deferred()
  const finish = deferred()
  let logoutBody
  globalThis.fetch = async (url, init) => {
    if (url === '/api/auth/refresh') {
      started.resolve()
      await finish.promise
      return Response.json(renewed)
    }
    if (url === '/api/auth/logout') {
      logoutBody = JSON.parse(init.body)
      return new Response(null, { status: 204 })
    }
    return new Response(null, { status: 401 })
  }
  const pendingRequest = authenticatedFetch('/api/a')
  await started.promise
  const pendingLogout = logoutAuthSession()
  finish.resolve()
  await pendingLogout
  await pendingRequest.catch(() => {})
  assert.deepEqual(logoutBody, { refreshToken: 'refresh-new' })
  assert.equal(readAuthSession(), null)
})

test('로그아웃 서버 오류가 발생해도 클라이언트 세션을 지운다', async () => {
  globalThis.fetch = async (url, init) => {
    assert.equal(url, '/api/auth/logout')
    assert.deepEqual(JSON.parse(init.body), { refreshToken: 'refresh-old' })
    return Response.json({ message: '서버 오류' }, { status: 503 })
  }
  await assert.rejects(logoutAuthSession(), (error) => error instanceof AuthRequestError && error.status === 503)
  assert.equal(readAuthSession(), null)
})

test('재시도도 401이면 다시 재발급하지 않는다', async () => {
  let refreshes = 0
  globalThis.fetch = async (url) => {
    if (url === '/api/auth/refresh') {
      refreshes++
      return Response.json(renewed)
    }
    return new Response(null, { status: 401 })
  }
  assert.equal((await authenticatedFetch('/api/a')).status, 401)
  assert.equal(refreshes, 1)
})

test('JSON API와 스트리밍 요청이 같은 재발급을 공유한다', async () => {
  let refreshes = 0
  globalThis.fetch = async (url, init) => {
    if (url === '/api/auth/refresh') {
      refreshes++
      return Response.json(renewed)
    }
    if (init.headers.Authorization === 'Bearer access-old') return new Response(null, { status: 401 })
    if (url.endsWith('/stream')) return new Response('event: done\ndata: []\n\n')
    return Response.json({ value: 1 })
  }
  const [data, turns] = await Promise.all([
    call('GET', '/api/resource'),
    chatStream('attempt', 'question', () => {}),
  ])
  assert.deepEqual(data, { value: 1 })
  assert.deepEqual(turns, [])
  assert.equal(refreshes, 1)
})

test('Web Locks를 사용하는 다른 탭도 회전된 토큰을 공유한다', async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  let tail = Promise.resolve()
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { locks: { request: async (_name, callback) => {
      const previous = tail
      let release
      tail = new Promise((resolve) => { release = resolve })
      await previous
      try { return await callback() } finally { release() }
    } } },
  })
  try {
    const otherTab = await import('../../src/auth/authApi.ts?other-tab')
    const gate = deferred()
    let refreshes = 0
    globalThis.fetch = async (url, init) => {
      if (url === '/api/auth/refresh') {
        refreshes++
        await gate.promise
        return Response.json(renewed)
      }
      return new Response(null, { status: init.headers.Authorization === 'Bearer access-old' ? 401 : 200 })
    }
    const first = authenticatedFetch('/api/a')
    const second = otherTab.authenticatedFetch('/api/b')
    gate.resolve()
    assert.equal((await first).status, 200)
    assert.equal((await second).status, 200)
    assert.equal(refreshes, 1)
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator)
    else delete globalThis.navigator
  }
})
