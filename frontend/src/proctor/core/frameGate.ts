// 휴대폰이 프레임을 보낼지 정하는 변화 감지 (순수 계산).
// 64×48 흑백 프레임을 마지막으로 "보낸" 화면과 비교한다. 평균 변화량만 보면 작은 물체(이어폰·메모지)가 평균에 묻히므로
// 격자 블록별 변화량의 최댓값도 함께 본다. 둘 중 하나라도 임계값을 넘으면 보낸다.

export type GateConfig = {
  /** 프레임 전체 평균 변화량(0~1) 임계값. Worker_분리_설계.md 13장 실측에서 정지 상태 잡음이 1.4~2.4% 라서 0.04 근처 */
  meanThreshold: number
  /** 격자 블록 하나의 평균 변화량(0~1) 임계값. 잠정값: 측정 전이다 (tools/lowspec-bench/phone-jpeg.html 로 재서 정한다) */
  blockThreshold: number
  /** 이 시간 동안 안 보냈으면 변화가 없어도 한 장 보낸다 (생존 확인) */
  keepAliveMs: number
  /** 연속 전송 최소 간격. 서버 상한은 휴대폰 1대 초당 5장이라 그 안에서 여유를 둔다 */
  minIntervalMs: number
}

export const GATE_DEFAULTS: GateConfig = { meanThreshold: 0.04, blockThreshold: 0.12, keepAliveMs: 5000, minIntervalMs: 250 }

/** 격자: 64×48 을 8×6 블록으로 나눈다 */
const GRID_X = 8
const GRID_Y = 6

export type LumaDiff = { mean: number; maxBlock: number }

/** 두 흑백 프레임의 변화량. 모두 0~1 (픽셀 차이 / 255) */
export function lumaDiff(prev: Uint8Array, cur: Uint8Array, w: number, h: number): LumaDiff {
  const bw = Math.max(1, Math.floor(w / GRID_X))
  const bh = Math.max(1, Math.floor(h / GRID_Y))
  const sums = new Float64Array(GRID_X * GRID_Y)
  const counts = new Float64Array(GRID_X * GRID_Y)
  let total = 0
  for (let y = 0; y < h; y++) {
    const by = Math.min(GRID_Y - 1, Math.floor(y / bh))
    for (let x = 0; x < w; x++) {
      const d = Math.abs(cur[y * w + x] - prev[y * w + x])
      total += d
      const b = by * GRID_X + Math.min(GRID_X - 1, Math.floor(x / bw))
      sums[b] += d
      counts[b]++
    }
  }
  let maxBlock = 0
  for (let i = 0; i < sums.length; i++) if (counts[i] > 0) maxBlock = Math.max(maxBlock, sums[i] / counts[i] / 255)
  return { mean: total / (w * h) / 255, maxBlock }
}

export class ChangeGate {
  private last: Uint8Array | null = null
  private lastSentAt = Number.NEGATIVE_INFINITY
  private readonly cfg: GateConfig

  constructor(cfg: GateConfig = GATE_DEFAULTS) {
    this.cfg = cfg
  }

  /** 이 프레임을 보내야 하면 true (보낸 것으로 기록한다). now: ms */
  decide(luma: Uint8Array, w: number, h: number, now: number): boolean {
    if (this.last === null) return this.mark(luma, now)
    if (now - this.lastSentAt < this.cfg.minIntervalMs) return false
    if (now - this.lastSentAt >= this.cfg.keepAliveMs) return this.mark(luma, now)
    const d = lumaDiff(this.last, luma, w, h)
    if (d.mean >= this.cfg.meanThreshold || d.maxBlock >= this.cfg.blockThreshold) return this.mark(luma, now)
    return false
  }

  /** 마지막으로 보낸 화면을 비운다 (화질·해상도를 바꿔 다시 시작할 때) */
  reset(): void {
    this.last = null
  }

  private mark(luma: Uint8Array, now: number): true {
    this.last = luma.slice()
    this.lastSentAt = now
    return true
  }
}
