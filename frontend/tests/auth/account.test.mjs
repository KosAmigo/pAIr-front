import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import { accountErrorMessage, accountMutation, validateName, validateNewPassword } from '../../src/auth/account.ts'
import { authApi, AuthRequestError, AuthSessionExpiredError, readAuthSession, saveAuthSession } from '../../src/auth/authApi.ts'

const originalFetch = globalThis.fetch
const originalStorage = globalThis.localStorage

afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalStorage === undefined) delete globalThis.localStorage
  else globalThis.localStorage = originalStorage
})

describe('마이페이지 비밀번호 검증', () => {
  it('길이, UTF-8 바이트 및 확인값의 경계를 검사한다', () => {
    assert.equal(validateNewPassword('1234567', '1234567'), '새 비밀번호는 8~72자여야 합니다.')
    assert.equal(validateNewPassword('12345678', '12345678'), null)
    assert.equal(validateNewPassword('a'.repeat(72), 'a'.repeat(72)), null)
    assert.ok(validateNewPassword('a'.repeat(73), 'a'.repeat(73)))
    assert.equal(validateNewPassword('가'.repeat(24), '가'.repeat(24)), null)
    assert.ok(validateNewPassword('가'.repeat(25), '가'.repeat(25)))
    assert.ok(validateNewPassword('12345678', '12345679'))
  })
})

describe('마이페이지 이름 검증', () => {
  it('앞뒤 공백을 빼고 1~50자만 허용한다', () => {
    assert.ok(validateName(''))
    assert.ok(validateName('   '))
    assert.equal(validateName(' 김 '), null)
    assert.equal(validateName('가'.repeat(50)), null)
    assert.ok(validateName('가'.repeat(51)))
    assert.equal(validateName('  ' + '가'.repeat(50) + '  '), null)
  })
})

describe('회원 정보 API', () => {
  it('이름 변경은 PATCH /api/auth/me 로 보내고 바뀐 프로필을 받는다', async () => {
    const profile = { id: 1, name: '새 이름', email: 'user@example.com', role: 'USER', companyId: null, companyName: null }
    globalThis.fetch = async (url, init) => {
      assert.equal(url, '/api/auth/me')
      assert.equal(init.method, 'PATCH')
      assert.equal(init.headers.Authorization, 'Bearer access-token')
      assert.deepEqual(JSON.parse(init.body), { name: '새 이름' })
      return Response.json(profile)
    }
    assert.deepEqual(await authApi.updateName('access-token', '새 이름'), profile)
  })

  it('bearer 토큰으로 프로필을 조회한다', async () => {
    const profile = { id: 1, name: '회원', email: 'user@example.com', role: 'USER', companyId: null, companyName: null }
    globalThis.fetch = async (url, init) => {
      assert.equal(url, '/api/auth/me')
      assert.equal(init.method, 'GET')
      assert.equal(init.headers.Authorization, 'Bearer access-token')
      return Response.json(profile)
    }
    assert.deepEqual(await authApi.me('access-token'), profile)
  })

  it('기업 소속 프로필의 식별자와 기업명을 그대로 반환한다', async () => {
    const profile = { id: 42, name: '담당자', email: 'manager@example.com', role: 'MANAGER', companyId: 7, companyName: '테스트 기업' }
    globalThis.fetch = async () => Response.json(profile)
    assert.deepEqual(await authApi.me('access-token'), profile)
  })

  for (const [name, path, method, body, call] of [
    ['비밀번호 변경', '/api/auth/password', 'PATCH', { currentPassword: 'old', newPassword: 'newpassword' },
      () => authApi.changePassword('access-token', 'old', 'newpassword')],
    ['회원 탈퇴', '/api/auth/withdrawal', 'POST', { currentPassword: 'old' },
      () => authApi.withdraw('access-token', 'old')],
  ]) {
    it(`${name} 요청과 본문 없는 204 응답을 처리하고 세션을 지운다`, async () => {
      const store = new Map()
      globalThis.localStorage = {
        getItem: (key) => store.get(key) ?? null,
        setItem: (key, value) => store.set(key, value),
        removeItem: (key) => store.delete(key),
      }
      saveAuthSession({ token: 'access-token', user: { id: 1, role: 'USER' } })
      globalThis.fetch = async (url, init) => {
        assert.equal(url, path)
        assert.equal(init.method, method)
        assert.equal(init.headers.Authorization, 'Bearer access-token')
        assert.equal(init.headers['Content-Type'], 'application/json')
        assert.deepEqual(JSON.parse(init.body), body)
        return new Response(null, { status: 204 })
      }
      await accountMutation('access-token', call, () => saveAuthSession(null))
      assert.equal(readAuthSession(), null)
    })
  }

  for (const status of [400, 403, 409]) {
    it(`${status} 서버 오류 메시지를 보존하고 세션을 유지한다`, async () => {
      let cleared = false
      globalThis.fetch = async () => Response.json({ message: `서버 오류 ${status}` }, { status })
      await assert.rejects(
        accountMutation('access-token', () => authApi.withdraw('access-token', 'old'), () => { cleared = true }),
        (error) => error instanceof AuthRequestError && error.status === status && error.message === `서버 오류 ${status}`,
      )
      assert.equal(cleared, false)
    })
  }

  it('서버 메시지가 없는 주요 오류에 상황별 안내를 제공한다', () => {
    assert.match(accountErrorMessage(new AuthRequestError('요청 실패 (400)', 400)), /입력/)
    assert.match(accountErrorMessage(new AuthRequestError('요청 실패 (401)', 401)), /비밀번호/)
    assert.match(accountErrorMessage(new AuthRequestError('요청 실패 (403)', 403)), /관리자/)
    assert.match(accountErrorMessage(new AuthRequestError('요청 실패 (409)', 409)), /회차/)
  })

  it('현재 비밀번호 오류인 401은 서버 메시지를 보여주고 세션을 유지한다', async () => {
    let cleared = false
    globalThis.fetch = async (url) => url === '/api/auth/me'
      ? Response.json({ id: 1, role: 'USER' })
      : Response.json({ message: '현재 비밀번호가 올바르지 않습니다.' }, { status: 401 })
    await assert.rejects(
      accountMutation('access-token', () => authApi.changePassword('access-token', 'wrong', 'newpassword'), () => { cleared = true }),
      (error) => error instanceof AuthRequestError && !(error instanceof AuthSessionExpiredError) && error.message === '현재 비밀번호가 올바르지 않습니다.',
    )
    assert.equal(cleared, false)
  })

  it('프로필 재확인도 401이면 세션을 지운다', async () => {
    let cleared = false
    globalThis.fetch = async () => Response.json({ message: '인증 오류' }, { status: 401 })
    await assert.rejects(
      accountMutation('access-token', () => authApi.withdraw('access-token', 'old'), () => { cleared = true }),
      AuthSessionExpiredError,
    )
    assert.equal(cleared, true)
  })

  it('세션 재확인에 실패해도 만료로 추정하지 않고 오류를 안내한다', async () => {
    let cleared = false
    globalThis.fetch = async (url) => url === '/api/auth/me'
      ? Response.json({ message: '서버 점검 중' }, { status: 503 })
      : Response.json({ message: '인증 또는 비밀번호 오류' }, { status: 401 })
    await assert.rejects(
      accountMutation('access-token', () => authApi.withdraw('access-token', 'old'), () => { cleared = true }),
      (error) => error instanceof AuthRequestError && error.message.includes('인증 또는 비밀번호 오류') && error.message.includes('서버 점검 중'),
    )
    assert.equal(cleared, false)
  })
})
