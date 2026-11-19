// 노트북 정면 캠: 얼굴 수, 고개 방향, 시선, 몸통 위치로 이상 여부를 판정한다.
// 모든 값은 시작 시 보정(calibration)한 "정면 자세" 기준의 차이로 비교한다.
import type { RuleSpec } from './RuleEngine.ts'
import { angleDiff, median } from './stats.ts'

export interface Shoulders {
  /** 어깨 중심 (0~1 정규화 좌표) */
  cx: number
  cy: number
  /** 어깨 너비 (0~1) */
  width: number
}

export interface PcFeatures {
  faceCount: number
  /** 고개 좌우 회전 (도) */
  yaw?: number
  /** 고개 상하 (도) */
  pitch?: number
  /** 시선 좌우: +는 응시자 기준 오른쪽 (-1~1) */
  gazeX?: number
  /** 시선 상하: +는 아래 (-1~1) */
  gazeY?: number
  /** 눈 감김 정도 (0~1). 깜빡이는 동안엔 시선을 판정하지 않는다 */
  blink?: number
  shoulders?: Shoulders | null
}

export interface PcBaseline {
  yaw: number
  pitch: number
  gazeX: number
  gazeY: number
  shoulders: Shoulders | null
}

export const PC_THRESHOLDS = {
  yawDeg: 25,
  pitchUpDeg: 20,
  pitchDownDeg: 25,
  gazeX: 0.45,
  gazeDown: 0.45,
  blinkIgnore: 0.5,
  torsoShift: 0.12,
  torsoWidthMin: 0.72,
  torsoWidthMax: 1.35,
}
export type PcThresholds = typeof PC_THRESHOLDS

export const PC_RULES: RuleSpec[] = [
  { kind: 'no_face', message: '얼굴이 화면에 보이지 않습니다', durationMs: 2000, cooldownMs: 8000 },
  { kind: 'multi_face', message: '여러 사람이 감지되었습니다', durationMs: 1000, cooldownMs: 8000 },
  { kind: 'head_turn', message: '고개를 화면 밖으로 돌렸습니다', durationMs: 1500, cooldownMs: 6000 },
  { kind: 'head_down', message: '고개를 오래 숙이고 있습니다', durationMs: 5000, cooldownMs: 10000 },
  { kind: 'gaze_away', message: '시선이 화면 밖을 향하고 있습니다', durationMs: 2500, cooldownMs: 6000 },
  { kind: 'torso_shift', message: '자리에서 크게 움직였습니다', durationMs: 2000, cooldownMs: 8000 },
  { kind: 'torso_turn', message: '몸을 돌리거나 화면에서 멀어졌습니다', durationMs: 2000, cooldownMs: 8000 },
]

export function pcConditions(f: PcFeatures, b: PcBaseline, t: PcThresholds = PC_THRESHOLDS): Record<string, boolean> {
  const c: Record<string, boolean> = {
    no_face: f.faceCount === 0,
    multi_face: f.faceCount > 1,
  }
  if (f.faceCount >= 1 && f.yaw !== undefined && f.pitch !== undefined) {
    const dYaw = angleDiff(f.yaw, b.yaw)
    const dPitch = angleDiff(f.pitch, b.pitch)
    // pitch: +는 고개를 숙인 방향 (headPose.ts 참고)
    c.head_turn = Math.abs(dYaw) > t.yawDeg || dPitch < -t.pitchUpDeg
    c.head_down = dPitch > t.pitchDownDeg
  }
  const eyesOpen = (f.blink ?? 0) < t.blinkIgnore
  if (f.faceCount >= 1 && eyesOpen && f.gazeX !== undefined && f.gazeY !== undefined) {
    // 고개를 이미 돌린 경우는 head_turn이 잡으므로 시선만 따로 본다
    c.gaze_away = Math.abs(f.gazeX - b.gazeX) > t.gazeX || f.gazeY - b.gazeY > t.gazeDown
  }
  if (b.shoulders) {
    if (!f.shoulders) {
      c.torso_shift = true
    } else {
      const shift = Math.hypot(f.shoulders.cx - b.shoulders.cx, f.shoulders.cy - b.shoulders.cy)
      const ratio = f.shoulders.width / b.shoulders.width
      c.torso_shift = shift > t.torsoShift
      c.torso_turn = ratio < t.torsoWidthMin || ratio > t.torsoWidthMax
    }
  }
  return c
}

/** 보정 구간에 모은 샘플의 중앙값으로 기준 자세를 만든다. 얼굴이 충분히 안 잡히면 null */
export function buildPcBaseline(samples: PcFeatures[]): PcBaseline | null {
  const faces = samples.filter((s) => s.faceCount === 1 && s.yaw !== undefined)
  if (faces.length < Math.max(5, samples.length * 0.6)) return null
  const sh = samples.map((s) => s.shoulders).filter((s): s is Shoulders => !!s)
  return {
    yaw: median(faces.map((s) => s.yaw!)),
    pitch: median(faces.map((s) => s.pitch!)),
    gazeX: median(faces.map((s) => s.gazeX ?? 0)),
    gazeY: median(faces.map((s) => s.gazeY ?? 0)),
    shoulders:
      sh.length >= samples.length * 0.5
        ? { cx: median(sh.map((s) => s.cx)), cy: median(sh.map((s) => s.cy)), width: median(sh.map((s) => s.width)) }
        : null,
  }
}
