import { describe, expect, it } from './expect.ts'
import { RuleEngine, SustainedRule } from '../../src/proctor/core/RuleEngine.ts'
import { PC_RULES, buildPcBaseline, pcConditions, type PcBaseline, type PcFeatures } from '../../src/proctor/core/pcRules.ts'
import { buildPhoneBaseline, dedupeObjects, phoneConditions, type PhoneFeatures } from '../../src/proctor/core/phoneRules.ts'
import { gazeFromBlendshapes, headPoseFromMatrix } from '../../src/proctor/vision/features.ts'

const rule = (durationMs = 1000, cooldownMs = 5000) =>
  new SustainedRule({ kind: 'x', message: 'x', durationMs, cooldownMs, graceMs: 300 })

describe('SustainedRule', () => {
  it('지속 시간이 차야 경고한다', () => {
    const r = rule()
    expect(r.update(true, 0)).toBeNull()
    expect(r.update(true, 900)).toBeNull()
    const f = r.update(true, 1000)
    expect(f?.startedAt).toBe(0)
    expect(f?.durationMs).toBe(1000)
  })

  it('한 프레임 튀는 값은 경고하지 않는다', () => {
    const r = rule()
    r.update(true, 0)
    r.update(false, 100)
    r.update(false, 500) // grace 300ms 초과 → 구간 종료
    expect(r.update(true, 600)).toBeNull()
    expect(r.update(true, 1500)).toBeNull()
    expect(r.update(true, 1600)).not.toBeNull()
  })

  it('짧게 끊긴 감지는 같은 구간으로 이어 붙인다', () => {
    const r = rule()
    r.update(true, 0)
    r.update(true, 300)
    r.update(false, 400) // 마지막 참(300)에서 100ms → grace(300ms) 안
    r.update(true, 600)
    expect(r.update(true, 1000)?.startedAt).toBe(0)
  })

  it('쿨다운 동안은 다시 경고하지 않고, 계속되면 쿨다운 후 다시 경고한다', () => {
    const r = rule(1000, 5000)
    for (let t = 0; t <= 1000; t += 100) r.update(true, t)
    let again = null
    for (let t = 1100; t < 6000; t += 100) again ??= r.update(true, t)
    expect(again).toBeNull()
    expect(r.update(true, 6000)).not.toBeNull()
  })
})

const baseline: PcBaseline = { yaw: 0, pitch: 5, gazeX: 0, gazeY: 0.1, shoulders: { cx: 0.5, cy: 0.8, width: 0.4 } }
const normal: PcFeatures = {
  faceCount: 1, yaw: 3, pitch: 7, gazeX: 0.05, gazeY: 0.15, blink: 0,
  shoulders: { cx: 0.52, cy: 0.8, width: 0.41 },
}

describe('pcConditions', () => {
  it('정면 자세는 모두 정상', () => {
    expect(Object.values(pcConditions(normal, baseline)).some(Boolean)).toBe(false)
  })
  it('고개를 30도 돌리면 head_turn', () => {
    expect(pcConditions({ ...normal, yaw: 32 }, baseline).head_turn).toBe(true)
  })
  it('고개를 숙이면 head_down, 들면 head_turn', () => {
    expect(pcConditions({ ...normal, pitch: 40 }, baseline).head_down).toBe(true)
    expect(pcConditions({ ...normal, pitch: -20 }, baseline).head_turn).toBe(true)
  })
  it('시선만 옆으로 가도 gaze_away, 눈 감았을 땐 판정 안 함', () => {
    expect(pcConditions({ ...normal, gazeX: 0.6 }, baseline).gaze_away).toBe(true)
    expect(pcConditions({ ...normal, gazeX: 0.6, blink: 0.8 }, baseline).gaze_away).toBeUndefined()
  })
  it('얼굴 수', () => {
    expect(pcConditions({ faceCount: 0 }, baseline).no_face).toBe(true)
    expect(pcConditions({ ...normal, faceCount: 2 }, baseline).multi_face).toBe(true)
  })
  it('몸통 이동·회전', () => {
    expect(pcConditions({ ...normal, shoulders: { cx: 0.7, cy: 0.8, width: 0.4 } }, baseline).torso_shift).toBe(true)
    expect(pcConditions({ ...normal, shoulders: { cx: 0.5, cy: 0.8, width: 0.25 } }, baseline).torso_turn).toBe(true)
    expect(pcConditions({ ...normal, shoulders: null }, baseline).torso_shift).toBe(true)
  })
  it('엔진과 엮으면 1.5초 이상 고개를 돌려야 경고', () => {
    const engine = new RuleEngine(PC_RULES)
    const fired = []
    for (let t = 0; t <= 2000; t += 33) fired.push(...engine.evaluate(pcConditions({ ...normal, yaw: 40 }, baseline), t))
    expect(fired.map((f) => f.kind)).toEqual(['head_turn'])
    expect(fired[0].ts).toBeGreaterThanOrEqual(1500)
  })
})

describe('buildPcBaseline', () => {
  it('얼굴이 대부분 안 잡히면 null', () => {
    expect(buildPcBaseline(Array(10).fill({ faceCount: 0 }))).toBeNull()
  })
  it('중앙값으로 기준을 잡아 튀는 값에 강하다', () => {
    const s = [...Array(9).fill(normal), { ...normal, yaw: 80 }]
    expect(buildPcBaseline(s)?.yaw).toBe(3)
  })
})

describe('phone rules', () => {
  const calib: PhoneFeatures[] = Array.from({ length: 20 }, () => ({
    hands: [{ x: 0.6, y: 0.7 }, { x: 0.3, y: 0.7 }],
    wrists: [{ x: 0.3, y: 0.75 }, { x: 0.6, y: 0.75 }],
    objects: [{ label: 'laptop', score: 0.8, bright: true }],
  }))
  const b = buildPhoneBaseline(calib)

  it('기준: 손 2개(왼쪽부터 정렬), 화면 1개', () => {
    expect(b.handCount).toBe(2)
    expect(b.hands[0].x).toBe(0.3)
    expect(b.screenCount).toBe(1)
  })
  it('평소 상태는 정상', () => {
    expect(Object.values(phoneConditions(calib[0], b)).some(Boolean)).toBe(false)
  })
  it('손 하나가 사라지거나 크게 움직이면 경고 조건', () => {
    expect(phoneConditions({ ...calib[0], hands: [{ x: 0.3, y: 0.7 }] }, b).hand_missing).toBe(true)
    expect(phoneConditions({ ...calib[0], hands: [{ x: 0.3, y: 0.7 }, { x: 0.6, y: 0.2 }] }, b).hand_moved).toBe(true)
  })
  it('휴대폰·추가 화면·책', () => {
    const extra = { ...calib[0], objects: [...calib[0].objects, { label: 'tv', score: 0.7, bright: true }] }
    expect(phoneConditions(extra, b).extra_screen).toBe(true)
    expect(phoneConditions({ ...calib[0], objects: [{ label: 'cell phone', score: 0.6, bright: false }] }, b).phone_detected).toBe(true)
    expect(phoneConditions({ ...calib[0], objects: [{ label: 'book', score: 0.3, bright: false }] }, b).book_detected).toBe(false)
  })
})

describe('dedupeObjects', () => {
  const laptop = { label: 'laptop', score: 0.8, bright: true, box: { x: 0.2, y: 0.2, w: 0.5, h: 0.5 } }
  it('같은 노트북이 박스 두 개로 잡혀도 화면 1개로 센다 (실기기 오탐)', () => {
    const inner = { label: 'laptop', score: 0.5, bright: true, box: { x: 0.3, y: 0.25, w: 0.3, h: 0.25 } }
    expect(dedupeObjects([inner, laptop])).toEqual([laptop])
    const tvOverlap = { label: 'tv', score: 0.6, bright: true, box: { x: 0.22, y: 0.2, w: 0.5, h: 0.48 } }
    expect(dedupeObjects([laptop, tvOverlap])).toHaveLength(1)
  })
  it('떨어져 있는 두 화면은 각각 센다', () => {
    const other = { label: 'tv', score: 0.7, bright: true, box: { x: 0.75, y: 0.1, w: 0.2, h: 0.3 } }
    expect(dedupeObjects([laptop, other])).toHaveLength(2)
  })
  it('화면 위의 휴대폰은 합치지 않는다', () => {
    const phone = { label: 'cell phone', score: 0.6, bright: false, box: { x: 0.3, y: 0.3, w: 0.1, h: 0.1 } }
    expect(dedupeObjects([laptop, phone])).toHaveLength(2)
  })
})

describe('features', () => {
  it('단위 행렬은 고개 각도 0', () => {
    const p = headPoseFromMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
    expect(Math.abs(p.yaw) + Math.abs(p.pitch) + Math.abs(p.roll)).toBeCloseTo(0)
  })
  it('y축 30도 회전 행렬에서 yaw 30', () => {
    const a = (30 * Math.PI) / 180
    // column-major: col0 = (cos,0,-sin), col2 = (sin,0,cos)
    const m = [Math.cos(a), 0, -Math.sin(a), 0, 0, 1, 0, 0, Math.sin(a), 0, Math.cos(a), 0, 0, 0, 0, 1]
    expect(headPoseFromMatrix(m).yaw).toBeCloseTo(30)
  })
  it('오른쪽 응시 → gazeX 양수', () => {
    const cats = [
      { categoryName: 'eyeLookInLeft', score: 0.7 },
      { categoryName: 'eyeLookOutRight', score: 0.7 },
    ].map((c, i) => ({ ...c, index: i, displayName: '' }))
    expect(gazeFromBlendshapes({ categories: cats, headIndex: 0, headName: '' }).gazeX).toBeCloseTo(0.7)
  })
})
