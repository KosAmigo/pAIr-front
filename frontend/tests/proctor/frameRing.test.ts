import { describe, expect, it } from './expect.ts'
import { CLIP_AFTER_MS, CLIP_BEFORE_MS, FrameRing } from '../../src/proctor/core/frameRing.ts'

describe('FrameRing', () => {
  it('이벤트 앞 8초·뒤 4초 안의 프레임만 시간순으로 고른다', () => {
    const ring = new FrameRing<string>()
    for (let t = 0; t <= 20_000; t += 1000) ring.push(t, `f${t}`)
    const picked = ring.select(12_000)
    expect(picked.length).toBeGreaterThan(0)
    expect(picked[0].offsetMs >= -CLIP_BEFORE_MS).toBe(true)
    expect(picked[picked.length - 1].offsetMs <= CLIP_AFTER_MS).toBe(true)
    const offs = picked.map((p) => p.offsetMs)
    expect(offs).toEqual([...offs].sort((a, b) => a - b))
  })

  it('프레임이 아주 촘촘해도 한 채널에서 12장을 넘기지 않는다', () => {
    const ring = new FrameRing<number>()
    for (let t = 0; t <= 14_000; t += 100) ring.push(t, t)
    expect(ring.select(8_000).length <= 12).toBe(true)
  })

  it('같은 1초 슬롯에서는 가장 늦은 프레임을 쓴다', () => {
    const ring = new FrameRing<string>()
    ring.push(1_100, 'a')
    ring.push(1_400, 'b')
    ring.push(1_900, 'c')
    const picked = ring.select(2_000)
    expect(picked.map((p) => p.data)).toEqual(['c'])
    expect(picked[0].offsetMs).toBe(-100)
  })

  it('구간 밖(8초보다 이전, 4초보다 이후) 프레임은 버린다', () => {
    const ring = new FrameRing<string>()
    ring.push(0, 'old')
    ring.push(9_000, 'in')
    ring.push(20_000, 'late')
    expect(ring.select(10_000).map((p) => p.data)).toEqual(['in'])
  })

  it('보관 시간이 지난 프레임은 새 프레임을 넣을 때 지운다', () => {
    const ring = new FrameRing<number>({ retainMs: 5_000 })
    ring.push(0, 0)
    ring.push(6_000, 1)
    expect(ring.size).toBe(1)
  })

  it('보관 개수 상한을 넘으면 가장 오래된 것부터 지운다', () => {
    const ring = new FrameRing<number>({ retainMs: 1_000_000, maxFrames: 3 })
    for (let i = 0; i < 5; i++) ring.push(i, i)
    expect(ring.size).toBe(3)
    expect(ring.select(4).map((p) => p.data)).toEqual([3, 4])
  })

  it('빈 링은 빈 배열', () => {
    expect(new FrameRing<string>().select(1000)).toEqual([])
  })
})
