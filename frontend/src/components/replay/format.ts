import type { AttemptStatus } from '../../api'

export const STATUS_LABEL: Record<AttemptStatus, string> = {
  SOLVING: '풀이 중',
  FOLLOWUP: '후속 질문',
  SCORING: '채점 중',
  DONE: '채점 완료',
  ERROR: '채점 실패',
}
