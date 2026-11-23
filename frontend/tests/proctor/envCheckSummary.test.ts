import { describe, expect, it } from './expect.ts'
import { summarizeEnvCheck, unreadNotices } from '../../src/proctor/check/envCheckSummary.ts'

const item = (id: string, status: string, detail = '') => ({ id, label: `항목 ${id}`, status, detail })

describe('환경 점검 요약 (콘솔 표시용)', () => {
  it('PC·휴대폰 점검 항목을 합쳐 실패, 주의, 통과 순으로 센다', () => {
    const s = summarizeEnvCheck({
      pc: { items: [item('light', 'fail', '너무 어둡습니다'), item('face', 'pass'), item('ears', 'warn', '이어폰 의심')] },
      phone: { items: [item('phone', 'pass')] },
    })
    expect(s.counts).toEqual({ fail: 1, warn: 1, pass: 2, pending: 0 })
    expect(s.items.map((i) => i.id)).toEqual(['light', 'ears', 'face', 'phone'])
    expect(s.items[0].detail).toBe('너무 어둡습니다')
  })

  it('휴대폰 점검이 없으면(null) PC 항목만 본다', () => {
    const s = summarizeEnvCheck({ pc: { items: [item('light', 'pass')] }, phone: null })
    expect(s.items.length).toBe(1)
  })

  it('아직 끝나지 않은 항목(pending·running)은 미완료로 세고 맨 뒤에 둔다', () => {
    const s = summarizeEnvCheck({ pc: { items: [item('a', 'running'), item('b', 'pending'), item('c', 'pass')] } })
    expect(s.counts.pending).toBe(2)
    expect(s.items.map((i) => i.id)).toEqual(['c', 'a', 'b'])
  })

  it('알 수 없는 모양이나 빈 값은 빈 요약으로 돌려준다 (화면이 깨지지 않게)', () => {
    for (const bad of [null, undefined, 'x', 3, {}, { pc: 1 }, { pc: { items: 'no' } }]) {
      const s = summarizeEnvCheck(bad)
      expect(s.items.length).toBe(0)
      expect(s.counts).toEqual({ fail: 0, warn: 0, pass: 0, pending: 0 })
    }
  })

  it('알 수 없는 상태나 id 없는 항목은 건너뛴다', () => {
    const s = summarizeEnvCheck({ pc: { items: [item('a', 'weird'), { status: 'pass' }, item('b', 'pass')] } })
    expect(s.items.map((i) => i.id)).toEqual(['b'])
  })

  it('문제가 있는 항목만 따로 뽑는다', () => {
    const s = summarizeEnvCheck({ pc: { items: [item('a', 'fail'), item('b', 'warn'), item('c', 'pass')] } })
    expect(s.issues.map((i) => i.id)).toEqual(['a', 'b'])
  })
})

describe('안내 메시지 읽음', () => {
  const n = (id: number, readAt: string | null) => ({ id, message: `m${id}`, sentAt: '2026-12-01T00:00:00Z', readAt })
  it('읽지 않은 것만 보낸 순서대로 돌려준다', () => {
    expect(unreadNotices([n(1, null), n(2, 'x'), n(3, null)]).map((v) => v.id)).toEqual([1, 3])
  })
  it('모두 읽었으면 빈 목록', () => {
    expect(unreadNotices([n(1, 'x')]).length).toBe(0)
  })
})
