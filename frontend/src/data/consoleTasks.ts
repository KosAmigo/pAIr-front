// 콘솔 과제 저장소 (DESIGN.md §7-9-1 ~ 9-3). 테이블 tasks, task_files, task_questions, question_choices,
// short_answer_keys, question_sources 를 화면에서 쓰기 좋게 한 덩어리로 묶었다.
// - 기본(api): 과제 목록과 공개 상태(HIDDEN/OPEN)는 백엔드에서. 과제 내용 편집(파일·문항)은 과제 DB(팀원 2·3)가 생기기 전까지
//   브라우저 안에서만 바뀐다 (저장되지 않음).
// - VITE_CONSOLE_DATA=mock: 예시 과제. 새로 고치면 처음 상태로 돌아간다.
import { useEffect, useSyncExternalStore } from 'react'
import { CONSOLE_USES_API, consoleApi, type ApiTask } from './consoleApi'
import { KINDS } from './catalog'
import { fileContents } from './mock'
import { getSessions, phaseOf } from './consoleSessions'

/** tasks.status: OPEN 공개·응시 가능 / CLOSED 목록에만 보이고 응시 막힘 / HIDDEN 숨김(초안·검수 대기) */
export type TaskStatus = 'OPEN' | 'CLOSED' | 'HIDDEN'
export type Track = 'DEV' | 'BIZ'
export type Difficulty = '초급' | '중급' | '고급'
export type QType = 'SINGLE' | 'MULTI' | 'SHORT' | 'ESSAY'

export type CFile = {
  id: string
  path: string
  /** 텍스트 파일 내용 */
  content?: string
  /** PDF 는 페이지별 추출 텍스트 */
  pages?: string[]
  size: number
  visible: boolean
  readOnly: boolean
}
export type Choice = { id: string; content: string; correct: boolean }
export type Source = { fileId: string; pages: string; note: string }
export type CQuestion = {
  id: string
  stage: 'TASK' | 'FOLLOWUP'
  type: QType
  content: string
  points?: number
  answerGuide?: string
  active: boolean
  choices?: Choice[]
  keys?: string[]
  sources: Source[]
  /** 후속 질문 1번: 삭제할 수 없는 고정 문항 */
  locked?: boolean
}
export type CTask = {
  id: string
  code: string
  title: string
  summary: string
  description: string
  requirements: string[]
  track: Track
  category: string
  difficulty: Difficulty
  minutes: number
  status: TaskStatus
  publishedAt?: string
  parentId?: string
  updatedAt: string
  files: CFile[]
  questions: CQuestion[]
}

/** 목록 탭: 테이블 status 와 1:1. 검수 대기 = HIDDEN, 공개 = OPEN, 응시 마감 = CLOSED (공개를 취소한 과제는 검수 대기) */
export type TaskTab = 'draft' | 'open' | 'closed'
export const tabOf = (t: CTask): TaskTab => (t.status === 'OPEN' ? 'open' : t.status === 'CLOSED' ? 'closed' : 'draft')

export const kindName = (key: string) => KINDS.find((k) => k.key === key)?.name ?? key
export const QTYPE_LABEL: Record<QType, string> = { SINGLE: '객관식 1개', MULTI: '객관식 여러 개', SHORT: '단답형', ESSAY: '서술형' }
export const FIXED_FOLLOWUP = 'AI 답변 중 직접 확인한 것과, 어떻게 확인했는지 적어 주세요.'

let seq = 100
export const newId = (p: string) => `${p}-${++seq}`
const now = () => new Date().toISOString()

const bytes = (s: string) => new TextEncoder().encode(s).length
const textFile = (path: string, content: string, o: Partial<CFile> = {}): CFile => ({
  id: newId('f'),
  path,
  content,
  size: bytes(content),
  visible: true,
  readOnly: false,
  ...o,
})
const pdfFile = (path: string, pages: string[], o: Partial<CFile> = {}): CFile => ({
  id: newId('f'),
  path,
  pages,
  size: 180_000 + pages.length * 42_000,
  visible: true,
  readOnly: true,
  ...o,
})
const followups = (rest: string[]): CQuestion[] => [
  { id: newId('q'), stage: 'FOLLOWUP', type: 'ESSAY', content: FIXED_FOLLOWUP, active: true, sources: [], locked: true },
  ...rest.map((c) => ({ id: newId('q'), stage: 'FOLLOWUP' as const, type: 'ESSAY' as const, content: c, active: true, sources: [] })),
]

// ── 처음 데이터 ──
function seed(): CTask[] {
  const devFiles = [
    textFile('backend/order/OrderService.java', fileContents['OrderService.java']),
    textFile('backend/order/OrderController.java', fileContents['OrderController.java']),
    textFile('backend/inventory/InventoryService.java', fileContents['InventoryService.java']),
    textFile('backend/inventory/StockRepository.java', fileContents['StockRepository.java']),
    textFile('backend/resources/application.yml', fileContents['application.yml']),
    textFile('backend/test/OrderServiceTest.java', fileContents['OrderServiceTest.java']),
    textFile('backend/test/OrderConcurrencyHiddenTest.java', '// 채점용 숨김 테스트: 동시 주문 100건에서 재고가 음수가 되지 않아야 한다\n', { visible: false, readOnly: true }),
    textFile('logs/api-2026-11-09.log', fileContents['api-2026-11-09.log'], { readOnly: true }),
    textFile('NOTES.md', fileContents['NOTES.md']),
  ]
  const survey = pdfFile('자료/이탈_설문_요약.pdf', [
    '구독 해지 설문 요약 (응답 1,240명)\n해지 사유 1위: 가격 부담 38%\n2위: 콘텐츠 부족 24%\n3위: 사용 빈도 감소 19%',
    '가격 부담 응답자 중 "월 5,000원 이하면 유지" 61%\n연령대별: 20대 44%, 30대 31%',
    '자유 응답 요약: 가족 요금제 요구, 광고형 요금제 거부감',
  ])
  const sales = pdfFile('자료/요금제별_매출.pdf', [
    '요금제별 분기 매출 (단위: 백만 원)\n베이직 412 / 스탠다드 935 / 프리미엄 618',
    '베이직 가입자 전 분기 대비 -12%, 프리미엄 +3%',
  ])
  const bizFilesList = [survey, sales, textFile('기획안.md', '# 저가 요금제 출시 기획안\n\n## 결론\n\n## 근거\n\n## 리스크와 대응\n')]

  const draftDev = [
    textFile('src/coupon/CouponService.java', '@Service\npublic class CouponService {\n    // TODO: 중복 적용 규칙에 맞게 할인 금액을 계산한다\n    public long apply(Order order, List<Coupon> coupons) {\n        return 0;\n    }\n}\n'),
    textFile('src/coupon/Coupon.java', 'public record Coupon(String code, Type type, long amount, boolean stackable) {\n    public enum Type { FIXED, PERCENT }\n}\n'),
    textFile('test/CouponServiceTest.java', '@SpringBootTest\nclass CouponServiceTest {\n    @Test\n    void 정액_쿠폰_하나() {\n        // given / when / then\n    }\n}\n'),
    textFile('docs/쿠폰_정책.md', '# 쿠폰 정책\n- 정률 쿠폰은 한 주문에 1장만\n- 정액 쿠폰은 stackable 이면 최대 2장\n- 할인 합계는 주문 금액의 50%를 넘지 않는다\n', { readOnly: true }),
  ]

  return [
    {
      id: 't-1',
      code: 'order-deadlock',
      title: '주문 처리 장애 원인 분석',
      summary: '주문이 3초 넘게 멈췄다가 실패합니다. 잠금 순서와 재고 정합성 문제를 찾아 고치세요.',
      description:
        '어제 21시부터 주문 생성 API(POST /orders)의 응답 시간이 평소보다 8배 늘고, 일부 요청이 500 오류로 끝나고 있습니다.\n\n제공된 코드와 로그를 살펴보고, 내장 AI를 활용해 원인을 찾아 수정하세요.',
      requirements: ['장애의 근본 원인을 찾아 코드로 수정한다.', '수정이 올바른지 확인할 수 있는 JUnit 테스트를 1개 이상 추가한다.', 'NOTES.md에 원인과 판단 근거를 3줄 이내로 정리한다.'],
      track: 'DEV',
      category: 'incident',
      difficulty: '중급',
      minutes: 60,
      status: 'OPEN',
      publishedAt: '2026-11-10T09:00:00Z',
      updatedAt: '2026-11-16T14:20:00Z',
      files: devFiles,
      questions: followups(['커넥션 풀을 늘리는 대신 잠금 순서를 정렬하기로 한 이유는 무엇인가요?', '시간이 30분 더 있었다면 무엇을 추가로 검증했을까요?']),
    },
    {
      id: 't-2',
      code: 'pricing-plan',
      title: '신규 저가 요금제 출시 기획안',
      summary: '이탈 설문과 매출 자료로 저가 요금제 출시 여부를 판단하는 1페이지 기획안을 씁니다.',
      description: '구독 서비스의 이탈률이 지난 분기 4.1%에서 6.8%로 올랐습니다. 경영진은 저가 요금제 출시를 검토하고 있습니다.\n\n제공된 자료와 내장 AI를 활용해 1페이지 기획안을 작성하세요.',
      requirements: ['출시 찬반 결론과 근거 3가지를 제시한다.', 'AI가 제시한 수치는 제공 자료와 대조해 검증한다.', '예상 리스크와 대응 방안을 1개 이상 포함한다.'],
      track: 'BIZ',
      category: 'planning',
      difficulty: '중급',
      minutes: 60,
      status: 'OPEN',
      publishedAt: '2026-11-11T09:00:00Z',
      updatedAt: '2026-11-17T10:05:00Z',
      files: bizFilesList,
      questions: [
        {
          id: newId('q'),
          stage: 'TASK',
          type: 'SINGLE',
          content: '해지 사유 1위와 그 비율로 맞는 것은?',
          points: 5,
          active: true,
          choices: [
            { id: newId('c'), content: '콘텐츠 부족 24%', correct: false },
            { id: newId('c'), content: '가격 부담 38%', correct: true },
            { id: newId('c'), content: '사용 빈도 감소 19%', correct: false },
          ],
          sources: [
            { fileId: survey.id, pages: '1', note: '설문 1쪽 표' },
            { fileId: sales.id, pages: '2', note: '베이직 감소와 연결' },
          ],
        },
        {
          id: newId('q'),
          stage: 'TASK',
          type: 'SHORT',
          content: '가격 부담 응답자 중 "월 5,000원 이하면 유지"라고 답한 비율(%)은?',
          points: 5,
          active: true,
          keys: ['61', '61%'],
          sources: [
            { fileId: survey.id, pages: '2', note: '' },
            { fileId: sales.id, pages: '1', note: '매출 규모 대조' },
          ],
        },
        {
          id: newId('q'),
          stage: 'TASK',
          type: 'ESSAY',
          content: '저가 요금제를 출시하면 프리미엄 매출에 어떤 영향이 있을지 자료를 근거로 설명하세요.',
          points: 10,
          answerGuide: '프리미엄 +3% 추세와 베이직 -12%를 함께 언급하고, 하향 이동(카니벌리제이션) 위험을 수치로 짚으면 만점.',
          active: true,
          sources: [{ fileId: sales.id, pages: '1-2', note: '' }],
        },
        ...followups(['AI가 제시한 수치 중 자료와 다른 것이 있었나요?', '결론을 바꿀 수 있는 추가 자료가 있다면 무엇인가요?']),
      ],
    },
    {
      id: 't-3',
      code: 'coupon-api-ai1',
      title: '쿠폰 적용 API 구현',
      summary: '중복 적용 규칙이 있는 쿠폰 할인 API를 만듭니다.',
      description: '쿠폰 정책 문서에 맞게 주문 금액에 쿠폰 할인을 적용하는 서비스를 구현하세요.\n\n정책의 예외 규칙을 AI에게 맡길 때 무엇을 직접 확인해야 하는지가 평가 포인트입니다.',
      requirements: ['CouponService.apply 를 정책대로 구현한다.', '정책의 경계값(50% 상한, 최대 2장)을 테스트로 확인한다.'],
      track: 'DEV',
      category: 'feature',
      difficulty: '중급',
      minutes: 60,
      status: 'HIDDEN',
      updatedAt: '2026-11-18T08:40:00Z',
      files: draftDev,
      questions: followups(['50% 상한 규칙은 어디에서 처리했고, 왜 그 위치를 골랐나요?']),
    },
    {
      id: 't-4',
      code: 'cs-manual-ai1',
      title: '환불 응대 매뉴얼 개선안',
      summary: '환불 정책과 실제 문의 사례로 응대 매뉴얼을 고칩니다.',
      description: '고객센터 환불 문의가 늘었습니다. 정책 문서와 문의 사례를 근거로 응대 매뉴얼을 고쳐 쓰세요.',
      requirements: ['자주 틀리는 응대 3가지를 찾아 고친다.', '정책 조항 번호를 근거로 단다.'],
      track: 'BIZ',
      category: 'cs',
      difficulty: '초급',
      minutes: 40,
      status: 'HIDDEN',
      updatedAt: '2026-11-18T09:12:00Z',
      files: [pdfFile('자료/환불_정책.pdf', ['제3조 7일 이내 전액 환불', '제5조 사용 이력이 있으면 일할 계산']), textFile('매뉴얼.md', '# 환불 응대 매뉴얼\n')],
      questions: [
        {
          id: newId('q'),
          stage: 'TASK',
          type: 'MULTI',
          content: '전액 환불이 가능한 경우를 모두 고르세요.',
          points: 5,
          active: true,
          choices: [
            { id: newId('c'), content: '결제 후 3일, 사용 이력 없음', correct: true },
            { id: newId('c'), content: '결제 후 10일, 사용 이력 없음', correct: false },
            { id: newId('c'), content: '결제 후 5일, 결제 오류', correct: true },
          ],
          sources: [],
        },
        ...followups([]),
      ],
    },
    {
      id: 't-5',
      code: 'legacy-report',
      title: '월간 리포트 자동화 (구버전)',
      summary: '엑셀 수작업 리포트를 스크립트로 바꿉니다.',
      description: '구버전 과제. 새 데이터 해석 과제로 대체되어 공개를 취소했습니다.',
      requirements: ['리포트 생성 스크립트를 만든다.'],
      track: 'BIZ',
      category: 'data',
      difficulty: '초급',
      minutes: 45,
      status: 'HIDDEN',
      publishedAt: '2026-10-01T09:00:00Z',
      updatedAt: '2026-11-05T11:00:00Z',
      files: [textFile('리포트.md', '# 월간 리포트\n')],
      questions: followups([]),
    },
  ]
}

// ── 저장소 ──
let tasks: CTask[] = CONSOLE_USES_API ? [] : seed()
let taskError: string | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** 백엔드 과제(정의 파일 + 공개 상태)를 화면 모양으로. 파일·문항은 과제 DB 가 생기면 채운다 */
function fromApi(t: ApiTask, prev?: CTask): CTask {
  return {
    ...(prev ?? {
      code: t.id,
      summary: '',
      description: '',
      requirements: [],
      category: t.type === 'dev' ? 'incident' : 'planning',
      difficulty: '중급' as Difficulty,
      files: [],
      questions: [],
    }),
    id: t.id,
    title: t.title,
    track: t.type === 'dev' ? 'DEV' : 'BIZ',
    minutes: t.minutes,
    status: t.status,
    publishedAt: t.publishedAt ?? undefined,
    updatedAt: t.updatedAt ?? prev?.updatedAt ?? '',
  }
}

export async function refreshTasks() {
  if (!CONSOLE_USES_API) return
  try {
    const list = await consoleApi.tasks()
    const prev = new Map(tasks.map((t) => [t.id, t]))
    tasks = list.map((t) => fromApi(t, prev.get(t.id)))
    taskError = null
  } catch (e) {
    taskError = e instanceof Error ? e.message : String(e)
  }
  emit()
}

export const useConsoleTasksError = () => useSyncExternalStore(subscribe, () => taskError)

export function useConsoleTasks() {
  useEffect(() => {
    if (CONSOLE_USES_API) void refreshTasks()
  }, [])
  return useSyncExternalStore(subscribe, () => tasks)
}
export function useConsoleTask(id: string | undefined) {
  const all = useConsoleTasks()
  return all.find((t) => t.id === id)
}

export function saveTask(t: CTask) {
  tasks = tasks.map((x) => (x.id === t.id ? { ...t, updatedAt: now() } : x))
  emit()
}

/**
 * 공개 상태 바꾸기. api 모드는 서버에 저장한다 (관리자만).
 * 응시 마감(CLOSED)은 아직 백엔드에 없어 api 모드에서는 숨김(HIDDEN)으로 처리한다.
 */
export async function setTaskStatus(id: string, status: TaskStatus) {
  if (CONSOLE_USES_API) {
    const saved = status === 'OPEN' ? await consoleApi.publishTask(id) : await consoleApi.hideTask(id)
    tasks = tasks.map((t) => (t.id === id ? fromApi(saved, t) : t))
    emit()
    return
  }
  tasks = tasks.map((t) =>
    t.id === id ? { ...t, status, publishedAt: status === 'OPEN' ? (t.publishedAt ?? now()) : t.publishedAt, updatedAt: now() } : t,
  )
  emit()
}

/** 복제: 새 검수 대기 과제를 만든다. 원본은 parentId 로 기억 */
export function duplicateTask(id: string) {
  const src = tasks.find((t) => t.id === id)!
  const copy: CTask = structuredClone(src)
  copy.id = newId('t')
  copy.code = `${src.code}-copy${seq}`
  copy.title = `${src.title} (복제)`
  copy.status = 'HIDDEN'
  copy.publishedAt = undefined
  copy.parentId = src.id
  copy.updatedAt = now()
  tasks = [copy, ...tasks]
  emit()
  return copy.id
}

/** 이 과제를 쓰는 진행 중이거나 예정된 회차 수 */
export const activeSessionCount = (id: string) => getSessions().filter((x) => x.tasks.some((t) => t.id === id) && phaseOf(x) !== 'ended').length

export type DraftInput = {
  track: Track
  category: string
  difficulty: Difficulty
  minutes: number
  /** 주제 (기획_결정사항 §2: 관리자가 글로만 정의. 참고 파일 업로드는 없다) */
  topic: string
  /** 응시자가 빠지기 쉬운 함정 (선택) */
  trap: string
  counts: { SINGLE: number; SHORT: number; ESSAY: number; FOLLOWUP: number }
}

/** AI 초안 생성 (목업): 입력에 맞는 그럴듯한 초안을 만들어 검수 대기로 넣는다 */
export function createDraft(input: DraftInput) {
  const kind = kindName(input.category)
  // 근거 문서도 AI가 만든다 (업로드 없음). 문항 근거는 이 자료의 쪽을 가리킨다
  const topic = input.topic.trim() || kind
  const pdfs = [pdfFile('자료/참고자료.pdf', [`${topic} 배경과 상황 (AI 생성)`, `${topic} 수치와 근거 (AI 생성)`, input.trap.trim() ? `함정: ${input.trap.trim()}` : '추가 자료 (AI 생성)'])]
  const files =
    input.track === 'DEV'
      ? [
          textFile('src/main/Service.java', `@Service\npublic class Service {\n    // AI 초안: ${kind} 과제의 시작 코드\n}\n`),
          textFile('test/ServiceTest.java', '@SpringBootTest\nclass ServiceTest {\n}\n'),
          textFile('NOTES.md', '# 메모\n'),
          ...pdfs,
        ]
      : [...pdfs, textFile('결과물.md', `# ${kind}\n`)]
  const srcs = (n: number): Source[] => pdfs.slice(0, 2).map((p, i) => ({ fileId: p.id, pages: String(i + 1), note: n === 0 ? '' : 'AI 초안' }))
  const qs: CQuestion[] = [
    ...Array.from({ length: input.counts.SINGLE }, (_, i) => ({
      id: newId('q'),
      stage: 'TASK' as const,
      type: 'SINGLE' as const,
      content: `자료에 따르면 맞는 설명은? (AI 초안 ${i + 1})`,
      points: 5,
      active: true,
      choices: ['첫 번째 보기', '두 번째 보기', '세 번째 보기', '네 번째 보기'].map((c, j) => ({ id: newId('c'), content: c, correct: j === 1 })),
      sources: srcs(i),
    })),
    ...Array.from({ length: input.counts.SHORT }, (_, i) => ({
      id: newId('q'),
      stage: 'TASK' as const,
      type: 'SHORT' as const,
      content: `자료에서 찾을 수 있는 수치를 쓰세요. (AI 초안 ${i + 1})`,
      points: 5,
      active: true,
      keys: ['42'],
      sources: srcs(i),
    })),
    ...Array.from({ length: input.counts.ESSAY }, (_, i) => ({
      id: newId('q'),
      stage: 'TASK' as const,
      type: 'ESSAY' as const,
      content: `자료를 근거로 결론을 설명하세요. (AI 초안 ${i + 1})`,
      points: 10,
      answerGuide: '근거 수치 2개 이상과 결론이 이어지면 만점.',
      active: true,
      sources: srcs(i),
    })),
    ...followups(Array.from({ length: Math.max(0, input.counts.FOLLOWUP - 1) }, (_, i) => `풀이 중 가장 어려웠던 판단은 무엇이었나요? (AI 초안 ${i + 1})`)),
  ]
  const t: CTask = {
    id: newId('t'),
    code: `${input.category}-ai${seq}`,
    title: input.topic.trim() ? `${input.topic.trim()} (AI 초안)` : `${kind} 과제 (AI 초안)`,
    summary: input.topic.trim() || `${kind} 역량을 보는 ${input.difficulty} 과제입니다.`,
    description: `AI가 만든 초안입니다. 상황 설명을 검수하세요.\n\n주제: ${input.topic.trim() || kind}\n함정: ${input.trap.trim() || '없음'}`,
    requirements: ['요구사항 1을 검수하세요.', '요구사항 2를 검수하세요.'],
    track: input.track,
    category: input.category,
    difficulty: input.difficulty,
    minutes: input.minutes,
    status: 'HIDDEN',
    updatedAt: now(),
    files,
    questions: qs,
  }
  tasks = [t, ...tasks]
  emit()
  return t
}

/** 공개 전 점검 (DESIGN.md §7-9-3). 빠진 것 목록과 고칠 탭 */
export function checkPublish(t: CTask): { text: string; tab: 'info' | 'files' | 'questions' | 'followups' }[] {
  const out: { text: string; tab: 'info' | 'files' | 'questions' | 'followups' }[] = []
  if (!t.title.trim()) out.push({ text: '제목이 비어 있습니다', tab: 'info' })
  if (!t.summary.trim()) out.push({ text: '한 줄 소개가 비어 있습니다', tab: 'info' })
  if (!t.description.trim()) out.push({ text: '상세 설명이 비어 있습니다', tab: 'info' })
  if (!t.requirements.some((r) => r.trim())) out.push({ text: '요구사항이 하나도 없습니다', tab: 'info' })
  if (!t.files.some((f) => f.visible)) out.push({ text: '응시자에게 보이는 파일이 없습니다', tab: 'files' })
  t.questions
    .filter((q) => q.stage === 'TASK' && q.active)
    .forEach((q, i) => {
      const n = `Q${i + 1}`
      if (!q.content.trim()) out.push({ text: `${n} 문제 내용이 비어 있습니다`, tab: 'questions' })
      if ((q.type === 'SINGLE' || q.type === 'MULTI') && !q.choices?.some((c) => c.correct)) out.push({ text: `${n} 정답 보기가 없습니다`, tab: 'questions' })
      if (q.type === 'SHORT' && !q.keys?.length) out.push({ text: `${n} 인정 답안이 없습니다`, tab: 'questions' })
      if (q.type === 'ESSAY' && !q.answerGuide?.trim()) out.push({ text: `${n} 서술형 채점 기준이 없습니다`, tab: 'questions' })
      if (t.track === 'BIZ' && q.sources.length < 2) out.push({ text: `${n} 근거 문서가 2개보다 적습니다 (비개발 규칙)`, tab: 'questions' })
    })
  if (!t.questions.some((q) => q.stage === 'FOLLOWUP' && q.active)) out.push({ text: '후속 질문이 없습니다', tab: 'followups' })
  return out
}
