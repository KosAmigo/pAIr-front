import { test } from 'node:test'
import { expect } from './expect.ts'
import { countUnconfirmed, isServerCheckTarget, serverCheckBadge, serverCheckPriority } from '../../src/proctor/core/serverCheck.ts'

const pc = { source: 'PC_CAM', type: 'NO_FACE' }

test('필드가 없는 응답(지금 백엔드)에서는 배지가 없다', () => {
  expect(serverCheckBadge(pc)).toBeNull()
  expect(serverCheckBadge({ ...pc, serverCheck: null })).toBeNull()
  expect(serverCheckPriority(pc)).toBe(-1)
})

test('세 상태의 문구와 색', () => {
  expect(serverCheckBadge({ ...pc, serverCheck: 'PENDING' })?.label).toBe('서버 확인 중')
  expect(serverCheckBadge({ ...pc, serverCheck: 'CONFIRMED' })?.label).toBe('서버 확인됨')
  expect(serverCheckBadge({ ...pc, serverCheck: 'CONFIRMED' })?.tone).toBe('signal')
  const un = serverCheckBadge({ source: 'PHONE_CAM', type: 'PHONE', serverCheck: 'UNCONFIRMED' })
  expect(un?.label).toBe('서버 미확인')
  expect(un?.tone).toBe('caution')
})

test('미확인이 가장 먼저 봐야 할 건이다 (미확인 > 확인 중 > 확인됨 > 배지 없음)', () => {
  const p = (serverCheck?: string) => serverCheckPriority({ ...pc, serverCheck })
  expect(p('UNCONFIRMED') > p('PENDING')).toBe(true)
  expect(p('PENDING') > p('CONFIRMED')).toBe(true)
  expect(p('CONFIRMED') > p(undefined)).toBe(true)
})

test('브라우저·화면 공유 이벤트와 연결 끊김에는 값이 와도 배지를 붙이지 않는다', () => {
  expect(serverCheckBadge({ source: 'BROWSER', type: 'TAB_HIDDEN', serverCheck: 'PENDING' })).toBeNull()
  expect(serverCheckBadge({ source: 'SCREEN', type: 'NO_FACE', serverCheck: 'PENDING' })).toBeNull()
  expect(serverCheckBadge({ source: 'PHONE_CAM', type: 'PHONE_DISCONNECTED', serverCheck: 'UNCONFIRMED' })).toBeNull()
  expect(isServerCheckTarget(pc)).toBe(true)
})

test('모르는 상태 값은 깨지지 않고 배지 없음', () => {
  expect(serverCheckBadge({ ...pc, serverCheck: 'SOMETHING_NEW' })).toBeNull()
})

test('서버 미확인 건수', () => {
  const list = [
    { ...pc, serverCheck: 'UNCONFIRMED' },
    { ...pc, serverCheck: 'CONFIRMED' },
    { ...pc },
    { source: 'BROWSER', type: 'PASTE', serverCheck: 'UNCONFIRMED' },
  ]
  expect(countUnconfirmed(list)).toBe(1)
})
