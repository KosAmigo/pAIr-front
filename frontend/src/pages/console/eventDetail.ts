// 감독 이벤트의 detail(JSON 문자열)을 감독관이 읽을 수 있는 문장으로 바꾼다.
// 좌표 숫자(faceCount·yaw·pitch·gazeX·gazeY)는 그대로 보여 주지 않는다 (사진이 함께 보이므로). 모르는 키는 숨긴다.
// 값의 뜻과 기준은 proctor/core/pcRules.ts 의 PcFeatures · PC_THRESHOLDS 와 같다.
import { PC_THRESHOLDS } from '../../proctor/core/pcRules.ts'

const pct = (v: number) => `${Math.round(Math.abs(v) * 100)}%`
const deg = (v: number) => `${Math.round(Math.abs(v))}°`

function parse(detail: string | null): Record<string, unknown> | null {
  if (!detail) return null
  try {
    const o = JSON.parse(detail) as unknown
    return o && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, unknown>) : null
  } catch {
    return null
  }
}

const num = (o: Record<string, unknown>, k: string): number | null => {
  const v = o[k]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** 초 → "3분 20초" / "45초" */
export function durationText(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds))
  const m = Math.floor(s / 60)
  return m > 0 ? `${m}분${s % 60 ? ` ${s % 60}초` : ''}` : `${s}초`
}

function gazeSentences(o: Record<string, unknown>): string[] {
  const out: string[] = []
  const x = num(o, 'gazeX')
  const y = num(o, 'gazeY')
  // 기준을 넘은 방향만 말한다 (시선 판정은 좌우·아래만 본다)
  if (x !== null && Math.abs(x) >= PC_THRESHOLDS.gazeX) {
    out.push(`시선이 ${x > 0 ? '오른쪽' : '왼쪽'}으로 ${pct(x)} 치우침 (기준 ${pct(PC_THRESHOLDS.gazeX)} 넘으면 경고)`)
  }
  if (y !== null && y >= PC_THRESHOLDS.gazeDown) {
    out.push(`시선이 아래로 ${pct(y)} 치우침 (기준 ${pct(PC_THRESHOLDS.gazeDown)} 넘으면 경고)`)
  }
  if (out.length === 0 && x !== null) out.push(`시선이 ${x > 0 ? '오른쪽' : '왼쪽'}으로 ${pct(x)} 치우침 (기준 ${pct(PC_THRESHOLDS.gazeX)} 넘으면 경고)`)
  return out
}

function headDownSentences(o: Record<string, unknown>): string[] {
  const p = num(o, 'pitch')
  if (p === null) return []
  return p >= 0
    ? [`고개를 아래로 ${deg(p)} 숙임 (기준 ${PC_THRESHOLDS.pitchDownDeg}° 넘으면 경고)`]
    : [`고개를 위로 ${deg(p)} 듦 (기준 ${PC_THRESHOLDS.pitchUpDeg}° 넘으면 경고)`]
}

/**
 * 이벤트 종류별 세부 문장. 보여 줄 문장이 없으면 빈 배열이다.
 * 고개 좌우 방향은 코드에 기준이 없어 "좌우로"라고만 쓴다.
 */
export function describeEvent(type: string, detail: string | null): string[] {
  const o = parse(detail)
  if (!o) return []
  switch (type) {
    case 'NO_FACE':
      return ['화면에서 얼굴이 감지되지 않음']
    case 'MULTI_FACE': {
      const n = num(o, 'faceCount')
      return n !== null && n > 0 ? [`감지된 얼굴 ${Math.round(n)}명`] : []
    }
    case 'HEAD_TURN': {
      const yaw = num(o, 'yaw')
      return yaw !== null ? [`고개를 좌우로 ${deg(yaw)} 돌림 (기준 ${PC_THRESHOLDS.yawDeg}° 넘으면 경고)`] : []
    }
    case 'HEAD_DOWN':
      return headDownSentences(o)
    case 'GAZE_AWAY':
      return gazeSentences(o)
    case 'CONNECTION_LOST': {
      const gap = num(o, 'gapSeconds')
      return gap !== null ? [`연결이 ${durationText(gap)} 동안 끊겨 있었음`] : []
    }
    default:
      return []
  }
}
