// 실전 시험 맥락. 입장 화면에서 시험을 시작하면 저장하고, 응시 화면은 이것이 있을 때만 "실전"으로 본다.
// 자가진단은 이 맥락이 없으므로 부정행위 감독(브라우저 이벤트·카메라)을 전혀 켜지 않는다.
// 탭을 닫으면 사라지도록 sessionStorage 에 둔다 (초대 토큰이 오래 남지 않게).

export type LiveExam = {
  invite: string
  title: string
  startsAt: string
  endsAt: string
  proctoring: boolean
  /** 과제 ID → 응시 ID */
  attempts: Record<string, string>
  /** 서버 시각 - 내 시각 (ms) */
  serverOffsetMs: number
}

const KEY = 'pair:live-exam'

function storage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null
  }
}

export function saveLiveExam(live: LiveExam) {
  try {
    storage()?.setItem(KEY, JSON.stringify(live))
  } catch {
    /* 저장 못 하면 이번 화면에서만 실전으로 동작 */
  }
}

export function clearLiveExam() {
  try {
    storage()?.removeItem(KEY)
  } catch {
    /* 무시 */
  }
}

/** 이 탭에서 진행 중인 실전 시험의 입장 토큰. 탭을 닫으면 사라진다 (같은 링크로 이어서 들어올 수 있는지 판단에 쓴다) */
export function readLiveInvite(): string | null {
  try {
    const raw = storage()?.getItem(KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isLiveExam(parsed) ? parsed.invite : null
  } catch {
    return null
  }
}

function isLiveExam(v: unknown): v is LiveExam {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return typeof o.invite === 'string' && typeof o.endsAt === 'string' && typeof o.attempts === 'object' && o.attempts !== null
}

/** attemptId 가 이 실전 시험의 응시일 때만 돌려준다 */
export function readLiveExam(attemptId: string): LiveExam | null {
  try {
    const raw = storage()?.getItem(KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isLiveExam(parsed)) return null
    return Object.values(parsed.attempts).includes(attemptId) ? parsed : null
  } catch {
    return null
  }
}

/** 서버 기준 남은 초 */
export function secondsLeft(live: LiveExam, now = Date.now()): number {
  return Math.floor((Date.parse(live.endsAt) - (now + live.serverOffsetMs)) / 1000)
}
