import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { AuthRequestError, authApi } from '../../src/auth/authApi.ts'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('이메일 인증 API', () => {
  it('이메일을 요청 본문으로 보내고 202 응답 메시지를 반환한다', async () => {
    let request
    globalThis.fetch = async (url, init) => {
      request = { url, init }
      return Response.json({ message: '인증 코드를 이메일로 보냈습니다.' }, { status: 202 })
    }

    const result = await authApi.requestEmailVerification('user@example.com')

    assert.equal(request.url, '/api/auth/email-verifications')
    assert.equal(request.init.method, 'POST')
    assert.equal(request.init.headers['Content-Type'], 'application/json')
    assert.deepEqual(JSON.parse(request.init.body), { email: 'user@example.com' })
    assert.deepEqual(result, { message: '인증 코드를 이메일로 보냈습니다.' })
  })

  it('가입 요청에 인증 코드를 포함한다', async () => {
    let request
    const session = { token: 'bearer-token', refreshToken: 'refresh-token', expiresIn: 1800, user: { id: 1, email: 'user@example.com', name: '사용자', role: 'USER' } }
    globalThis.fetch = async (url, init) => {
      request = { url, init }
      return Response.json(session, { status: 201 })
    }

    const result = await authApi.signup('사용자', 'user@example.com', 'password123', '012345')

    assert.equal(request.url, '/api/auth/signup')
    assert.deepEqual(JSON.parse(request.init.body), {
      name: '사용자',
      email: 'user@example.com',
      password: 'password123',
      code: '012345',
    })
    assert.deepEqual(result, session)
  })

  it('오류 메시지와 재시도 제한 응답 헤더를 전달한다', async () => {
    globalThis.fetch = async () => Response.json(
      { message: '잠시 후 인증 코드를 다시 요청해 주세요.' },
      { status: 429, headers: { 'Retry-After': '12' } },
    )

    await assert.rejects(
      authApi.requestEmailVerification('user@example.com'),
      (error) => {
        assert.ok(error instanceof AuthRequestError)
        assert.equal(error.status, 429)
        assert.equal(error.message, '잠시 후 인증 코드를 다시 요청해 주세요.')
        assert.equal(error.retryAfterMs, 12_000)
        return true
      },
    )
  })

  it('가입 오류의 백엔드 메시지를 그대로 전달한다', async () => {
    globalThis.fetch = async () => Response.json(
      { message: '인증 코드가 올바르지 않습니다.' },
      { status: 400 },
    )

    await assert.rejects(
      authApi.signup('사용자', 'user@example.com', 'password123', '000000'),
      (error) => {
        assert.ok(error instanceof AuthRequestError)
        assert.equal(error.status, 400)
        assert.equal(error.message, '인증 코드가 올바르지 않습니다.')
        return true
      },
    )
  })
})
