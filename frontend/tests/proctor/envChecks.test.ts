import { describe, expect, it } from './expect.ts'
import {
  ANGLE_SCAN,
  AngleScanTracker,
  CoverageTracker,
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
  scanComplete,
  scanVerdict,
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
    expect(scanVerdict({ person: 1 }, 'room').status).toBe('warn') // 방 스캔은 막지 않고 경고만
    expect(scanVerdict({ tv: 2 }, 'room').status).toBe('warn')
    expect(scanVerdict({ book: 1 }, 'desk').status).toBe('fail')
    expect(scanVerdict({ laptop: 3 }, 'desk').status).toBe('pass')
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

describe('스캔 판정: 책상과 휴대폰 확인', () => {
  it('책상 위에서는 다른 사람을 보지 않는다 (방에서는 그대로 실패)', () => {
    expect(scanVerdict({ person: 3 }, 'desk').status).toBe('pass')
    expect(scanVerdict({ person: 3 }, 'desk').detail.includes('다른 사람')).toBe(false)
    expect(scanVerdict({ person: 1 }, 'room').status).toBe('warn')
  })

  it('책상에서 사람이 함께 잡혀도 책·휴대폰 판정은 그대로다', () => {
    expect(scanVerdict({ person: 2, book: 1 }, 'desk').status).toBe('fail')
    expect(scanVerdict({ person: 2, 'cell phone': 1 }, 'desk').status).toBe('fail')
  })

  it('휴대폰 감지는 실패지만, 응시자가 아니라고 확인하면 경고로 낮추고 사진 확인을 안내한다', () => {
    expect(scanVerdict({ 'cell phone': 2 }, 'desk').status).toBe('fail')
    const v = scanVerdict({ 'cell phone': 2 }, 'desk', { phoneDismissed: true })
    expect(v.status).toBe('warn')
    expect(v.detail).toContain('휴대폰')
    expect(v.detail).toContain('아니라고 확인')
  })

  it('휴대폰을 아니라고 해도 다른 위반(책 등)은 그대로 실패다', () => {
    expect(scanVerdict({ 'cell phone': 1, book: 1 }, 'desk', { phoneDismissed: true }).status).toBe('fail')
  })
})

describe('방 360도: 각도별 확인', () => {
  const step = 360 / ANGLE_SCAN.sectors
  const center = (i: number) => i * step + step / 2

  /** 한 방향에 holdMs 만큼 머무는 프레임들을 흘려 보내고 캡처된 구간을 돌려준다 */
  function dwell(t: AngleScanTracker, sector: number, startMs: number, ms = ANGLE_SCAN.holdMs + 100, gap = 50) {
    let captured: number | null = null
    for (let at = startMs; at <= startMs + ms; at += gap) {
      const r = t.update(center(sector), at)
      if (r.capture !== null) captured = r.capture
    }
    return captured
  }

  it('한 방향에 잠깐 머물면 그 방향을 한 번만 찍는다', () => {
    const t = new AngleScanTracker()
    expect(dwell(t, 0, 1000)).toBe(0)
    expect(t.doneCount).toBe(1)
    expect(dwell(t, 0, 3000)).toBeNull() // 같은 방향에서 계속 있어도 다시 찍지 않음
    expect(t.doneCount).toBe(1)
  })

  it('스치듯 지나가면(머문 시간이 짧으면) 찍지 않는다', () => {
    const t = new AngleScanTracker()
    expect(dwell(t, 3, 1000, ANGLE_SCAN.holdMs - 150)).toBeNull()
    expect(t.doneCount).toBe(0)
  })

  it('찍고 나면 "조금 더 돌아 주세요", 새 방향에 들어서면 "멈춰 주세요"를 안내한다', () => {
    const t = new AngleScanTracker()
    expect(t.hint).toBe('hold')
    dwell(t, 0, 1000)
    expect(t.hint).toBe('turn-more')
    t.update(center(1), 2000) // 다음 구간에 막 들어섬
    expect(t.hint).toBe('hold')
  })

  it('필요한 방향 수를 채우면 완료이고, 안내도 완료로 바뀐다', () => {
    const t = new AngleScanTracker()
    let at = 1000
    for (let i = 0; i < ANGLE_SCAN.minDone; i++) {
      dwell(t, i, at)
      at += 1000
    }
    expect(t.complete).toBe(true)
    expect(t.hint).toBe('complete')
  })

  it('방향 값이 0~360 밖이어도(음수, 360 이상) 같은 구간으로 계산한다', () => {
    const t = new AngleScanTracker()
    let captured: number | null = null
    for (let at = 1000; at <= 1000 + ANGLE_SCAN.holdMs + 100; at += 50) {
      const r = t.update(-step / 2, at) // -15도 = 345도 = 마지막 구간
      if (r.capture !== null) captured = r.capture
    }
    expect(captured).toBe(ANGLE_SCAN.sectors - 1)
  })

  it('이미 찍은 방향의 각도(angleOf)는 구간 가운데 각도다', () => {
    expect(AngleScanTracker.angleOf(0)).toBe(step / 2)
    expect(AngleScanTracker.angleOf(3)).toBe(3 * step + step / 2)
  })
})

describe('방 360도: 금지 물체는 막지 않고 경고만 남긴다', () => {
  it('사람·휴대폰·책·화면이 잡혀도 통과를 막지 않고, 감독관이 확인한다는 안내를 낸다', () => {
    for (const found of [{ person: 2 }, { 'cell phone': 3 }, { book: 1 }, { tv: 1 }, { person: 1, 'cell phone': 1, book: 1, laptop: 2 }]) {
      const v = scanVerdict(found, 'room')
      expect(v.status).toBe('warn')
      expect(v.detail.includes('감독관')).toBe(true)
    }
  })

  it('어떤 물체가 몇 번 잡혔는지는 그대로 알려 준다', () => {
    const v = scanVerdict({ person: 2, 'cell phone': 1 }, 'room')
    expect(v.detail.includes('다른 사람 2회')).toBe(true)
    expect(v.detail.includes('휴대폰 1회')).toBe(true)
  })

  it('책상 위는 예전처럼 휴대폰·책이 잡히면 실패다', () => {
    expect(scanVerdict({ 'cell phone': 1 }, 'desk').status).toBe('fail')
    expect(scanVerdict({ book: 1 }, 'desk').status).toBe('fail')
  })
})
