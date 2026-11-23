import { describe, expect, it } from './expect.ts'
import { ChangeGate, GATE_DEFAULTS, lumaDiff } from '../../src/proctor/core/frameGate.ts'

const W = 64
const H = 48
const flat = (v: number) => new Uint8Array(W * H).fill(v)
function withBlock(base: number, x0: number, y0: number, size: number, v: number) {
  const a = flat(base)
  for (let y = y0; y < y0 + size; y++) for (let x = x0; x < x0 + size; x++) a[y * W + x] = v
  return a
}

describe('lumaDiff', () => {
  it('같은 화면이면 0', () => {
    const d = lumaDiff(flat(100), flat(100), W, H)
    expect(d.mean).toBe(0)
    expect(d.maxBlock).toBe(0)
  })
  it('전체가 128 밝아지면 평균·블록 모두 약 0.5', () => {
    const d = lumaDiff(flat(0), flat(128), W, H)
    expect(d.mean).toBeCloseTo(0.502, 2)
    expect(d.maxBlock).toBeCloseTo(0.502, 2)
  })
  it('작은 물체: 평균은 작지만 그 칸의 블록 변화는 크다', () => {
    const d = lumaDiff(flat(100), withBlock(100, 8, 8, 8, 255), W, H)
    expect(d.mean < 0.04).toBe(true)
    expect(d.maxBlock > 0.5).toBe(true)
  })
})

describe('ChangeGate', () => {
  const cfg = { ...GATE_DEFAULTS, minIntervalMs: 200, keepAliveMs: 5000 }

  it('첫 프레임은 보낸다', () => {
    expect(new ChangeGate(cfg).decide(flat(100), W, H, 0)).toBe(true)
  })
  it('변화가 없으면 건너뛰고, 5초가 지나면 생존용으로 한 장 보낸다', () => {
    const g = new ChangeGate(cfg)
    g.decide(flat(100), W, H, 0)
    expect(g.decide(flat(100), W, H, 1000)).toBe(false)
    expect(g.decide(flat(100), W, H, 4900)).toBe(false)
    expect(g.decide(flat(100), W, H, 5000)).toBe(true)
  })
  it('평균 변화가 임계값 이상이면 보낸다', () => {
    const g = new ChangeGate(cfg)
    g.decide(flat(100), W, H, 0)
    expect(g.decide(flat(140), W, H, 1000)).toBe(true)
  })
  it('작은 물체가 놓여도(평균은 작아도) 블록 변화가 크면 보낸다', () => {
    const g = new ChangeGate(cfg)
    g.decide(flat(100), W, H, 0)
    expect(g.decide(withBlock(100, 8, 8, 8, 255), W, H, 1000)).toBe(true)
  })
  it('최소 간격(초당 5장 상한)보다 빨리는 보내지 않는다', () => {
    const g = new ChangeGate(cfg)
    g.decide(flat(0), W, H, 0)
    expect(g.decide(flat(200), W, H, 100)).toBe(false)
    expect(g.decide(flat(200), W, H, 200)).toBe(true)
  })
  it('서서히 변하는 것도 마지막으로 보낸 화면과 비교하므로 결국 보낸다', () => {
    const g = new ChangeGate({ ...cfg, meanThreshold: 0.04, blockThreshold: 0.9 })
    g.decide(flat(100), W, H, 0)
    let sent = false
    for (let i = 1; i <= 10; i++) sent = g.decide(flat(100 + i * 2), W, H, i * 300) || sent
    expect(sent).toBe(true)
  })
})
