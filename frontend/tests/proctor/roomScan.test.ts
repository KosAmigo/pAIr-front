import { describe, expect, it } from './expect.ts'
import {
  allFilled,
  angleDiff,
  captureHint,
  fitSize,
  laplacianVariance,
  MANUAL_NAMES,
  nearestHSlot,
  nextJpegQuality,
  normalizeBox,
  pickHorizontal,
  pickVertical,
  reasonText,
  relativeAngle,
  rotationSpeed,
  decideScanMode,
  wrapAngle,
} from '../../src/proctor/check/roomScan.ts'

const OK = { speed: 0, sharpness: 100, brightness: 120 }
const none = Array<boolean>(12).fill(false)

describe('각도 래핑', () => {
  it('음수·360 이상을 [0,360) 로', () => {
    expect(wrapAngle(-10)).toBe(350)
    expect(wrapAngle(360)).toBe(0)
    expect(wrapAngle(725)).toBe(5)
  })
  it('0/360 경계를 넘어도 짧은 차이', () => {
    expect(angleDiff(355, 5)).toBe(10)
    expect(angleDiff(5, 355)).toBe(-10)
  })
  it('시작 alpha 기준 상대 각도', () => {
    expect(relativeAngle(10, 350)).toBe(20)
    expect(relativeAngle(350, 10)).toBe(340)
  })
})

describe('가로 칸', () => {
  it('0도와 359도는 둘 다 칸 0', () => {
    expect(nearestHSlot(0).index).toBe(0)
    expect(nearestHSlot(359).index).toBe(0)
    expect(nearestHSlot(359).offset).toBe(-1)
  })
  it('칸 중심 ±10도 안이면 촬영, 밖이면 안 찍음', () => {
    expect(pickHorizontal(40, { filled: none, quality: OK }).slot).toBe(1)
    expect(pickHorizontal(41, { filled: none, quality: OK }).slot).toBe(null)
    expect(pickHorizontal(350, { filled: none, quality: OK }).slot).toBe(0)
  })
  it('이미 채운 칸은 다시 안 찍는다', () => {
    const f = [...none]
    f[1] = true
    expect(pickHorizontal(30, { filled: f, quality: OK }).slot).toBe(null)
  })
})

describe('촬영 조건', () => {
  it('빠른 회전은 거부하고 안내한다', () => {
    const r = pickHorizontal(30, { filled: none, quality: { ...OK, speed: 80 } })
    expect(r.slot).toBe(null)
    expect(r.hint).toBe('fast')
  })
  it('흐림·어두움', () => {
    expect(captureHint({ ...OK, sharpness: 5 })).toBe('blur')
    expect(captureHint({ ...OK, brightness: 10 })).toBe('dark')
    expect(captureHint(OK)).toBe(null)
  })
  it('칸 밖에서는 안내를 띄우지 않는다', () => {
    expect(pickHorizontal(15, { filled: none, quality: { ...OK, speed: 99 } }).hint).toBe(null)
  })
  it('회전 속도는 세 축 합성', () => {
    expect(rotationSpeed({ alpha: 3, beta: 4, gamma: 0 })).toBe(5)
    expect(rotationSpeed(null)).toBe(0)
  })
  it('라플라시안: 평평하면 0, 선명하면 큼', () => {
    const flat = new Uint8Array(100).fill(100)
    expect(laplacianVariance(flat, 10, 10)).toBe(0)
    const checker = Uint8Array.from({ length: 100 }, (_, i) => ((i % 10) + Math.floor(i / 10)) % 2 ? 255 : 0)
    expect(laplacianVariance(checker, 10, 10) > 1000).toBe(true)
  })
})

describe('세로 칸', () => {
  it('beta 가 목표 ±10도 안이면 촬영', () => {
    expect(pickVertical(15, { filled: [false, false, false, false, false], quality: OK }).slot).toBe(0)
    expect(pickVertical(150, { filled: [false, false, false, false, false], quality: OK }).slot).toBe(4)
    expect(pickVertical(65, { filled: [false, false, false, false, false], quality: OK }).slot).toBe(null)
  })
})

describe('수동 모드 전환', () => {
  it('권한 거부·미지원이면 바로 수동', () => {
    expect(decideScanMode({ permission: 'denied', sinceStartMs: 0, sinceLastSampleMs: null })).toBe('manual')
    expect(decideScanMode({ permission: 'unsupported', sinceStartMs: 0, sinceLastSampleMs: null })).toBe('manual')
  })
  it('센서 값이 2초간 안 오면 수동, 그전엔 대기', () => {
    expect(decideScanMode({ permission: 'granted', sinceStartMs: 1500, sinceLastSampleMs: null })).toBe('waiting')
    expect(decideScanMode({ permission: 'granted', sinceStartMs: 2000, sinceLastSampleMs: null })).toBe('manual')
  })
  it('값이 오고 있으면 센서, 끊기면 수동', () => {
    expect(decideScanMode({ permission: 'granted', sinceStartMs: 5000, sinceLastSampleMs: 100 })).toBe('sensor')
    expect(decideScanMode({ permission: 'granted', sinceStartMs: 9000, sinceLastSampleMs: 2500 })).toBe('manual')
  })
  it('수동은 6장', () => {
    expect(MANUAL_NAMES).toHaveLength(6)
  })
})

describe('그 밖에', () => {
  it('모든 칸이 차야 분석 가능', () => {
    expect(allFilled(['a', 'b'], { a: 1 })).toBe(false)
    expect(allFilled(['a', 'b'], { a: 1, b: 2 })).toBe(true)
    expect(allFilled([], {})).toBe(false)
  })
  it('긴 변 960 이하로', () => {
    expect(fitSize(1920, 1080)).toEqual({ w: 960, h: 540 })
    expect(fitSize(640, 480)).toEqual({ w: 640, h: 480 })
  })
  it('JPEG 용량 초과면 품질을 낮춘다', () => {
    expect(nextJpegQuality(0.85, 500_000)).toBe(0.75)
    expect(nextJpegQuality(0.85, 100_000)).toBe(null)
    expect(nextJpegQuality(0.3, 500_000)).toBe(null)
  })
  it('box 는 비율·픽셀 모두 받는다', () => {
    expect(normalizeBox([0.1, 0.2, 0.5, 0.6], 960, 540)).toEqual([0.1, 0.2, 0.5, 0.6])
    expect(normalizeBox([96, 54, 480, 270], 960, 540)).toEqual([0.1, 0.1, 0.5, 0.5])
  })
  it('이유 문장', () => {
    expect(reasonText('PHONE')).toContain('휴대폰이 보여요')
  })
})
