// 자가진단 과제 목록 (usage = 'SELF'). 응시할 수 있는 과제는 OPEN 2개이고, 나머지는 CLOSED(응시 마감) 목업이다.

export type Track = 'dev' | 'biz'

export type TaskKind = { key: string; track: Track; name: string; desc: string }

export const KINDS: TaskKind[] = [
  { key: 'incident', track: 'dev', name: '장애 분석', desc: '로그와 코드로 원인을 찾아 고칩니다' },
  { key: 'feature', track: 'dev', name: '기능 구현', desc: '요구사항을 받아 새 기능을 만듭니다' },
  { key: 'refactor', track: 'dev', name: '리팩터링', desc: '동작은 그대로 두고 구조를 개선합니다' },
  { key: 'testing', track: 'dev', name: '테스트 작성', desc: '빠진 테스트를 채워 품질을 지킵니다' },
  { key: 'planning', track: 'biz', name: '기획서', desc: '자료를 근거로 결론과 실행안을 씁니다' },
  { key: 'data', track: 'biz', name: '데이터 해석', desc: '수치를 읽고 의미 있는 결론을 냅니다' },
  { key: 'research', track: 'biz', name: '리서치 요약', desc: '여러 자료를 검증해 핵심만 정리합니다' },
  { key: 'cs', track: 'biz', name: '고객 응대 문서', desc: '정책과 사례로 응대 문서를 만듭니다' },
]

export type CatalogTask = {
  id: string
  kind: string
  title: string
  summary: string
  minutes: number
  level: '초급' | '중급' | '고급'
  /**
   * 상태 (기획_결정사항 §5-2): 자가진단 목록은 usage = 'SELF' AND status IN ('OPEN', 'CLOSED').
   * CLOSED 는 목록에는 보이지만 "응시 마감"으로 시작 버튼이 막힌다.
   */
  status: 'OPEN' | 'CLOSED'
  /** 응시 시작 경로 (OPEN 일 때) */
  start?: string
}

export const CATALOG: CatalogTask[] = [
  {
    id: 'order-deadlock',
    kind: 'incident',
    title: '주문 처리 장애 원인 분석',
    summary: '주문이 3초 넘게 멈췄다가 실패합니다. 잠금 순서와 재고 정합성 문제를 찾아 고치세요.',
    minutes: 60,
    level: '중급',
    status: 'OPEN',
    start: '/exam/new?track=dev',
  },
  { id: 'coupon-api', kind: 'feature', title: '쿠폰 적용 API 구현', summary: '중복 적용 규칙이 있는 쿠폰 할인 API를 만듭니다.', minutes: 60, level: '중급', status: 'CLOSED' },
  { id: 'settle-batch', kind: 'refactor', title: '정산 배치 리팩터링', summary: '500줄짜리 정산 메서드를 테스트를 지키며 나눕니다.', minutes: 60, level: '고급', status: 'CLOSED' },
  { id: 'payment-test', kind: 'testing', title: '결제 모듈 테스트 보강', summary: '경계값과 실패 경로 테스트를 추가합니다.', minutes: 40, level: '초급', status: 'CLOSED' },
  {
    id: 'pricing-plan',
    kind: 'planning',
    title: '신규 저가 요금제 출시 기획안',
    summary: '이탈 설문과 매출 자료로 저가 요금제 출시 여부를 판단하는 1페이지 기획안을 씁니다.',
    minutes: 60,
    level: '중급',
    status: 'OPEN',
    start: '/exam/new?track=biz',
  },
  { id: 'sales-report', kind: 'data', title: '분기 매출 데이터 해석', summary: '지역별 매출 변화의 원인을 데이터로 설명합니다.', minutes: 45, level: '중급', status: 'CLOSED' },
  { id: 'competitor', kind: 'research', title: '경쟁사 리서치 요약 검증', summary: 'AI가 만든 요약에서 틀린 사실을 찾아 바로잡습니다.', minutes: 35, level: '초급', status: 'CLOSED' },
  { id: 'cs-manual', kind: 'cs', title: '환불 응대 매뉴얼 개선안', summary: '환불 정책과 실제 문의 사례로 응대 매뉴얼을 고칩니다.', minutes: 40, level: '초급', status: 'CLOSED' },
]
