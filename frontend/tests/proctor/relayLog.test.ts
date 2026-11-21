import { test } from 'node:test'
import { expect } from './expect.ts'
import { formatLine, mask } from '../../server/relayLog.ts'

test('mask: 비밀 값은 앞 6자리만 남긴다', () => {
  expect(mask('abcdefghijklmnop')).toBe('abcdef…')
})

test('mask: 값이 없으면 - 를 돌려준다', () => {
  expect(mask(undefined)).toBe('-')
})

test('formatLine: ISO 시각 뒤에 문자열·객체 인자를 이어 붙인다', () => {
  const line = formatLine(new Date('2026-11-21T01:02:03.456Z'), ['close', { code: 1006 }])
  expect(line).toBe('2026-11-21T01:02:03.456Z close {"code":1006}')
})
