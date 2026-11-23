import { describe, expect, it } from './expect.ts'
import { offsetLabel, retentionNotice, splitBySource, type RetentionLike } from '../../src/pages/console/evidenceView.ts'

const DAY = 24 * 3600 * 1000
const base: RetentionLike = { expiresAt: '2026-12-10T00:00:00Z', extensionsUsed: 0, maxExtensions: 2, extensionDays: 7, canExtend: false }
const at = (iso: string) => Date.parse(iso)

describe('retentionNotice', () => {
  it('삭제까지 여유가 있으면 남은 날짜를 보여 주고 연장은 아직 못 한다', () => {
    const n = retentionNotice(base, at('2026-12-01T00:00:00Z'))
    expect(n.daysLeft).toBe(9)
    expect(n.tone).toBe('neutral')
    expect(n.text).toContain('9일 뒤 삭제')
    expect(n.extendHint).toContain('2일 전부터')
  })
  it('삭제 2일 이내면 경고 톤, 연장 가능하면 연장 안내', () => {
    const n = retentionNotice({ ...base, canExtend: true }, at('2026-12-08T12:00:00Z'))
    expect(n.tone).toBe('caution')
    expect(n.extendHint).toBeNull()
  })
  it('연장을 다 썼으면 더 못 한다고 알린다', () => {
    const n = retentionNotice({ ...base, extensionsUsed: 2, canExtend: false }, at('2026-12-09T00:00:00Z'))
    expect(n.extendHint).toContain('최대 2번')
  })
  it('삭제 시각이 지났으면 삭제됨으로 표시', () => {
    const n = retentionNotice(base, at('2026-12-10T00:00:00Z') + DAY)
    expect(n.expired).toBe(true)
    expect(n.text).toContain('삭제')
  })
  it('연장 횟수를 함께 보여 준다', () => {
    expect(retentionNotice({ ...base, extensionsUsed: 1 }, at('2026-12-01T00:00:00Z')).usage).toBe('연장 1/2회')
  })
})

describe('offsetLabel', () => {
  it('이벤트 앞은 -, 뒤는 + 로 초 단위', () => {
    expect(offsetLabel(-8000)).toBe('-8.0초')
    expect(offsetLabel(0)).toBe('0.0초')
    expect(offsetLabel(2500)).toBe('+2.5초')
  })
})

describe('splitBySource', () => {
  it('웹캠·휴대폰 줄로 나누고 시간순으로 정렬한다', () => {
    const r = splitBySource([
      { id: 3, source: 'PHONE_CAM', offsetMs: 1000, sizeBytes: 1, deleted: false },
      { id: 1, source: 'PC_CAM', offsetMs: 2000, sizeBytes: 1, deleted: false },
      { id: 2, source: 'PC_CAM', offsetMs: -3000, sizeBytes: 1, deleted: false },
    ])
    expect(r.pc.map((f) => f.id)).toEqual([2, 1])
    expect(r.phone.map((f) => f.id)).toEqual([3])
  })
})

import { nearestToEvent } from '../../src/pages/console/evidenceView.ts'

describe('nearestToEvent', () => {
  it('이벤트 시각(0)에 가장 가까운 삭제되지 않은 사진을 고른다', () => {
    const f = (id: number, offsetMs: number, deleted = false) => ({ id, source: 'PC_CAM' as const, offsetMs, sizeBytes: 1, deleted })
    expect(nearestToEvent([f(1, -8000), f(2, -400), f(3, 1200)])?.id).toBe(2)
    expect(nearestToEvent([f(1, -100, true), f(2, 3000)])?.id).toBe(2)
    expect(nearestToEvent([])).toBeNull()
  })
})
