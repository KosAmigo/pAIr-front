import { describe, expect, it } from './expect.ts'
import { NOTICE_MAX, NOTICE_PRESETS, normalizeNotice } from '../../src/pages/console/noticePresets.ts'

describe('normalizeNotice', () => {
  it('앞뒤 공백을 다듬는다', () => {
    expect(normalizeNotice('  정면을 봐 주세요  ')).toBe('정면을 봐 주세요')
  })
  it('빈 문구는 보낼 수 없다', () => {
    expect(normalizeNotice('   ')).toBe(null)
  })
  it('한도를 넘으면 보낼 수 없다', () => {
    expect(normalizeNotice('가'.repeat(NOTICE_MAX + 1))).toBe(null)
  })
  it('준비된 문구는 모두 보낼 수 있다', () => {
    for (const p of NOTICE_PRESETS) expect(normalizeNotice(p)).toBe(p)
  })
})
