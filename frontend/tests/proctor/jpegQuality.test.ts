import { describe, expect, it } from './expect.ts'
import { QUALITY_RANGE, nextQuality } from '../../src/proctor/core/jpegQuality.ts'

/** 화질 q 에서 장당 크기(바이트). 아이폰은 같은 화질에서 더 크게 나온다 */
const size = (q: number, k: number) => k * q ** 1.7

function converge(k: number, target: number, start = 0.5) {
  let q = start
  for (let i = 0; i < 30; i++) q = nextQuality(q, size(q, k), target)
  return { q, bytes: size(q, k) }
}

describe('nextQuality', () => {
  it('작게 나오는 기기는 화질을 올려 목표 크기에 가까워진다', () => {
    const r = converge(30_000, 14_000, 0.4)
    expect(Math.abs(r.bytes - 14_000) / 14_000 < 0.1).toBe(true)
  })
  it('크게 나오는 기기는 화질을 낮춰 목표 크기에 가까워진다', () => {
    const r = converge(60_000, 14_000, 0.6)
    expect(Math.abs(r.bytes - 14_000) / 14_000 < 0.1).toBe(true)
  })
  it('화질은 허용 범위를 벗어나지 않는다', () => {
    expect(nextQuality(0.31, 1_000_000, 14_000) >= QUALITY_RANGE.min).toBe(true)
    expect(nextQuality(0.84, 1, 14_000) <= QUALITY_RANGE.max).toBe(true)
  })
  it('한 번에 너무 크게 바꾸지 않는다 (진동 방지)', () => {
    const q = nextQuality(0.5, 140_000, 14_000)
    expect(q >= 0.5 * 0.8).toBe(true)
  })
  it('목표에 가까우면 그대로 둔다', () => {
    expect(nextQuality(0.5, 14_300, 14_000)).toBe(0.5)
  })
})
