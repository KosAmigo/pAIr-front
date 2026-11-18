// 대시보드 목업 데이터 (DESIGN.md §7-2, 2026-11-19 개편).
// 역량은 현재 채점 기준의 6개 항목(§1.5)과 배점을 쓴다. 예전 5개 항목 목업(mock.ts COMPETENCIES)은 리포트·복기 예시에서만 쓴다.

export type StatKey = 'usage' | 'control' | 'decomposition' | 'delegation' | 'delivery' | 'potential'

export const STATS: { key: StatKey; name: string; short: string; max: number; color: string; desc: string }[] = [
  { key: 'usage', name: 'AI 활용력', short: '활용', max: 20, color: 'var(--color-branch-2)', desc: '필요한 순간에 AI를 불러 맞는 질문을 던진다' },
  { key: 'control', name: 'AI 통제력', short: '통제', max: 15, color: 'var(--color-branch-3)', desc: 'AI의 답을 그대로 믿지 않고 확인한다' },
  { key: 'decomposition', name: '문제 분해력', short: '분해', max: 10, color: 'var(--color-branch-4)', desc: '큰 문제를 AI에게 맡길 단위로 나눈다' },
  { key: 'delegation', name: '위임 판단력', short: '위임', max: 10, color: 'var(--color-comp-7)', desc: '맡길 일과 직접 할 일을 가려낸다' },
  { key: 'delivery', name: 'AI 결과 도출력', short: '도출', max: 30, color: 'var(--color-branch-5)', desc: '끝내 돌아가는 결과물을 만들어 낸다' },
  { key: 'potential', name: '성과 잠재력', short: '잠재', max: 15, color: 'var(--color-comp-6)', desc: '다음에 더 잘할 수 있는 습관을 보인다' },
]

export type StatScores = Record<StatKey, number>

/** 응시 회차별 항목 점수 (배점 기준). 마지막이 최근 */
export const STAT_HISTORY: { date: string; task: string; scores: StatScores }[] = [
  { date: '09.02', task: '로그인 버그 재현과 수정', scores: { usage: 11, control: 7, decomposition: 5, delegation: 5, delivery: 16, potential: 8 } },
  { date: '09.16', task: '고객 VOC 분류 리포트', scores: { usage: 12, control: 8, decomposition: 5, delegation: 6, delivery: 18, potential: 9 } },
  { date: '09.30', task: '고객 VOC 분류 리포트', scores: { usage: 13, control: 9, decomposition: 6, delegation: 6, delivery: 19, potential: 10 } },
  { date: '10.14', task: '정산 배치 서비스 리팩터링', scores: { usage: 15, control: 9, decomposition: 6, delegation: 7, delivery: 21, potential: 10 } },
  { date: '10.28', task: '신규 요금제 출시 기획안', scores: { usage: 15, control: 10, decomposition: 7, delegation: 7, delivery: 22, potential: 10 } },
  { date: '11.07', task: '주문 API 장애 원인 분석', scores: { usage: 17, control: 10, decomposition: 8, delegation: 8, delivery: 23, potential: 10 } },
]

export const total = (s: StatScores) => STATS.reduce((n, st) => n + s[st.key], 0)

/** 크레딧 잔액은 기획_결정사항 §3(크레딧 원장 합계). 목업 값이다 */
export const PROFILE = { name: '김지원', credits: 1240 }
