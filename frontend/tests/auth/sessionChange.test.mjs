import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { userChanged } from '../../src/auth/sessionChange.ts'

describe('userChanged', () => {
  it('첫 로그인(없음 → 사용자)은 비우지 않는다', () => assert.equal(userChanged(null, 1), false))
  it('같은 사용자 정보 갱신은 비우지 않는다', () => assert.equal(userChanged(1, 1), false))
  it('로그아웃·탈퇴·만료(사용자 → 없음)는 비운다', () => assert.equal(userChanged(1, null), true))
  it('다른 계정으로 바뀌면 비운다', () => assert.equal(userChanged(1, 2), true))
  it('아무도 없던 상태가 이어지면 비우지 않는다', () => assert.equal(userChanged(null, null), false))
})
