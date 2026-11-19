// 과제 형태 분류 (직군별). 자가진단 과제 목록 자체는 백엔드(GET /api/tasks/{id})에서 받는다 (pages/Tasks.tsx).

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
