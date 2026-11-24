import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { call } from '../../src/api.ts'
import { accountMutation } from '../../src/auth/account.ts'
import { authApi, AuthRequestError, AuthSessionExpiredError, logoutSession, readAuthSession, saveAuthSession } from '../../src/auth/authApi.ts'

const originalFetch = globalThis.fetch
const originalStorage = globalThis.localStorage
const user = { id: 1, name: 'User', email: 'user@example.com', role: 'USER', companyId: null, companyName: null }
const initial = { token: 'old-access', refreshToken: 'old-refresh', sessionKey: 'session-1', user }
const renewed = { token: 'new-access', refreshToken: 'new-refresh', expiresIn: 900, user }

beforeEach(() => {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key),
  }
  saveAuthSession(initial)
})

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalStorage === undefined) delete globalThis.localStorage
  else globalThis.localStorage = originalStorage
})

const authorization = (init) => new Headers(init.headers).get('Authorization')

describe('access token refresh', () => {
  it('rotates both tokens and retries a protected request once', async () => {
    const calls = []
    globalThis.fetch = async (url, init) => {
      calls.push({ url, init })
      if (url === '/api/auth/refresh') {
        assert.deepEqual(JSON.parse(init.body), { refreshToken: initial.refreshToken })
        return Response.json(renewed)
      }
      return authorization(init) === `Bearer ${initial.token}`
        ? Response.json({ message: 'expired' }, { status: 401 })
        : Response.json({ ok: true })
    }

    assert.deepEqual(await call('GET', '/api/attempts'), { ok: true })
    assert.equal(calls.length, 3)
    assert.equal(authorization(calls[2].init), `Bearer ${renewed.token}`)
    assert.equal(readAuthSession().token, renewed.token)
    assert.equal(readAuthSession().refreshToken, renewed.refreshToken)
  })

  it('shares one rotation across simultaneous and late 401 responses', async () => {
    let refreshes = 0
    let release
    const gate = new Promise((resolve) => { release = resolve })
    let late
    const lateGate = new Promise((resolve) => { late = resolve })
    globalThis.fetch = async (url, init) => {
      if (url === '/api/auth/refresh') {
        refreshes++
        await gate
        return Response.json(renewed)
      }
      if (authorization(init) === `Bearer ${initial.token}`) {
        if (url === '/late') await lateGate
        return Response.json({}, { status: 401 })
      }
      return Response.json({ ok: true })
    }
    const first = call('GET', '/first')
    const second = call('GET', '/second')
    const third = call('GET', '/late')
    await new Promise((resolve) => setTimeout(resolve, 0))
    release()
    await Promise.all([first, second])
    late()
    assert.deepEqual(await third, { ok: true })
    assert.equal(refreshes, 1)
  })

  it('clears invalid refresh credentials but preserves them on server failure', async () => {
    globalThis.fetch = async (url) => Response.json({}, { status: url === '/api/auth/refresh' ? 503 : 401 })
    await assert.rejects(call('GET', '/api/attempts'), (error) => error instanceof AuthRequestError && error.status === 503)
    assert.equal(readAuthSession().refreshToken, initial.refreshToken)

    globalThis.fetch = async () => Response.json({}, { status: 401 })
    await assert.rejects(call('GET', '/api/attempts'), AuthSessionExpiredError)
    assert.equal(readAuthSession(), null)
  })

  it('does not refresh login failures or valid-session password errors', async () => {
    let refreshes = 0
    globalThis.fetch = async (url) => {
      if (url === '/api/auth/refresh') refreshes++
      if (url === '/api/auth/me') return Response.json(user)
      return Response.json({ message: 'incorrect password' }, { status: 401 })
    }
    await assert.rejects(authApi.login('user@example.com', 'wrong'), AuthRequestError)
    await assert.rejects(accountMutation(initial.token, (token) => authApi.changePassword(token, 'wrong', 'newpassword'), () => saveAuthSession(null)), AuthRequestError)
    assert.equal(refreshes, 0)
    assert.equal(readAuthSession().token, initial.token)
  })

  it('retries account changes only when verification refreshed the token', async () => {
    let mutations = 0
    globalThis.fetch = async (url, init) => {
      if (url === '/api/auth/refresh') return Response.json(renewed)
      if (url === '/api/auth/me') return authorization(init) === `Bearer ${initial.token}`
        ? Response.json({}, { status: 401 }) : Response.json(user)
      mutations++
      return authorization(init) === `Bearer ${initial.token}`
        ? Response.json({}, { status: 401 }) : new Response(null, { status: 204 })
    }
    await accountMutation(initial.token, (token) => authApi.changePassword(token, 'old', 'newpassword'), () => saveAuthSession(null))
    assert.equal(mutations, 2)
    assert.equal(readAuthSession(), null)
  })

  it('does not retry indefinitely when the new access token also gets 401', async () => {
    let refreshes = 0
    globalThis.fetch = async (url) => {
      if (url === '/api/auth/refresh') {
        refreshes++
        return Response.json(renewed)
      }
      return Response.json({}, { status: 401 })
    }
    await assert.rejects(call('GET', '/api/attempts'), (error) => error.status === 401)
    assert.equal(refreshes, 1)
  })

  it('clears the session if profile verification rejects the refreshed access token', async () => {
    let refreshes = 0
    globalThis.fetch = async (url) => {
      if (url === '/api/auth/refresh') {
        refreshes++
        return Response.json(renewed)
      }
      return Response.json({}, { status: 401 })
    }
    await assert.rejects(authApi.me(initial.token), AuthRequestError)
    assert.equal(refreshes, 1)
    assert.equal(readAuthSession(), null)
  })

  it('revokes the latest refresh token on logout', async () => {
    let logoutBody
    globalThis.fetch = async (url, init) => {
      assert.equal(url, '/api/auth/logout')
      logoutBody = JSON.parse(init.body)
      return new Response(null, { status: 204 })
    }
    await logoutSession()
    assert.deepEqual(logoutBody, { refreshToken: initial.refreshToken })
    assert.equal(readAuthSession(), null)
  })

  it('migrates an existing session without a session key before refreshing', async () => {
    saveAuthSession({ token: initial.token, refreshToken: initial.refreshToken, user })
    globalThis.fetch = async (url, init) => {
      if (url === '/api/auth/refresh') return Response.json(renewed)
      return authorization(init) === `Bearer ${initial.token}`
        ? Response.json({}, { status: 401 }) : Response.json({ ok: true })
    }
    await Promise.all([call('GET', '/one'), call('GET', '/two')])
    assert.ok(readAuthSession().sessionKey)
    assert.equal(readAuthSession().refreshToken, renewed.refreshToken)
  })

  it('waits for an in-flight rotation before revoking on logout', async () => {
    let release
    let started
    const gate = new Promise((resolve) => { release = resolve })
    const refreshStarted = new Promise((resolve) => { started = resolve })
    let revoked
    globalThis.fetch = async (url, init) => {
      if (url === '/api/auth/refresh') {
        started()
        await gate
        return Response.json(renewed)
      }
      if (url === '/api/auth/logout') {
        revoked = JSON.parse(init.body).refreshToken
        return new Response(null, { status: 204 })
      }
      return authorization(init) === `Bearer ${initial.token}`
        ? Response.json({}, { status: 401 }) : Response.json({ ok: true })
    }
    const request = call('GET', '/one')
    await refreshStarted
    const logout = logoutSession()
    release()
    await Promise.all([request, logout])
    assert.equal(revoked, renewed.refreshToken)
    assert.equal(readAuthSession(), null)
  })

  it('does not replace a newer login with an old refresh result', async () => {
    let release
    let started
    const gate = new Promise((resolve) => { release = resolve })
    const refreshStarted = new Promise((resolve) => { started = resolve })
    globalThis.fetch = async (url) => {
      if (url === '/api/auth/refresh') {
        started()
        await gate
        return Response.json(renewed)
      }
      return Response.json({}, { status: 401 })
    }
    const request = call('GET', '/one')
    await refreshStarted
    const another = { ...initial, token: 'another-access', refreshToken: 'another-refresh', sessionKey: 'session-2' }
    saveAuthSession(another)
    release()
    await assert.rejects(request, AuthSessionExpiredError)
    assert.deepEqual(readAuthSession(), another)
  })
})
