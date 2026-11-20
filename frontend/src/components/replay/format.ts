import type { AttemptStatus } from '../../api'

export const STATUS_LABEL: Record<AttemptStatus, string> = {
  SOLVING: '풀이 중',
  FOLLOWUP: '후속 질문',
  SCORING: '채점 중',
  DONE: '채점 완료',
  ERROR: '채점 실패',
}

export const turnLabel = (n: number) => `#T${String(n).padStart(2, '0')}`

export const shortTime = (iso: string) =>
  new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
