import { describe, expect, it } from 'vitest'
import {
  CoverageTracker,
  audioVerdict,
  cameraVerdict,
  frameDifference,
  lightingVerdict,
  lumaStats,
  makeReport,
  placementVerdict,
  rendererVerdict,
  scanComplete,
  scanVerdict,
  screensVerdict,
  tileRects,
} from '../src/check/envChecks'

function solid(w: number, h: number, v: number) {
  const d = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = v
  return d
}

describe('조명', () => {
  it('어두우면 실패, 적당하면 통과', () => {
    expect(lightingVerdict(lumaStats(solid(8, 8, 30), 8, 8)).status).toBe('fail')
    expect(lightingVerdict(lumaStats(solid(8, 8, 70), 8, 8)).status).toBe('warn')
    expect(lightingVerdict(lumaStats(solid(8, 8, 140), 8, 8)).status).toBe('pass')
  })
  it('얼굴이 배경보다 훨씬 어두우면 역광', () => {
    const frame = lumaStats(solid(8, 8, 200), 8, 8)
    const face = lumaStats(solid(8, 8, 90), 8, 8)
    expect(lightingVerdict(frame, face).detail).toContain('역광')
  })
  it('영역 지정 밝기', () => {
    const d = solid(4, 4, 0)
    for (const i of [0, 1, 4, 5]) d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 255
    expect(lumaStats(d, 4, 4, { x: 0, y: 0, w: 0.5, h: 0.5 }).mean).toBeCloseTo(255)
  })
})

describe('장치 판정', () => {
  it('가상 카메라', () => {
    expect(cameraVerdict('OBS Virtual Camera').status).toBe('fail')
    expect(cameraVerdict('DroidCam Source 3').status).toBe('fail')
    expect(cameraVerdict('Integrated Webcam (0c45:6a10)').status).toBe('pass')
  })
  it('원격·가상 그래픽은 경고', () => {
    expect(rendererVerdict('ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11)').status).toBe('warn')
    expect(rendererVerdict('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))').status).toBe('warn')
    expect(rendererVerdict('ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11)').status).toBe('pass')
  })
  it('이어폰 연결', () => {
    expect(audioVerdict(['기본값 - 스피커 (Realtek(R) Audio)', 'AirPods Pro 핸즈프리']).status).toBe('fail')
    expect(audioVerdict(['헤드셋 (Galaxy Buds2 Pro)']).status).toBe('fail')
    expect(audioVerdict(['마이크 배열 (Realtek(R) Audio)', '스피커 (Realtek(R) Audio)']).status).toBe('pass')
    expect(audioVerdict(null).status).toBe('warn')
  })
  it('모니터', () => {
    expect(screensVerdict(2, true).status).toBe('fail')
    expect(screensVerdict(1, false).status).toBe('pass')
    expect(screensVerdict(null, true).status).toBe('fail')
    expect(screensVerdict(null, undefined).status).toBe('warn')
  })
})

describe('얼굴 배치', () => {
  const box = { x: 0.35, y: 0.2, w: 0.3, h: 0.35 }
  it('가운데·적당한 크기면 통과', () => {
    expect(placementVerdict({ faceCount: 1, box, shouldersVisible: true }).status).toBe('pass')
  })
  it('멀거나 가깝거나 치우치거나 여러 명', () => {
    expect(placementVerdict({ faceCount: 1, box: { ...box, w: 0.1 }, shouldersVisible: true }).detail).toContain('멉니다')
    expect(placementVerdict({ faceCount: 1, box: { ...box, w: 0.7, x: 0.15 }, shouldersVisible: true }).detail).toContain('가깝')
    expect(placementVerdict({ faceCount: 1, box: { ...box, x: 0.0 }, shouldersVisible: true }).status).toBe('fail')
    expect(placementVerdict({ faceCount: 2, box, shouldersVisible: true }).status).toBe('fail')
  })
})

describe('360도 스캔', () => {
  it('방향 구간 누적', () => {
    const c = new CoverageTracker(12)
    for (let h = 0; h < 360; h += 10) c.add(h)
    expect(c.covered).toBe(12)
    const half = new CoverageTracker(12)
    for (let h = -90; h < 90; h += 10) half.add(h)
    expect(half.covered).toBe(6)
  })
  it('완료 조건: 자이로 있으면 방향+사진 수, 없으면 시간+사진 수', () => {
    expect(scanComplete(8, 10, 5000)).toBe(true)
    expect(scanComplete(8, 6, 60000)).toBe(false)
    expect(scanComplete(10, null, 16000)).toBe(true)
    expect(scanComplete(10, null, 8000)).toBe(false)
  })
  it('프레임 차이', () => {
    expect(frameDifference(new Uint8Array([0, 0]), new Uint8Array([255, 255]))).toBe(1)
    expect(frameDifference(new Uint8Array([10, 10]), new Uint8Array([10, 10]))).toBe(0)
  })
  it('타일: 전체 + 겹치는 4칸이 화면을 다 덮는다', () => {
    const t = tileRects(1280, 720)
    expect(t).toHaveLength(5)
    for (const r of t) {
      expect(r.x + r.w).toBeLessThanOrEqual(1280)
      expect(r.y + r.h).toBeLessThanOrEqual(720)
    }
    expect(t[1].w).toBeGreaterThan(640)
  })
  it('스캔 결과 판정', () => {
    expect(scanVerdict({}, 'room').status).toBe('pass')
    expect(scanVerdict({ person: 1 }, 'room').status).toBe('fail')
    expect(scanVerdict({ tv: 2 }, 'room').status).toBe('warn')
    expect(scanVerdict({ book: 1 }, 'desk').status).toBe('fail')
    expect(scanVerdict({ laptop: 3 }, 'desk').status).toBe('pass')
  })
})

it('fail이 하나라도 있으면 리포트 실패', () => {
  expect(makeReport([{ id: 'a', label: 'a', status: 'warn', detail: '' }]).passed).toBe(true)
  expect(makeReport([{ id: 'a', label: 'a', status: 'fail', detail: '' }]).passed).toBe(false)
})
