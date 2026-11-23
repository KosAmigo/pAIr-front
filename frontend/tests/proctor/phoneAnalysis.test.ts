import { describe, expect, it } from './expect.ts'
import type { CamViolation } from '../../src/proctor/core/events.ts'
import type { DetectedObject, PhoneFeatures } from '../../src/proctor/core/phoneRules.ts'
import { PhoneAnalysis, type PhoneAnalysisState } from '../../src/proctor/phoneAnalysis.ts'
import type { PhoneVisionBackend } from '../../src/proctor/vision/phoneBackend.ts'

const jpeg = () => new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer
const hand = { x: 0.5, y: 0.5 }
const withHands: PhoneFeatures = { hands: [hand, hand], objects: [] }
const noHands: PhoneFeatures = { hands: [], objects: [] }
const phoneObj: DetectedObject = { label: 'cell phone', score: 0.9, bright: false }

const tick = () => new Promise((r) => setTimeout(r, 0))

function setup(initial: PhoneFeatures = withHands) {
  let next = initial
  let calls = 0
  const backend: PhoneVisionBackend = { kind: 'worker', analyze: () => (calls++, Promise.resolve(next)), dispose: () => undefined }
  const states: PhoneAnalysisState[] = []
  const violations: CamViolation[] = []
  const a = new PhoneAnalysis({
    createBackend: () => Promise.resolve(backend),
    onState: (s) => states.push(s),
    onViolation: (v) => violations.push(v),
    serverOffsetMs: () => 0,
    intervalMs: () => 0,
    autoTick: false,
  })
  return {
    a,
    states,
    violations,
    calls: () => calls,
    setFeatures: (f: PhoneFeatures) => (next = f),
    last: () => states[states.length - 1],
  }
}

/** 보정(3초)을 끝낸다: 프레임 한 장 → 시간이 흐르며 tick */
async function calibrate(t: ReturnType<typeof setup>, startAt = 1000) {
  t.a.start()
  await tick()
  t.a.offer(jpeg(), startAt)
  await tick()
  for (let ms = 0; ms <= 3500; ms += 500) t.a.tick(startAt + ms)
}

describe('PhoneAnalysis', () => {
  it('start → 불러오는 중 → 보정 중 → (손이 보이면) 감시', async () => {
    const t = setup()
    t.a.start()
    expect(t.last().status).toBe('loading')
    await tick()
    expect(t.last().status).toBe('calibrating')
    t.a.offer(jpeg(), 1000)
    await tick()
    t.a.tick(1000)
    expect(t.last().status).toBe('calibrating')
    for (let ms = 500; ms <= 3500; ms += 500) t.a.tick(1000 + ms)
    expect(t.last().status).toBe('monitoring')
  })

  it('보정 동안 손이 한 번도 안 보이면 오류로 알린다', async () => {
    const t = setup(noHands)
    await calibrate(t)
    expect(t.last().status).toBe('error')
    expect(t.last().error).toContain('손이 보이지 않습니다')
  })

  it('프레임이 오기 전에는 보정이 시작되지 않는다', async () => {
    const t = setup()
    t.a.start()
    await tick()
    for (let ms = 0; ms <= 5000; ms += 500) t.a.tick(ms)
    expect(t.last().status).toBe('calibrating')
    expect(t.last().calibProgress).toBe(0)
  })

  it('감시 중 휴대폰이 보이면 프레임이 드물어도(변화 없어 안 오는 경우) 지속 시간을 채워 경고한다', async () => {
    const t = setup()
    await calibrate(t)
    t.setFeatures({ hands: [hand, hand], objects: [phoneObj] })
    t.a.offer(jpeg(), 6000)
    await tick()
    // 새 프레임은 이 한 장뿐이지만 마지막 상태를 이어서 판정한다
    t.a.tick(6000)
    t.a.tick(6500)
    t.a.tick(7000)
    t.a.tick(7500)
    expect(t.violations.length).toBe(1)
    expect(t.violations[0].type).toBe('PHONE')
    expect(t.violations[0].source).toBe('PHONE_CAM')
  })

  it('경고에는 마지막으로 받은 프레임이 사진으로 붙는다', async () => {
    const t = setup()
    await calibrate(t)
    t.setFeatures({ hands: [hand, hand], objects: [phoneObj] })
    t.a.offer(jpeg(), 6000)
    await tick()
    for (let ms = 0; ms <= 2000; ms += 500) t.a.tick(6000 + ms)
    expect(String(t.violations[0].snapshot).startsWith('data:image/jpeg;base64,')).toBe(true)
  })

  it('너무 오래(20초 넘게) 새 프레임이 없으면 낡은 상태로 판정하지 않는다', async () => {
    const t = setup()
    await calibrate(t)
    t.setFeatures({ hands: [hand, hand], objects: [phoneObj] })
    t.a.offer(jpeg(), 6000)
    await tick()
    for (let ms = 30_000; ms <= 34_000; ms += 500) t.a.tick(ms)
    expect(t.violations.length).toBe(0)
  })

  it('분석이 바쁜 동안 들어온 프레임은 최신 한 장만 남겨 이어서 분석한다', async () => {
    let release: (f: PhoneFeatures) => void = () => undefined
    let calls = 0
    const backend: PhoneVisionBackend = {
      kind: 'worker',
      analyze: () => (calls++, new Promise<PhoneFeatures>((r) => (release = r))),
      dispose: () => undefined,
    }
    const a = new PhoneAnalysis({ createBackend: () => Promise.resolve(backend), onState: () => undefined, onViolation: () => undefined, serverOffsetMs: () => 0, intervalMs: () => 0, autoTick: false })
    a.start()
    await tick()
    a.offer(jpeg(), 1)
    a.offer(jpeg(), 2)
    a.offer(jpeg(), 3)
    expect(calls).toBe(1)
    release(withHands)
    await tick()
    expect(calls).toBe(2)
  })

  it('분석이 연달아 3번 실패하면 오류로 멈춘다', async () => {
    const backend: PhoneVisionBackend = { kind: 'worker', analyze: () => Promise.reject(new Error('x')), dispose: () => undefined }
    const states: PhoneAnalysisState[] = []
    const a = new PhoneAnalysis({ createBackend: () => Promise.resolve(backend), onState: (s) => states.push(s), onViolation: () => undefined, serverOffsetMs: () => 0, intervalMs: () => 0, autoTick: false })
    a.start()
    await tick()
    for (let i = 0; i < 4; i++) {
      a.offer(jpeg(), i)
      await tick()
    }
    expect(states[states.length - 1].status).toBe('error')
  })

  it('stop 하면 idle 로 돌아가고 이후 프레임은 무시한다', async () => {
    const t = setup()
    t.a.start()
    await tick()
    t.a.stop()
    const before = t.calls()
    t.a.offer(jpeg(), 5)
    await tick()
    expect(t.last().status).toBe('idle')
    expect(t.calls()).toBe(before)
  })
})

describe('PhoneAnalysis.probe', () => {
  it('같은 프레임을 여러 번 분석해 워밍업을 뺀 시간 표본을 돌려주고 상태는 바꾸지 않는다', async () => {
    const t = setup()
    const times = await t.a.probe(jpeg(), 4)
    expect(times).toHaveLength(4)
    expect(t.calls()).toBe(5)
    expect(t.states).toHaveLength(0)
  })
})
