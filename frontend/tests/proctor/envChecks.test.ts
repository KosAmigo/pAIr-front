import { describe, expect, it } from './expect.ts'
import {
  HEAD_TURN,
  HeadTurnTracker,
  audioVerdict,
  cameraVerdict,
  frameDifference,
  lightingVerdict,
  lumaStats,
  makeReport,
  placementVerdict,
  rendererVerdict,
  deskDetection,
  screensVerdict,
  tileRects,
} from '../../src/proctor/check/envChecks.ts'

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

describe('스캔', () => {
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
})

it('fail이 하나라도 있으면 리포트 실패', () => {
  expect(makeReport([{ id: 'a', label: 'a', status: 'warn', detail: '' }]).passed).toBe(true)
  expect(makeReport([{ id: 'a', label: 'a', status: 'fail', detail: '' }]).passed).toBe(false)
})

describe('귀 확인: 고개 돌림', () => {
  const t0 = 1000
  /** 프레임을 gapMs 간격으로 흘려 보내고, 판정이 나오면 그 값을 돌려준다 */
  function feed(tracker: HeadTurnTracker, frames: { yaw?: number; faces: number }[], gapMs = 66, start = t0) {
    let result = 0
    frames.forEach((f, i) => {
      const r = tracker.update(f.yaw, f.faces, start + i * gapMs)
      if (r && !result) result = r
    })
    return result
  }
  const hold = (yaw: number, ms: number) => Array.from({ length: Math.ceil(ms / 66) + 1 }, () => ({ yaw, faces: 1 }))

  it('기준 각도 이상을 잠깐 유지하면 돌린 방향을 돌려준다', () => {
    expect(feed(new HeadTurnTracker(0), hold(HEAD_TURN.deg + 2, 400))).toBe(1)
    expect(feed(new HeadTurnTracker(0), hold(-(HEAD_TURN.deg + 2), 400))).toBe(-1)
  })

  it('각도가 모자라거나 너무 짧으면 인정하지 않는다', () => {
    expect(feed(new HeadTurnTracker(0), hold(HEAD_TURN.deg - 8, 800))).toBe(0)
    expect(feed(new HeadTurnTracker(0), hold(HEAD_TURN.deg + 2, 100))).toBe(0)
  })

  it('이미 확인한 쪽(avoidSign)은 인정하지 않고 반대쪽만 인정한다', () => {
    expect(feed(new HeadTurnTracker(1), hold(HEAD_TURN.deg + 5, 800))).toBe(0)
    expect(feed(new HeadTurnTracker(1), hold(-(HEAD_TURN.deg + 5), 400))).toBe(-1)
  })

  it('끝까지 돌려서 얼굴 모델이 얼굴을 놓쳐도, 방금까지 돌리고 있었다면 인정한다', () => {
    const frames = [...hold(HEAD_TURN.deg + 5, 200), { yaw: undefined, faces: 0 }, { yaw: undefined, faces: 0 }]
    expect(feed(new HeadTurnTracker(0), frames)).toBe(1)
  })

  it('얼굴이 안 보여도 돌리던 중이 아니었다면 인정하지 않는다', () => {
    const frames = Array.from({ length: 30 }, () => ({ yaw: undefined, faces: 0 }))
    expect(feed(new HeadTurnTracker(0), frames)).toBe(0)
  })

  it('돌리다 말고 정면으로 돌아오면 처음부터 다시 센다', () => {
    const frames = [...hold(HEAD_TURN.deg + 5, 120), ...hold(0, 300), { yaw: undefined, faces: 0 }, { yaw: undefined, faces: 0 }]
    expect(feed(new HeadTurnTracker(0), frames)).toBe(0)
  })

  it('돌린 뒤 얼굴이 오래 안 보이면(유예 초과) 인정하지 않는다', () => {
    const tracker = new HeadTurnTracker(0)
    const strong = hold(HEAD_TURN.deg + 5, 60) // 한 프레임뿐이라 아직 확정 전
    expect(feed(tracker, strong)).toBe(0)
    expect(tracker.update(undefined, 0, t0 + HEAD_TURN.lostGraceMs + 500)).toBe(0)
  })
})

describe('책상 스캔 결과: 판정하지 않고 감독관에게 전달', () => {
  it('아무것도 없으면 통과, 무엇이 잡히면 경고만 하고 불통과로 막지 않는다', () => {
    expect(deskDetection({}).status).toBe('pass')
    for (const found of [{ 'cell phone': 3 }, { book: 1 }, { tv: 1, laptop: 2 }, { 'cell phone': 1, book: 2, tv: 1 }]) {
      expect(deskDetection(found).status).toBe('warn')
      expect(makeReport([{ id: 'desk', label: '', detail: '', ...deskDetection(found) }]).passed).toBe(true)
    }
  })

  it('무엇이 몇 번 잡혔는지 알리고 감독관이 판단한다고 안내한다', () => {
    const v = deskDetection({ 'cell phone': 2, book: 1 })
    expect(v.detail.includes('휴대폰 2회')).toBe(true)
    expect(v.detail.includes('책 1회')).toBe(true)
    expect(v.detail.includes('감독관')).toBe(true)
  })

  it('아무것도 없으면 그렇게 알리고 사진은 감독관에게 전달된다고 안내한다', () => {
    const v = deskDetection({})
    expect(v.detail.includes('감지된 물체 없음')).toBe(true)
    expect(v.detail.includes('감독관')).toBe(true)
  })

  it('책상에서는 사람을 세지 않는다 (응시자 본인의 손·팔이 사람으로 잡히는 오탐)', () => {
    expect(deskDetection({ person: 3 }).detail.includes('감지된 물체 없음')).toBe(true)
    expect(deskDetection({ person: 3, book: 1 }).detail.includes('사람')).toBe(false)
  })
})
