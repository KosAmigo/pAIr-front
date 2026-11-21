import { describe, expect, it } from './expect.ts'
import { ENTRY_DEADLINE_MS, clockOf, entryClosed, entryClosedMessage, entryDeadlineAt } from '../../src/proctor/core/entryDeadline.ts'

const START = Date.parse('2026-12-01T06:00:00.000Z')

describe('대기실 입장 마감 (시작 10분 전)', () => {
  it('마감은 시작 10분 전이다', () => {
    expect(ENTRY_DEADLINE_MS).toBe(600_000)
    expect(entryDeadlineAt(START)).toBe(START - 600_000)
  })

  it('마감 전까지는 입장할 수 있다 (정확히 10분 전까지 포함)', () => {
    expect(entryClosed(START, START - 3_600_000)).toBe(false)
    expect(entryClosed(START, START - 600_000)).toBe(false)
  })

  it('10분 전을 1ms 넘기면 막고, 시작 뒤에도 막는다', () => {
    expect(entryClosed(START, START - 600_000 + 1)).toBe(true)
    expect(entryClosed(START, START - 1)).toBe(true)
    expect(entryClosed(START, START + 3_600_000)).toBe(true)
  })

  it('안내 문구에 마감 시각과 이유(책상 사진 확인)가 들어간다', () => {
    const msg = entryClosedMessage(START)
    expect(msg.includes(clockOf(START - 600_000))).toBe(true)
    expect(msg.includes('책상 위 사진')).toBe(true)
    expect(msg.includes('10분 전')).toBe(true)
  })

  it('시각은 두 자리 HH:MM 이다', () => {
    expect(/^\d{2}:\d{2}$/.test(clockOf(START))).toBe(true)
  })
})
