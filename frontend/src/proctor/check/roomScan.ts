// 방 360도 스캔의 순수 계산 (칸 나누기·각도 래핑·촬영 조건·수동 모드 전환·결과 문장).
// 화면·센서·카메라는 react/RoomScanDevPage.tsx 가 맡고, 여기는 값만 받아 판정한다 (단위 시험 대상).
// 절대 방위 대신 "시작 시점의 alpha 를 0 으로 둔 상대 각도"를 쓴다. 나침반·자기장 보정이 필요 없다.

export const H_SLOTS = 12
export const H_STEP_DEG = 30
/** 칸 중심 ±이 각도 안에 들어오면 촬영 후보 */
export const H_TOLERANCE_DEG = 10
/** 세로 5단계의 목표 beta (0=휴대폰이 눕고 카메라가 바닥, 90=세움, 180=카메라가 천장). 현장에서 조정한다 */
export const V_TARGETS_DEG = [15, 45, 80, 115, 150] as const
export const V_TOLERANCE_DEG = 10
export const V_LABELS = ['바닥', '바닥과 책상 사이', '정면', '벽 위쪽', '천장'] as const

export type CaptureConfig = {
  /** 회전 속도 상한 (도/초) */
  maxRotationDegPerSec: number
  /** 선명도 하한 (라플라시안 분산) */
  minSharpness: number
  /** 밝기 하한 (0~255 평균 밝기) */
  minBrightness: number
}
export const DEFAULT_CAPTURE: CaptureConfig = { maxRotationDegPerSec: 25, minSharpness: 30, minBrightness: 50 }

/** 센서 값이 이 시간 동안 안 오면 수동 모드로 간다 */
export const SENSOR_TIMEOUT_MS = 2000

export const PHOTO_MAX_SIDE = 960
export const PHOTO_MAX_BYTES = 400 * 1024

// ---------- 각도 ----------

/** 어떤 각도든 [0, 360) 로 만든다 */
export function wrapAngle(deg: number): number {
  return ((deg % 360) + 360) % 360
}

/** a 에서 b 까지 가장 짧은 부호 있는 차이 (-180, 180]. 0/360 경계를 넘어도 작게 나온다 */
export function angleDiff(a: number, b: number): number {
  const d = wrapAngle(b - a)
  return d > 180 ? d - 360 : d
}

/** 시작 alpha 를 0 으로 둔 상대 각도 [0, 360) */
export function relativeAngle(alpha: number, startAlpha: number): number {
  return wrapAngle(alpha - startAlpha)
}

// ---------- 칸 ----------

export function hSlotName(i: number): string {
  return `h${String(i).padStart(2, '0')}`
}
export function vSlotName(i: number): string {
  return `v${i}`
}
export const H_NAMES: string[] = Array.from({ length: H_SLOTS }, (_, i) => hSlotName(i))
export const V_NAMES: string[] = V_TARGETS_DEG.map((_, i) => vSlotName(i))

/** 칸 i 의 중심 각도. 칸 0 이 시작 방향이다 */
export function hSlotCenter(i: number): number {
  return i * H_STEP_DEG
}

/** 상대 각도가 가장 가까운 칸과, 그 칸 중심에서 벗어난 정도(부호 있음) */
export function nearestHSlot(rel: number): { index: number; offset: number } {
  const index = Math.round(wrapAngle(rel) / H_STEP_DEG) % H_SLOTS
  return { index, offset: angleDiff(hSlotCenter(index), rel) }
}

export function nearestVSlot(beta: number): { index: number; offset: number } {
  let best = 0
  for (let i = 1; i < V_TARGETS_DEG.length; i++) {
    if (Math.abs(beta - V_TARGETS_DEG[i]) < Math.abs(beta - V_TARGETS_DEG[best])) best = i
  }
  return { index: best, offset: beta - V_TARGETS_DEG[best] }
}

// ---------- 촬영 조건 ----------

export type Hint = 'fast' | 'blur' | 'dark'
export const HINT_TEXT: Record<Hint, string> = {
  fast: '너무 빨라요. 천천히 돌려 주세요',
  blur: '흐려요. 잠깐 멈춰 주세요',
  dark: '어두워요. 불을 켜 주세요',
}

/** devicemotion rotationRate 세 축의 합성 속도 (도/초) */
export function rotationSpeed(rr: { alpha?: number | null; beta?: number | null; gamma?: number | null } | null | undefined): number {
  if (!rr) return 0
  const a = rr.alpha ?? 0
  const b = rr.beta ?? 0
  const g = rr.gamma ?? 0
  return Math.sqrt(a * a + b * b + g * g)
}

export type FrameQuality = { speed: number; sharpness: number | null; brightness: number | null }

/** 속도 → 선명도 → 밝기 순으로 본다. 통과하면 null. 선명도·밝기는 아직 안 쟀으면(null) 건너뛴다 */
export function captureHint(q: FrameQuality, cfg: CaptureConfig = DEFAULT_CAPTURE): Hint | null {
  if (q.speed > cfg.maxRotationDegPerSec) return 'fast'
  if (q.brightness !== null && q.brightness < cfg.minBrightness) return 'dark'
  if (q.sharpness !== null && q.sharpness < cfg.minSharpness) return 'blur'
  return null
}

/** 8비트 회색 이미지의 라플라시안(4방향) 분산. 클수록 선명하다 */
export function laplacianVariance(gray: ArrayLike<number>, w: number, h: number): number {
  if (w < 3 || h < 3) return 0
  let sum = 0
  let sumSq = 0
  let n = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const v = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w]
      sum += v
      sumSq += v * v
      n++
    }
  }
  const mean = sum / n
  return sumSq / n - mean * mean
}

/** RGBA 픽셀 → 회색(0~255) */
export function toGrayscale(rgba: ArrayLike<number>, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h)
  for (let i = 0; i < w * h; i++) {
    out[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]
  }
  return out
}

export function meanBrightness(gray: ArrayLike<number>): number {
  if (gray.length === 0) return 0
  let s = 0
  for (let i = 0; i < gray.length; i++) s += gray[i]
  return s / gray.length
}

/** 긴 변이 max 이하가 되게 줄인 크기 (작으면 그대로) */
export function fitSize(w: number, h: number, max = PHOTO_MAX_SIDE): { w: number; h: number } {
  const long = Math.max(w, h)
  if (long <= max) return { w, h }
  const r = max / long
  return { w: Math.round(w * r), h: Math.round(h * r) }
}

// ---------- 촬영 후보 고르기 ----------

export type PickInput = {
  /** 이미 찍은 칸. 다시 찍기면 그 칸만 false 로 두면 된다 */
  filled: readonly boolean[]
  quality: FrameQuality
  cfg?: CaptureConfig
}
export type Pick = {
  /** 지금 찍을 칸 (없으면 null) */
  slot: number | null
  /** 칸 안에 들어왔지만 조건이 안 맞을 때의 안내 */
  hint: Hint | null
  /** 지금 가장 가까운 칸과 중심에서 벗어난 정도 (화면 표시용) */
  nearest: { index: number; offset: number }
  /** 가장 가까운 칸이 아직 비어 있고 ±허용 각도 안이다 */
  inWindow: boolean
}

function pick(nearest: { index: number; offset: number }, tol: number, input: PickInput): Pick {
  const inWindow = !input.filled[nearest.index] && Math.abs(nearest.offset) <= tol
  if (!inWindow) return { slot: null, hint: null, nearest, inWindow }
  const hint = captureHint(input.quality, input.cfg)
  return { slot: hint ? null : nearest.index, hint, nearest, inWindow }
}

/** 가로 스캔: 상대 각도로 지금 찍을 칸을 고른다 */
export function pickHorizontal(rel: number, input: PickInput): Pick {
  return pick(nearestHSlot(rel), H_TOLERANCE_DEG, input)
}

/** 세로 스캔: beta 로 지금 찍을 칸을 고른다 */
export function pickVertical(beta: number, input: PickInput): Pick {
  return pick(nearestVSlot(beta), V_TOLERANCE_DEG, input)
}

// ---------- 수동 모드 ----------

export const MANUAL_SLOTS = [
  { name: 'm_front', prompt: '정면(책상 쪽)을 화면에 담고 찍어 주세요' },
  { name: 'm_left', prompt: '왼쪽 벽 쪽을 화면에 담고 찍어 주세요' },
  { name: 'm_back', prompt: '뒤쪽을 화면에 담고 찍어 주세요' },
  { name: 'm_right', prompt: '오른쪽 벽 쪽을 화면에 담고 찍어 주세요' },
  { name: 'm_floor', prompt: '바닥과 책상 아래를 찍어 주세요' },
  { name: 'm_ceiling', prompt: '천장을 찍어 주세요' },
] as const
export const MANUAL_NAMES: string[] = MANUAL_SLOTS.map((s) => s.name)

export type SensorPermission = 'unknown' | 'granted' | 'denied' | 'unsupported'
export type ScanMode = 'sensor' | 'manual' | 'waiting'

/**
 * 센서 모드로 갈지 수동 모드로 갈지 정한다.
 * - 권한 거부·미지원 → 바로 수동
 * - 권한 허용 후 첫 값(또는 마지막 값)이 SENSOR_TIMEOUT_MS 안에 안 오면 수동
 * - 값이 오고 있으면 센서
 */
export function decideScanMode(input: {
  permission: SensorPermission
  /** 시작 버튼을 누른 뒤 지난 시간 */
  sinceStartMs: number
  /** 마지막 센서 값이 온 뒤 지난 시간 (한 번도 안 왔으면 null) */
  sinceLastSampleMs: number | null
}): ScanMode {
  if (input.permission === 'denied' || input.permission === 'unsupported') return 'manual'
  if (input.permission === 'unknown') return 'waiting'
  if (input.sinceLastSampleMs === null) return input.sinceStartMs >= SENSOR_TIMEOUT_MS ? 'manual' : 'waiting'
  return input.sinceLastSampleMs >= SENSOR_TIMEOUT_MS ? 'manual' : 'sensor'
}

export function slotNames(mode: ScanMode): string[] {
  return mode === 'manual' ? MANUAL_NAMES : [...H_NAMES, ...V_NAMES]
}

/** 모든 칸이 채워졌는가 (분석 버튼 조건) */
export function allFilled(names: readonly string[], photos: Readonly<Record<string, unknown>>): boolean {
  return names.length > 0 && names.every((n) => photos[n] !== undefined)
}

// ---------- JPEG 용량 ----------

/** 400KB 를 넘으면 다음에 시도할 JPEG 품질. 더 줄일 수 없으면 null */
export function nextJpegQuality(quality: number, bytes: number, maxBytes = PHOTO_MAX_BYTES): number | null {
  if (bytes <= maxBytes) return null
  const next = Math.round((quality - 0.1) * 100) / 100
  return next >= 0.3 ? next : null
}

// ---------- 분석 결과 ----------

export type ScanObject = { label: string; score: number; box: [number, number, number, number] }
export type ScanItem = {
  name: string
  persons: number
  phones: number
  monitors: number
  laptops: number
  books: number
  tablets: number
  objects: ScanObject[]
}
export type ReasonCode = 'MULTI_PERSON' | 'PHONE' | 'MULTI_MONITOR' | 'BOOK' | 'TABLET'
export type ScanResponse = {
  items: ScanItem[]
  summary?: Record<string, unknown>
  verdict: { status: 'PASS' | 'WARN'; reasons: { code: ReasonCode; names: string[] }[] }
  ms?: number
}

export const REASON_TEXT: Record<ReasonCode, string> = {
  MULTI_PERSON: '다른 사람이 보여요. 방에 혼자 있어 주세요',
  PHONE: '휴대폰이 보여요. 치우고 다시 찍어 주세요',
  MULTI_MONITOR: '모니터가 여러 대 보여요. 쓰지 않는 화면은 꺼 주세요',
  BOOK: '책이 보여요. 치우고 다시 찍어 주세요',
  TABLET: '태블릿이 보여요. 치우고 다시 찍어 주세요',
}
export function reasonText(code: string): string {
  return REASON_TEXT[code as ReasonCode] ?? '확인이 필요한 물체가 보여요. 다시 찍어 주세요'
}

/** 응답의 box 는 0~1 비율이거나 픽셀일 수 있어 둘 다 받는다. 이미지 크기 기준 0~1 비율로 바꾼다 */
export function normalizeBox(box: readonly number[], imgW: number, imgH: number): [number, number, number, number] {
  const [x0, y0, x1, y1] = box
  const ratio = Math.max(x0, y0, x1, y1) <= 1.5
  return ratio ? [x0, y0, x1, y1] : [x0 / imgW, y0 / imgH, x1 / imgW, y1 / imgH]
}

/** 칸 이름이 사람이 읽기 쉬운 이름으로 */
export function slotLabel(name: string): string {
  const h = /^h(\d+)$/.exec(name)
  if (h) return `가로 ${Number(h[1]) * H_STEP_DEG}°`
  const v = /^v(\d)$/.exec(name)
  if (v) return `세로 ${V_LABELS[Number(v[1])] ?? name}`
  return MANUAL_SLOTS.find((s) => s.name === name)?.prompt.replace(/ 찍어 주세요$/, '') ?? name
}
