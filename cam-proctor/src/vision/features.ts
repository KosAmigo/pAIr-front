// MediaPipe 결과 → 규칙 엔진이 쓰는 숫자(특징값)로 변환
import type {
  Classifications,
  FaceLandmarkerResult,
  HandLandmarkerResult,
  NormalizedLandmark,
  ObjectDetectorResult,
  PoseLandmarkerResult,
} from '@mediapipe/tasks-vision'
import type { PcFeatures, Shoulders } from '../rules/pcRules'
import type { DetectedObject, PhoneFeatures } from '../rules/phoneRules'
import type { Point } from '../rules/stats'

const RAD = 180 / Math.PI
const VISIBLE = 0.5

/**
 * 얼굴 변환 행렬(4x4, column-major)에서 고개 각도를 뽑는다.
 * yaw: 좌우 회전, pitch: +면 고개 숙임, roll: 기울임
 */
export function headPoseFromMatrix(data: number[]): { yaw: number; pitch: number; roll: number } {
  const r = (row: number, col: number) => data[col * 4 + row]
  const yaw = Math.asin(Math.max(-1, Math.min(1, -r(2, 0)))) * RAD
  const pitch = Math.atan2(r(2, 1), r(2, 2)) * RAD
  const roll = Math.atan2(r(1, 0), r(0, 0)) * RAD
  return { yaw, pitch, roll }
}

function scoreMap(c: Classifications | undefined): Record<string, number> {
  const m: Record<string, number> = {}
  for (const cat of c?.categories ?? []) m[cat.categoryName] = cat.score
  return m
}

/**
 * 블렌드셰이프로 시선 방향 추정. (Left/Right는 응시자 기준)
 * 응시자가 오른쪽을 보면 왼눈은 안쪽(In), 오른눈은 바깥쪽(Out)으로 간다.
 */
export function gazeFromBlendshapes(c: Classifications | undefined) {
  const s = scoreMap(c)
  const v = (k: string) => s[k] ?? 0
  const gazeX = (v('eyeLookInLeft') - v('eyeLookOutLeft') + (v('eyeLookOutRight') - v('eyeLookInRight'))) / 2
  const gazeY = (v('eyeLookDownLeft') - v('eyeLookUpLeft') + (v('eyeLookDownRight') - v('eyeLookUpRight'))) / 2
  const blink = (v('eyeBlinkLeft') + v('eyeBlinkRight')) / 2
  return { gazeX, gazeY, blink }
}

function visible(l: NormalizedLandmark | undefined): l is NormalizedLandmark {
  return !!l && (l.visibility ?? 1) >= VISIBLE && l.x >= 0 && l.x <= 1 && l.y >= 0 && l.y <= 1
}

// 포즈 랜드마크 번호
const L_SHOULDER = 11
const R_SHOULDER = 12
const L_WRIST = 15
const R_WRIST = 16

export function shouldersFromPose(pose: PoseLandmarkerResult | undefined): Shoulders | null {
  const lm = pose?.landmarks?.[0]
  if (!lm) return null
  const l = lm[L_SHOULDER]
  const r = lm[R_SHOULDER]
  if (!visible(l) || !visible(r)) return null
  return { cx: (l.x + r.x) / 2, cy: (l.y + r.y) / 2, width: Math.hypot(l.x - r.x, l.y - r.y) }
}

export function pcFeatures(face: FaceLandmarkerResult, pose: PoseLandmarkerResult | undefined): PcFeatures {
  const faceCount = face.faceLandmarks.length
  const f: PcFeatures = { faceCount, shoulders: shouldersFromPose(pose) }
  if (faceCount >= 1) {
    const m = face.facialTransformationMatrixes?.[0]
    if (m) Object.assign(f, headPoseFromMatrix(m.data))
    Object.assign(f, gazeFromBlendshapes(face.faceBlendshapes?.[0]))
  }
  return f
}

export function handCenters(hands: HandLandmarkerResult | undefined): Point[] {
  return (hands?.landmarks ?? []).map((lm) => {
    const x = lm.reduce((a, p) => a + p.x, 0) / lm.length
    const y = lm.reduce((a, p) => a + p.y, 0) / lm.length
    return { x, y }
  })
}

export function wristsFromPose(pose: PoseLandmarkerResult | undefined): Point[] {
  const lm = pose?.landmarks?.[0]
  if (!lm) return []
  return [lm[L_WRIST], lm[R_WRIST]].filter(visible).map((p) => ({ x: p.x, y: p.y }))
}

/**
 * 물체 감지 결과. 화면류는 박스 안 밝기를 프레임 평균과 비교해 "켜짐" 여부를 붙인다.
 * luma: 축소한 프레임의 밝기 배열 (lumaW x lumaH)
 */
export function detectedObjects(
  det: ObjectDetectorResult | undefined,
  videoW: number,
  videoH: number,
  luma?: { data: Uint8ClampedArray; w: number; h: number },
): DetectedObject[] {
  const out: DetectedObject[] = []
  let frameMean = 0
  if (luma) {
    for (let i = 0; i < luma.data.length; i += 4) frameMean += luma.data[i]
    frameMean /= luma.data.length / 4
  }
  for (const d of det?.detections ?? []) {
    const cat = d.categories[0]
    if (!cat) continue
    let bright = false
    const bb = d.boundingBox
    if (luma && bb && (cat.categoryName === 'laptop' || cat.categoryName === 'tv' || cat.categoryName === 'cell phone')) {
      const sx = luma.w / videoW
      const sy = luma.h / videoH
      const x0 = Math.max(0, Math.floor(bb.originX * sx))
      const y0 = Math.max(0, Math.floor(bb.originY * sy))
      const x1 = Math.min(luma.w, Math.ceil((bb.originX + bb.width) * sx))
      const y1 = Math.min(luma.h, Math.ceil((bb.originY + bb.height) * sy))
      let sum = 0
      let n = 0
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        sum += luma.data[(y * luma.w + x) * 4]
        n++
      }
      const mean = n ? sum / n : 0
      bright = mean > 110 && mean > frameMean * 1.25
    }
    out.push({
      label: cat.categoryName,
      score: cat.score,
      bright,
      box: bb ? { x: bb.originX / videoW, y: bb.originY / videoH, w: bb.width / videoW, h: bb.height / videoH } : undefined,
    })
  }
  return out
}

export function phoneFeatures(
  hands: HandLandmarkerResult | undefined,
  pose: PoseLandmarkerResult | undefined,
  objects: DetectedObject[],
): PhoneFeatures {
  return { hands: handCenters(hands), wrists: wristsFromPose(pose), objects }
}
