// 시험 전 환경 점검 판정 (순수 함수 — 단위 테스트 대상)
import type { Box } from '../core/phoneRules.ts'

export type CheckStatus = 'pending' | 'running' | 'pass' | 'warn' | 'fail'

export interface CheckItem {
  id: string
  label: string
  status: CheckStatus
  detail: string
}

export interface Verdict {
  status: 'pass' | 'warn' | 'fail'
  detail: string
}

export interface CheckReport {
  items: CheckItem[]
  /** fail 항목이 없으면 통과 */
  passed: boolean
  ts: number
}

/** 점검 항목 하나만 바꾼 새 목록 */
export function updateItem(items: CheckItem[], id: string, patch: Partial<CheckItem>): CheckItem[] {
  return items.map((i) => (i.id === id ? { ...i, ...patch } : i))
}

export function makeReport(items: CheckItem[]): CheckReport {
  return { items, passed: !items.some((i) => i.status === 'fail'), ts: Date.now() }
}

// ── 밝기 ────────────────────────────────────────────────

export interface LumaStats {
  mean: number
  /** 거의 하얗게 날아간 픽셀 비율 */
  brightRatio: number
  /** 거의 검은 픽셀 비율 */
  darkRatio: number
}

/** RGBA 픽셀 배열의 밝기 통계. region은 0~1 정규화 박스 */
export function lumaStats(data: Uint8ClampedArray, w: number, h: number, region?: Box): LumaStats {
  const x0 = region ? Math.max(0, Math.floor(region.x * w)) : 0
  const y0 = region ? Math.max(0, Math.floor(region.y * h)) : 0
  const x1 = region ? Math.min(w, Math.ceil((region.x + region.w) * w)) : w
  const y1 = region ? Math.min(h, Math.ceil((region.y + region.h) * h)) : h
  let sum = 0
  let bright = 0
  let dark = 0
  let n = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4
      const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      sum += l
      if (l > 245) bright++
      if (l < 25) dark++
      n++
    }
  }
  if (n === 0) return { mean: 0, brightRatio: 0, darkRatio: 0 }
  return { mean: sum / n, brightRatio: bright / n, darkRatio: dark / n }
}

export const LIGHTING = { darkMean: 55, dimMean: 80, faceBacklitRatio: 0.6, overexposed: 0.3 }

/** 어두우면 얼굴·손·물체 인식이 모두 떨어지므로 시작 전에 막는다 */
export function lightingVerdict(frame: LumaStats, face?: LumaStats): Verdict {
  if (frame.mean < LIGHTING.darkMean) return { status: 'fail', detail: `너무 어둡습니다 (밝기 ${frame.mean.toFixed(0)}). 조명을 켜 주세요.` }
  if (face && face.mean < frame.mean * LIGHTING.faceBacklitRatio) {
    return { status: 'fail', detail: '역광입니다. 창문·조명을 등지지 말고 얼굴 앞쪽을 밝혀 주세요.' }
  }
  if (frame.brightRatio > LIGHTING.overexposed) return { status: 'warn', detail: '화면 일부가 하얗게 날아갑니다. 강한 조명을 피해 주세요.' }
  if (frame.mean < LIGHTING.dimMean) return { status: 'warn', detail: `조금 어둡습니다 (밝기 ${frame.mean.toFixed(0)}). 감지 정확도가 떨어질 수 있습니다.` }
  return { status: 'pass', detail: `밝기 ${frame.mean.toFixed(0)}` }
}

// ── 장치·환경 문자열 판정 ────────────────────────────────

/** 가짜 영상을 넣을 수 있는 가상 카메라·폰 웹캠 앱 */
export const VIRTUAL_CAMERA = [
  /virtual/i, /\bobs\b/i, /manycam/i, /xsplit/i, /snap camera/i, /droidcam/i, /epoccam/i,
  /iriun/i, /\bcamo\b/i, /\bndi\b/i, /vcam/i, /splitcam/i, /youcam/i, /mmhmm/i, /camtwist/i,
]

export function cameraVerdict(label: string): Verdict {
  if (!label) return { status: 'warn', detail: '카메라 이름을 확인할 수 없습니다.' }
  if (VIRTUAL_CAMERA.some((p) => p.test(label))) {
    return { status: 'fail', detail: `가상 카메라로 보입니다 (${label}). 노트북 내장 카메라나 실제 웹캠을 선택해 주세요.` }
  }
  return { status: 'pass', detail: label }
}

/** 원격 데스크톱·가상 머신에서 흔한 소프트웨어 렌더러 (약한 신호라 경고만 한다) */
export const SOFTWARE_RENDERER = [
  /basic render/i, /swiftshader/i, /llvmpipe/i, /software/i, /vmware/i, /virtualbox/i,
  /parallels/i, /hyper-v/i, /citrix/i, /remote/i, /microsoft basic/i,
]

export function rendererVerdict(renderer: string | null): Verdict {
  if (!renderer) return { status: 'warn', detail: '그래픽 정보를 확인할 수 없습니다.' }
  if (SOFTWARE_RENDERER.some((p) => p.test(renderer))) {
    return { status: 'warn', detail: `원격 접속·가상 머신 환경으로 의심됩니다 (${renderer}).` }
  }
  return { status: 'pass', detail: renderer }
}

export const EARBUD = [
  /airpods/i, /\bbuds\b/i, /galaxy buds/i, /bluetooth/i, /headset/i, /headphone/i, /hands-free/i,
  /handsfree/i, /earphone/i, /earbud/i, /wh-1000/i, /wf-1000/i, /bose/i, /beats/i, /jabra/i,
  /헤드셋/, /이어폰/, /헤드폰/, /블루투스/,
]

/** PC에 연결된 오디오 장치 이름으로 이어폰·헤드셋을 잡는다 (마이크 권한이 있어야 이름이 보임) */
export function audioVerdict(labels: string[] | null): Verdict {
  if (labels === null) return { status: 'warn', detail: '마이크 권한이 없어 이어폰 연결을 확인하지 못했습니다.' }
  const found = [...new Set(labels.filter((l) => EARBUD.some((p) => p.test(l))))]
  if (found.length) return { status: 'fail', detail: `이어폰·헤드셋이 연결되어 있습니다: ${found.join(', ')}. 연결을 끊어 주세요.` }
  return { status: 'pass', detail: labels.length ? `${labels.length}개 장치, 이어폰 없음` : '오디오 장치 없음' }
}

export function screensVerdict(count: number | null, isExtended: boolean | undefined): Verdict {
  if (count !== null) {
    return count > 1
      ? { status: 'fail', detail: `모니터 ${count}대가 연결되어 있습니다. 보조 모니터를 분리해 주세요.` }
      : { status: 'pass', detail: '모니터 1대' }
  }
  if (isExtended === true) return { status: 'fail', detail: '확장 모니터가 연결되어 있습니다. 분리해 주세요.' }
  if (isExtended === false) return { status: 'pass', detail: '확장 모니터 없음 (복제 연결은 휴대폰 스캔으로 확인)' }
  return { status: 'warn', detail: '이 브라우저는 모니터 확인을 지원하지 않습니다. Chrome·Edge를 써 주세요.' }
}

// ── 얼굴 배치 ────────────────────────────────────────────

export interface FacePlacementInput {
  faceCount: number
  /** 얼굴 박스 (0~1) */
  box?: Box
  shouldersVisible: boolean
}

export function placementVerdict(f: FacePlacementInput): Verdict {
  if (f.faceCount === 0) return { status: 'fail', detail: '얼굴이 보이지 않습니다.' }
  if (f.faceCount > 1) return { status: 'fail', detail: `얼굴이 ${f.faceCount}개 보입니다. 혼자 있는 상태에서 진행해 주세요.` }
  const b = f.box!
  if (b.w < 0.15) return { status: 'fail', detail: '카메라에서 너무 멉니다. 조금 가까이 앉아 주세요.' }
  if (b.w > 0.6) return { status: 'fail', detail: '카메라에 너무 가깝습니다. 조금 뒤로 앉아 주세요.' }
  const cx = b.x + b.w / 2
  const cy = b.y + b.h / 2
  if (cx < 0.25 || cx > 0.75 || cy < 0.15 || cy > 0.7) return { status: 'fail', detail: '얼굴이 화면 가운데에 오도록 카메라를 맞춰 주세요.' }
  if (!f.shouldersVisible) return { status: 'warn', detail: '어깨가 잘 보이지 않습니다. 몸통 감지가 약해질 수 있습니다.' }
  return { status: 'pass', detail: '정상' }
}

// ── 책상 스캔 ────────────────────────────────────────────

/** 축소한 흑백 프레임 두 장의 평균 차이 (0~1). 새 장면인지 판단해 키프레임을 고른다 */
export function frameDifference(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length || a.length === 0) return 1
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i])
  return sum / a.length / 255
}

/** 작은 물체를 놓치지 않도록: 전체 프레임 + 겹치는 2x2 타일 (원본 픽셀 좌표) */
export function tileRects(w: number, h: number, overlap = 0.15): { x: number; y: number; w: number; h: number }[] {
  const tw = Math.round(w * (0.5 + overlap))
  const th = Math.round(h * (0.5 + overlap))
  const rects = [{ x: 0, y: 0, w, h }]
  for (const x of [0, w - tw]) for (const y of [0, h - th]) rects.push({ x, y, w: tw, h: th })
  return rects
}

/** 책상 스캔에서 알려 줄 물체 (모델 라벨 → 표시 이름) */
const DESK_LABELS: Record<string, string> = { 'cell phone': '휴대폰', book: '책', laptop: '화면(노트북)', tv: '화면(모니터)' }

/**
 * 책상 스캔 결과 요약. **불통과로 막지 않는다** (감지돼도 경고(warn)만 하고 응시는 계속된다).
 * 무엇이 몇 번 잡혔는지 응시자에게 경고로 알리고, 사진과 함께 감독관에게 전달한다. 판단은 감독관이 한다.
 * 책상에서는 응시자 본인의 손·팔이 사람으로 잡혀 오탐이 나므로 사람은 세지 않는다.
 */
export function deskDetection(found: Record<string, number>): Verdict {
  const parts = Object.entries(DESK_LABELS)
    .filter(([label]) => (found[label] ?? 0) > 0)
    .map(([label, name]) => `${name} ${found[label]}회`)
  if (parts.length === 0) return { status: 'pass', detail: '감지된 물체 없음. 사진은 감독관에게 전달됩니다.' }
  return { status: 'warn', detail: `책상 위에서 ${parts.join(', ')}이(가) 감지되었습니다. 시험에 필요 없는 물건은 치워 주세요. 사진과 함께 감독관에게 전달됩니다 (판단은 감독관이 합니다).` }
}

/**
 * 귀 확인에서 "고개를 한쪽으로 끝까지 돌렸다"를 알아내는 기준.
 * deg: 이 각도(절댓값) 이상이면 돌린 것, holdMs: 이만큼 유지하면 확정,
 * minStrongMs: 얼굴을 놓친 경우에도 인정하려면 먼저 이만큼은 돌려 보여야 함, lostGraceMs: 돌리다 얼굴을 놓친 뒤 인정해 주는 시간
 */
export const HEAD_TURN = { deg: 35, holdMs: 300, minStrongMs: 100, lostGraceMs: 700 }

/**
 * 고개를 돌린 방향을 판정한다. 얼굴 모델은 고개를 거의 옆모습까지 돌리면 얼굴을 놓쳐서 각도가 사라진다.
 * 그래서 "기준 각도 이상으로 돌리다가 곧바로 얼굴이 사라진" 경우도 돌린 것으로 인정한다
 * (옆모습을 보여 준 것이고, 귀 사진은 그 순간 찍는다).
 * 이미 확인한 쪽(avoidSign)은 인정하지 않는다. 프레임마다 update 를 부르고, 0 이 아닌 값(+1/-1)이 나오면 확정이다.
 */
export class HeadTurnTracker {
  private heldSince: number | null = null
  private lastStrongAt: number | null = null
  private sign = 0
  private readonly avoidSign: number
  private readonly cfg: typeof HEAD_TURN

  constructor(avoidSign: number, cfg: typeof HEAD_TURN = HEAD_TURN) {
    this.avoidSign = avoidSign
    this.cfg = cfg
  }

  update(yaw: number | undefined, faceCount: number, now: number): number {
    const strong = yaw !== undefined && Math.abs(yaw) >= this.cfg.deg && Math.sign(yaw) !== this.avoidSign
    if (strong) {
      this.heldSince ??= now
      this.lastStrongAt = now
      this.sign = Math.sign(yaw)
      return now - this.heldSince >= this.cfg.holdMs ? this.sign : 0
    }
    if (faceCount === 0 && this.heldSince !== null && this.lastStrongAt !== null) {
      const turnedLongEnough = this.lastStrongAt - this.heldSince >= this.cfg.minStrongMs
      return turnedLongEnough && now - this.lastStrongAt <= this.cfg.lostGraceMs ? this.sign : 0
    }
    // 얼굴은 보이는데 기준 각도에 못 미침(정면으로 돌아옴 등): 처음부터 다시
    this.heldSince = null
    this.lastStrongAt = null
    return 0
  }
}
