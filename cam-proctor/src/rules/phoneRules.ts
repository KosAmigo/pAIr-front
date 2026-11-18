// 보조 캠(핸드폰): 측면·후면에서 손·팔 움직임과 주변 기기·화면을 본다.
import type { RuleSpec } from './RuleEngine'
import { median, nearestDist, type Point } from './stats'

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface DetectedObject {
  label: string
  score: number
  /** 박스 안이 주변보다 확실히 밝으면 켜진 화면으로 본다 */
  bright: boolean
  box?: Box
}

function iou(a: Box, b: Box): number {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
  const inter = ix * iy
  const union = a.w * a.h + b.w * b.h - inter
  return union > 0 ? inter / union : 0
}

/** 한 화면 안쪽 박스까지 포함해 같은 물체가 여러 번 잡히는 걸 합친다 (점수 높은 것 우선) */
export function dedupeObjects(objs: DetectedObject[], overlap = 0.3): DetectedObject[] {
  const screen = (l: string) => SCREEN_LABELS.includes(l)
  const kept: DetectedObject[] = []
  for (const o of [...objs].sort((a, b) => b.score - a.score)) {
    const dup = kept.some((k) => {
      if (!o.box || !k.box) return false
      const sameKind = k.label === o.label || (screen(k.label) && screen(o.label))
      if (!sameKind) return false
      // 큰 박스 안에 작은 박스가 거의 다 들어간 경우도 같은 물체로 본다
      const small = o.box.w * o.box.h <= k.box.w * k.box.h ? o.box : k.box
      const ix = Math.max(0, Math.min(o.box.x + o.box.w, k.box.x + k.box.w) - Math.max(o.box.x, k.box.x))
      const iy = Math.max(0, Math.min(o.box.y + o.box.h, k.box.y + k.box.h) - Math.max(o.box.y, k.box.y))
      const contained = small.w * small.h > 0 ? (ix * iy) / (small.w * small.h) : 0
      return iou(o.box, k.box) > overlap || contained > 0.7
    })
    if (!dup) kept.push(o)
  }
  return kept
}

export interface PhoneFeatures {
  /** 손 중심 좌표 (0~1) */
  hands: Point[]
  /** 손목 좌표 (포즈 기준, 0~1) */
  wrists: Point[]
  objects: DetectedObject[]
}

export interface PhoneBaseline {
  hands: Point[]
  handCount: number
  wrists: Point[]
  /** 시험용 노트북처럼 처음부터 보이는 화면 수 */
  screenCount: number
}

export const SCREEN_LABELS = ['laptop', 'tv']
export const OBJECT_LABELS = ['cell phone', 'laptop', 'tv', 'book']

export const PHONE_THRESHOLDS = {
  handMove: 0.22,
  armMove: 0.3,
  objectScore: 0.45,
}
export type PhoneThresholds = typeof PHONE_THRESHOLDS

export const PHONE_RULES: RuleSpec[] = [
  { kind: 'hand_missing', message: '손이 키보드에서 벗어났습니다', durationMs: 3000, cooldownMs: 8000, graceMs: 600 },
  { kind: 'hand_moved', message: '손이 평소 위치에서 크게 벗어났습니다', durationMs: 2000, cooldownMs: 8000 },
  { kind: 'arm_move', message: '팔을 크게 움직였습니다', durationMs: 1500, cooldownMs: 8000 },
  { kind: 'phone_detected', message: '휴대폰이 감지되었습니다', durationMs: 1000, cooldownMs: 10000, graceMs: 800 },
  { kind: 'extra_screen', message: '다른 화면(모니터·노트북)이 감지되었습니다', durationMs: 1500, cooldownMs: 10000, graceMs: 800 },
  { kind: 'book_detected', message: '책·자료가 감지되었습니다', durationMs: 1500, cooldownMs: 10000, graceMs: 800 },
]

export function phoneConditions(
  f: PhoneFeatures,
  b: PhoneBaseline,
  t: PhoneThresholds = PHONE_THRESHOLDS,
): Record<string, boolean> {
  const objs = dedupeObjects(f.objects.filter((o) => o.score >= t.objectScore))
  const screens = objs.filter((o) => SCREEN_LABELS.includes(o.label)).length
  return {
    hand_missing: b.handCount > 0 && f.hands.length < b.handCount,
    hand_moved: b.hands.length > 0 && f.hands.some((h) => nearestDist(h, b.hands) > t.handMove),
    arm_move: b.wrists.length > 0 && f.wrists.some((w) => nearestDist(w, b.wrists) > t.armMove),
    phone_detected: objs.some((o) => o.label === 'cell phone'),
    extra_screen: screens > b.screenCount,
    book_detected: objs.some((o) => o.label === 'book'),
  }
}

/**
 * 손 위치 기준점: 보정 샘플 중 손 개수가 가장 흔한 값의 샘플만 모아
 * 왼쪽→오른쪽 순으로 정렬한 뒤 위치별 중앙값을 낸다.
 */
function baselinePoints(sets: Point[][]): { count: number; points: Point[] } {
  if (sets.length === 0) return { count: 0, points: [] }
  const freq = new Map<number, number>()
  for (const s of sets) freq.set(s.length, (freq.get(s.length) ?? 0) + 1)
  const count = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0]
  if (count === 0) return { count: 0, points: [] }
  const chosen = sets.filter((s) => s.length === count).map((s) => [...s].sort((a, b) => a.x - b.x))
  const points: Point[] = []
  for (let i = 0; i < count; i++) {
    points.push({ x: median(chosen.map((s) => s[i].x)), y: median(chosen.map((s) => s[i].y)) })
  }
  return { count, points }
}

export function buildPhoneBaseline(samples: PhoneFeatures[], t: PhoneThresholds = PHONE_THRESHOLDS): PhoneBaseline {
  const hands = baselinePoints(samples.map((s) => s.hands))
  const wrists = baselinePoints(samples.map((s) => s.wrists))
  const screenCounts = samples.map(
    (s) =>
      dedupeObjects(s.objects.filter((o) => o.score >= t.objectScore)).filter((o) => SCREEN_LABELS.includes(o.label))
        .length,
  )
  return {
    hands: hands.points,
    handCount: hands.count,
    wrists: wrists.points,
    screenCount: Math.round(median(screenCounts.length ? screenCounts : [0])),
  }
}
