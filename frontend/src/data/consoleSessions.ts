// 콘솔 회차 저장소 (DESIGN.md §7-9-4). 테이블 companies, exam_sessions, exam_participants, proctor_events 를
// 화면에서 쓰기 좋게 묶었다.
// - 기본(api): 회차·대상자·감독 이벤트·결과를 백엔드(consoleApi.ts)에서 읽고 쓴다. 화면은 이 파일의 훅·함수만 쓴다.
// - VITE_CONSOLE_DATA=mock: 브라우저 안 예시 데이터 (화면 시안·발표용). 새로 고치면 처음 상태로 돌아간다.
// 회사 목록은 아직 목업이다 (기업 도입 문의·승인은 팀원 1 영역).
import { useEffect, useSyncExternalStore } from 'react'
import type { Report } from '../api'
import { CONSOLE_USES_API, consoleApi, type ApiEvent, type ApiParticipant, type ApiResultRow, type ApiSessionSummary } from './consoleApi'

// ── 회사 (DESIGN.md §7-9-5) ──
export type Manager = { id: string; name: string; email: string; createdAt: string }
export type Company = { id: number; name: string; businessNo?: string; createdAt: string; managers: Manager[] }
let companies: Company[] = [
  {
    id: 1,
    name: '예시테크',
    businessNo: '123-45-67890',
    createdAt: '2026-11-04T09:00:00+09:00',
    managers: [
      { id: 'm-1', name: '예시테크 담당자', email: 'hr@example-tech.test', createdAt: '2026-11-04T09:10:00+09:00' },
      { id: 'm-2', name: '김채용', email: 'recruit@example-tech.test', createdAt: '2026-11-08T13:20:00+09:00' },
    ],
  },
  {
    id: 2,
    name: '샘플랩',
    createdAt: '2026-11-12T10:00:00+09:00',
    managers: [{ id: 'm-3', name: '이인사', email: 'people@samplelab.test', createdAt: '2026-11-12T10:05:00+09:00' }],
  },
]
const companyListeners = new Set<() => void>()
const emitCompanies = () => companyListeners.forEach((l) => l())
const subscribeCompanies = (l: () => void) => {
  companyListeners.add(l)
  return () => companyListeners.delete(l)
}
export const getCompanies = () => companies
export const useCompanies = () => useSyncExternalStore(subscribeCompanies, () => companies)
export const companyName = (id: number) => companies.find((c) => c.id === id)?.name ?? '알 수 없는 회사'

/** 회사 등록. 같은 이름이나 사업자등록번호가 있으면 오류 문구를 돌려준다 */
export function createCompany(name: string, businessNo?: string): { id?: number; error?: string } {
  const n = name.trim()
  const b = businessNo?.trim() || undefined
  if (!n) return { error: '회사 이름을 입력하세요' }
  if (companies.some((c) => c.name === n)) return { error: '같은 이름의 회사가 있습니다' }
  if (b && !/^\d{3}-\d{2}-\d{5}$/.test(b)) return { error: '사업자등록번호는 000-00-00000 형식입니다' }
  if (b && companies.some((c) => c.businessNo === b)) return { error: '이미 등록된 사업자등록번호입니다' }
  const id = Math.max(0, ...companies.map((c) => c.id)) + 1
  companies = [...companies, { id, name: n, businessNo: b, createdAt: new Date().toISOString(), managers: [] }]
  emitCompanies()
  return { id }
}
export function updateCompany(id: number, patch: { name?: string; businessNo?: string }): string | null {
  const n = patch.name?.trim()
  const b = patch.businessNo?.trim() || undefined
  if (n !== undefined && !n) return '회사 이름을 입력하세요'
  if (n && companies.some((c) => c.id !== id && c.name === n)) return '같은 이름의 회사가 있습니다'
  if (b && !/^\d{3}-\d{2}-\d{5}$/.test(b)) return '사업자등록번호는 000-00-00000 형식입니다'
  if (b && companies.some((c) => c.id !== id && c.businessNo === b)) return '이미 등록된 사업자등록번호입니다'
  companies = companies.map((c) => (c.id === id ? { ...c, ...(n ? { name: n } : {}), businessNo: b } : c))
  emitCompanies()
  return null
}
export function addManager(id: number, name: string, email: string): string | null {
  const e = email.trim().toLowerCase()
  if (!name.trim()) return '이름을 입력하세요'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return '이메일 형식이 맞지 않습니다'
  if (companies.some((c) => c.managers.some((m) => m.email === e))) return '이미 담당자로 등록된 이메일입니다'
  companies = companies.map((c) =>
    c.id === id ? { ...c, managers: [...c.managers, { id: `m-${Date.now()}`, name: name.trim(), email: e, createdAt: new Date().toISOString() }] } : c,
  )
  emitCompanies()
  return null
}
export function removeManager(id: number, managerId: string) {
  companies = companies.map((c) => (c.id === id ? { ...c, managers: c.managers.filter((m) => m.id !== managerId) } : c))
  emitCompanies()
}

/** proctor_event_types.code (백엔드 ProctorEvent.Type 과 같은 이름) */
export type PEventType =
  | 'TAB_HIDDEN' | 'WINDOW_BLUR' | 'MOUSE_LEAVE' | 'PASTE' | 'FULLSCREEN_EXIT'
  | 'NO_FACE' | 'MULTI_FACE' | 'HEAD_TURN' | 'HEAD_DOWN' | 'GAZE_AWAY' | 'TORSO_SHIFT' | 'TORSO_TURN'
  | 'HAND_MISSING' | 'HAND_MOVED' | 'ARM_MOVE' | 'PHONE' | 'EXTRA_SCREEN' | 'BOOK' | 'PHONE_DISCONNECTED'
export const EVENT_LABEL: Record<PEventType, string> = {
  TAB_HIDDEN: '탭 전환',
  WINDOW_BLUR: '창 이탈',
  MOUSE_LEAVE: '마우스 이탈',
  PASTE: '외부 붙여넣기',
  FULLSCREEN_EXIT: '전체 화면 해제',
  NO_FACE: '얼굴 없음',
  MULTI_FACE: '여러 얼굴',
  HEAD_TURN: '고개 돌림',
  HEAD_DOWN: '오래 숙임',
  GAZE_AWAY: '시선 이탈',
  TORSO_SHIFT: '자리 이동',
  TORSO_TURN: '몸 돌림',
  HAND_MISSING: '손 이탈',
  HAND_MOVED: '손 위치 이탈',
  ARM_MOVE: '팔 움직임',
  PHONE: '휴대폰',
  EXTRA_SCREEN: '다른 화면',
  BOOK: '책·자료',
  PHONE_DISCONNECTED: '휴대폰 캠 끊김',
}
const BROWSER_EVENTS: ReadonlySet<PEventType> = new Set(['TAB_HIDDEN', 'WINDOW_BLUR', 'MOUSE_LEAVE', 'PASTE', 'FULLSCREEN_EXIT'])
/** 카메라(PC·휴대폰) 이벤트: 사진이 붙을 수 있다 */
export const isCameraEvent = (t: PEventType) => !BROWSER_EVENTS.has(t)

export type Review = 'OK' | 'SUSPECT'
export type PEvent = {
  id: string
  type: PEventType
  at: string
  durationMs: number
  /** 카메라 감지만 (0~1) */
  confidence?: number
  detail?: string
  /** 카메라 이벤트 스냅샷: 있음 / 보관 기간이 지나 지움 */
  snapshot?: 'ok' | 'deleted'
  review?: Review
  reviewNote?: string
  reviewedBy?: string
  reviewedAt?: string
}

export type PState = 'NOT_ENTERED' | 'SOLVING' | 'FOLLOWUP' | 'SUBMITTED' | 'DISCONNECTED'
export const PSTATE_LABEL: Record<PState, string> = {
  NOT_ENTERED: '미입장',
  SOLVING: '응시 중',
  FOLLOWUP: '후속 질문',
  SUBMITTED: '제출',
  DISCONNECTED: '연결 끊김',
}

export type Participant = {
  id: string
  name: string
  email: string
  invitedAt: string
  enteredAt?: string
  state: PState
  aiTurns: number
  lastActiveAt?: string
  /** 초대 메일 결과 (api 모드) */
  inviteStatus?: 'PENDING' | 'SENT' | 'FAILED'
  inviteError?: string
  remindedAt?: string
  /** 종료 회차: 채점 결과 (샘플 리포트 파일 이름과 요약) */
  reportFile?: string
  score?: number
  items?: Record<string, number>
  events: PEvent[]
}

export type SessionTask = { id: string; title: string; minutes: number }

export type Session = {
  id: string
  companyId: number
  /** 회차 과제 (기획_결정사항 §1: 한 회차에 과제 여러 개, 응시자가 자유롭게 오가며 푼다. 순서 = sort_order) */
  tasks: SessionTask[]
  /** 대상자 CSV 원본 파일 이름 (DB 에는 S3 키 participants_csv_key) */
  participantsCsv?: string
  title: string
  startsAt: string
  endsAt: string
  proctoring: boolean
  createdAt: string
  /** 시작 전 취소한 시각. 취소해도 지우지 않는다 */
  canceledAt?: string
  participants: Participant[]
  /** api 모드 목록: 대상자를 아직 안 불러온 회차의 인원 집계 (상세를 불러오면 participants 로 센다) */
  counts?: { participants: number; entered: number; submitted: number; unreviewed: number }
}

export type SessionPhase = 'upcoming' | 'live' | 'ended'
/** 취소한 회차는 끝난 것으로 본다 (화면에는 "취소" 표시) */
export const phaseOf = (s: Session, now = Date.now()): SessionPhase =>
  s.canceledAt ? 'ended' : now < Date.parse(s.startsAt) ? 'upcoming' : now < Date.parse(s.endsAt) ? 'live' : 'ended'

/** 목록 화면용 인원 집계: 상세를 불러왔으면 대상자로, 아니면 서버 집계로 */
export const participantCount = (s: Session) => (s.counts && !s.participants.length ? s.counts.participants : s.participants.length)
export const enteredCount = (s: Session) =>
  s.counts && !s.participants.length ? s.counts.entered : s.participants.filter((p) => p.enteredAt).length
export const openEventCount = (s: Session) =>
  s.counts && !s.participants.length ? s.counts.unreviewed : s.participants.reduce((n, p) => n + unreviewed(p), 0)

let seq = 500
const nid = (p: string) => `${p}-${++seq}`
const iso = (ms: number) => new Date(ms).toISOString()
const MIN = 60_000

const token = () => Array.from({ length: 16 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('')
// 입장 링크가 유일한 입장 방법이다(회차 공용 입장 코드 없음).
// api 모드에서는 토큰 원문이 서버에도 없어(해시만 저장) 링크를 복사할 수 없다. 메일 다시 보내기로 새 링크를 보낸다
export const CAN_COPY_INVITE_LINK = !CONSOLE_USES_API
export const inviteLink = (p: Participant) => `${location.origin}/entry?invite=inv_${p.id.replace(/\D/g, '')}${token().slice(0, 8)}`

const ev = (type: PEventType, at: string, o: Partial<PEvent> = {}): PEvent => ({
  id: nid('e'),
  type,
  at,
  durationMs: 0,
  ...(isCameraEvent(type) ? { snapshot: 'ok' as const } : {}),
  ...o,
})

// ── 처음 데이터 ──
function seed(): Session[] {
  const now = Date.now()
  const liveStart = now - 24 * MIN
  const ended1 = Date.parse('2026-11-11T09:40:00+09:00')
  const ended2 = Date.parse('2026-11-14T14:00:00+09:00')
  const at = (base: number, min: number) => iso(base + min * MIN)

  const endedParticipants: Participant[] = [
    { name: '김하늘', email: 'haneul@mail.test', file: 'att-261111-1841-avn', score: 96, items: { usage: 18, control: 15, decomposition: 10, delegation: 10, delivery: 30, potential: 13 }, turns: 10,
      events: [ev('TAB_HIDDEN', at(ended1, 2), { durationMs: 12000, review: 'OK', reviewNote: '응시자 문의: 감독 알림을 닫다가 탭이 바뀜', reviewedBy: '예시테크 담당자', reviewedAt: at(ended1, 85) })] },
    { name: '박서준', email: 'seojun@mail.test', file: 'att-261111-1841-al0', score: 93, items: { usage: 20, control: 15, decomposition: 10, delegation: 10, delivery: 30, potential: 8 }, turns: 10, events: [] },
    { name: '이도윤', email: 'doyun@mail.test', file: 'att-261111-1842-vl4', score: 96, items: { usage: 20, control: 15, decomposition: 10, delegation: 10, delivery: 30, potential: 11 }, turns: 10,
      events: [ev('HEAD_TURN', at(ended1, 21), { durationMs: 3500, confidence: 0.71, detail: '고개 48°' }), ev('WINDOW_BLUR', at(ended1, 33), { durationMs: 2000 })] },
    { name: '최유나', email: 'yuna@mail.test', file: 'att-261111-1842-2q', score: 68, items: { usage: 14, control: 10, decomposition: 2, delegation: 10, delivery: 22, potential: 10 }, turns: 4,
      events: [
        ev('PASTE', at(ended1, 14), { detail: '붙여넣기 840자', review: 'SUSPECT', reviewNote: '외부에서 840자 붙여넣기. 리포트 대화와 대조 필요', reviewedBy: '예시테크 담당자', reviewedAt: at(ended1, 90) }),
        ev('NO_FACE', at(ended1, 15), { durationMs: 7000, confidence: 0.93, detail: '얼굴 0개' }),
        ev('MULTI_FACE', at(ended1, 40), { durationMs: 4000, confidence: 0.58, detail: '얼굴 2개', snapshot: 'deleted' }),
      ] },
    { name: '정민재', email: 'minjae@mail.test', file: 'att-261111-1841-gmp', score: 45, items: { usage: 9, control: 13, decomposition: 2, delegation: 8, delivery: 10, potential: 3 }, turns: 4,
      events: [ev('FULLSCREEN_EXIT', at(ended1, 8), { durationMs: 9000 }), ev('PHONE', at(ended1, 27), { durationMs: 5000, confidence: 0.84, detail: '휴대폰 감지' })] },
  ].map((p, i) => ({
    id: nid('p'),
    name: p.name,
    email: p.email,
    invitedAt: at(ended1, -24 * 60),
    enteredAt: at(ended1, 1 + (i % 3) * 0.2),
    state: 'SUBMITTED' as const,
    aiTurns: p.turns,
    lastActiveAt: at(ended1, 55),
    reportFile: p.file,
    score: p.score,
    items: p.items,
    events: p.events,
  }))
  endedParticipants.push({ id: nid('p'), name: '한지우', email: 'jiwoo@mail.test', invitedAt: at(ended1, -24 * 60), state: 'NOT_ENTERED', aiTurns: 0, events: [] })

  const liveNames = [
    ['오세린', 'serin@mail.test', 'SOLVING', 7, 0.2],
    ['윤태호', 'taeho@mail.test', 'SOLVING', 4, 1.5],
    ['강다은', 'daeun@mail.test', 'FOLLOWUP', 9, 0.4],
    ['서준혁', 'junhyuk@mail.test', 'DISCONNECTED', 2, 6],
    ['임채원', 'chaewon@mail.test', 'SOLVING', 5, 0.8],
    ['조현우', 'hyunwoo@mail.test', 'NOT_ENTERED', 0, 0],
  ] as const
  const liveParticipants: Participant[] = liveNames.map(([name, email, state, turns, idleMin], i) => ({
    id: nid('p'),
    name,
    email,
    invitedAt: at(liveStart, -2 * 24 * 60),
    enteredAt: state === 'NOT_ENTERED' ? undefined : at(liveStart, -3 + i * 0.4),
    state,
    aiTurns: turns,
    lastActiveAt: state === 'NOT_ENTERED' ? undefined : iso(now - idleMin * MIN),
    events:
      i === 1
        ? [ev('TAB_HIDDEN', at(liveStart, 9), { durationMs: 6000 })]
        : i === 3
          ? [ev('NO_FACE', at(liveStart, 17), { durationMs: 15000, confidence: 0.88, detail: '얼굴 0개' })]
          : [],
  }))

  return [
    {
      id: 's-2',
      companyId: 1,
      tasks: [{ id: 't-1', title: '주문 처리 장애 원인 분석', minutes: 60 }],
      title: '2026 하반기 백엔드 경력 실전 2차',
      startsAt: iso(liveStart),
      endsAt: iso(liveStart + 60 * MIN),
      proctoring: true,
      createdAt: at(liveStart, -3 * 24 * 60),
      participants: liveParticipants,
    },
    {
      id: 's-3',
      companyId: 1,
      tasks: [
        { id: 't-1', title: '주문 처리 장애 원인 분석', minutes: 60 },
        { id: 't-2', title: '신규 저가 요금제 출시 기획안', minutes: 60 },
      ],
      participantsCsv: '3차_대상자.csv',
      title: '2026 하반기 백엔드 경력 실전 3차',
      startsAt: iso(Math.ceil((now + 24 * 60 * MIN) / (60 * MIN)) * 60 * MIN),
      endsAt: iso(Math.ceil((now + 24 * 60 * MIN) / (60 * MIN)) * 60 * MIN + 60 * MIN),
      proctoring: true,
      createdAt: iso(now - 60 * MIN),
      participants: [
        { id: nid('p'), name: '배수아', email: 'sua@mail.test', invitedAt: iso(now - 50 * MIN), state: 'NOT_ENTERED', aiTurns: 0, events: [] },
        { id: nid('p'), name: '문건우', email: 'gunwoo@mail.test', invitedAt: iso(now - 50 * MIN), state: 'NOT_ENTERED', aiTurns: 0, events: [] },
      ],
    },
    {
      id: 's-1',
      companyId: 1,
      tasks: [{ id: 't-1', title: '주문 처리 장애 원인 분석', minutes: 60 }],
      title: '2026 하반기 백엔드 신입 실전',
      startsAt: iso(ended1),
      endsAt: iso(ended1 + 60 * MIN),
      proctoring: true,
      createdAt: at(ended1, -2 * 24 * 60),
      participants: endedParticipants,
    },
    {
      id: 's-4',
      companyId: 2,
      tasks: [{ id: 't-2', title: '신규 저가 요금제 출시 기획안', minutes: 60 }],
      title: '서비스 기획 인턴 실전',
      startsAt: iso(ended2),
      endsAt: iso(ended2 + 60 * MIN),
      proctoring: false,
      createdAt: at(ended2, -24 * 60),
      participants: [
        { id: nid('p'), name: '노은서', email: 'eunseo@mail.test', invitedAt: at(ended2, -600), enteredAt: at(ended2, 1), state: 'SUBMITTED', aiTurns: 8, lastActiveAt: at(ended2, 58), reportFile: 'att-261111-1842-l5r', score: 96, items: { usage: 20, control: 15, decomposition: 10, delegation: 10, delivery: 30, potential: 11 }, events: [] },
        { id: nid('p'), name: '황준서', email: 'junseo@mail.test', invitedAt: at(ended2, -600), enteredAt: at(ended2, 2), state: 'SUBMITTED', aiTurns: 2, lastActiveAt: at(ended2, 50), reportFile: 'att-261111-1843-anp', score: 60, items: { usage: 12, control: 8, decomposition: 2, delegation: 6, delivery: 22, potential: 10 }, events: [] },
      ],
    },
  ]
}

// ── 저장소 ──
let sessions: Session[] = CONSOLE_USES_API ? [] : seed()
type LoadState = { loading: boolean; error: string | null }
let loadState: LoadState = { loading: false, error: null }
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
const patchSession = (id: string, f: (s: Session) => Session) => {
  sessions = sessions.map((s) => (s.id === id ? f(s) : s))
  emit()
}
const setLoad = (next: LoadState) => {
  loadState = next
  emit()
}
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** 회차 과제 이름을 한 줄로 (목록·머리에 쓴다) */
export const taskTitles = (s: Session) => (s.tasks.length <= 1 ? (s.tasks[0]?.title ?? '') : `${s.tasks[0].title} 외 ${s.tasks.length - 1}개`)

/** 대상자 CSV 검사 (기획_결정사항 §1: 사이트 양식(이름,이메일)에 맞춘 CSV, 올리기 전에 중복·형식 오류를 미리 보여 준다) */
export type CsvRow = { line: number; name: string; email: string; error?: string }
export const CSV_TEMPLATE = '이름,이메일\n홍길동,gildong@example.com\n'
export function parseParticipantsCsv(text: string): CsvRow[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map((l) => l.trim())
  const rows: CsvRow[] = []
  const seen = new Set<string>()
  lines.forEach((l, i) => {
    if (!l || (i === 0 && /이름|name/i.test(l) && /이메일|email/i.test(l))) return
    const [name = '', email = '', ...rest] = l.split(',').map((x) => x.trim())
    const key = email.toLowerCase()
    let error: string | undefined
    if (rest.length) error = '열이 너무 많습니다 (이름,이메일 두 칸)'
    else if (!name) error = '이름이 비었습니다'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) error = '이메일 형식이 아닙니다'
    else if (seen.has(key)) error = '같은 이메일이 위에 있습니다'
    seen.add(key)
    rows.push({ line: i + 1, name, email, error })
  })
  return rows
}

export const getSessions = () => sessions
/** 불러오는 중·오류 (api 모드). 화면은 오류를 배너로 보여 준다 */
export const useSessionsLoad = () => useSyncExternalStore(subscribe, () => loadState)

export function useSessions() {
  useEffect(() => {
    if (CONSOLE_USES_API) void refreshSessions()
  }, [])
  return useSyncExternalStore(subscribe, () => sessions)
}
export function useSession(id: string | undefined) {
  useEffect(() => {
    if (CONSOLE_USES_API && id) void refreshSession(id)
  }, [id])
  return useSyncExternalStore(subscribe, () => sessions).find((s) => s.id === id)
}

// ── api 모드: 백엔드 응답 → 화면 모양 ──
let taskInfo: Map<string, SessionTask> | null = null
async function tasksById(): Promise<Map<string, SessionTask>> {
  if (taskInfo) return taskInfo
  try {
    const list = await consoleApi.tasks()
    taskInfo = new Map(list.map((t) => [t.id, { id: t.id, title: t.title, minutes: t.minutes }]))
  } catch {
    taskInfo = new Map() // 과제 이름을 못 읽어도 회차는 보여 준다 (ID 로 표시)
  }
  return taskInfo
}
const taskOf = (map: Map<string, SessionTask>, id: string): SessionTask => map.get(id) ?? { id, title: id, minutes: 0 }

function fromSummary(a: ApiSessionSummary, map: Map<string, SessionTask>, prev?: Session): Session {
  return {
    id: String(a.id),
    companyId: a.companyId,
    tasks: a.taskIds.map((t) => taskOf(map, t)),
    title: a.title,
    startsAt: a.startsAt,
    endsAt: a.endsAt,
    proctoring: a.proctoring,
    createdAt: a.createdAt,
    canceledAt: a.canceledAt ?? undefined,
    participantsCsv: prev?.participantsCsv,
    participants: prev?.participants ?? [],
    counts: { participants: a.participants, entered: a.entered, submitted: a.submitted, unreviewed: a.unreviewedEvents },
  }
}

/** 백엔드 역량 이름 → 화면 키 (Rubric.java 와 같은 이름) */
const ITEM_KEY_BY_NAME: Record<string, string> = {
  'AI 활용력': 'usage',
  'AI 통제력': 'control',
  '문제 분해력': 'decomposition',
  '위임 판단력': 'delegation',
  'AI 결과 도출력': 'delivery',
  '성과 잠재력': 'potential',
}

/** 상세 JSON 을 한 줄 설명으로 (붙여넣기 글자 수, 고개 각도 등) */
function detailText(type: string, raw: string | null): string | undefined {
  if (!raw) return undefined
  try {
    const d = JSON.parse(raw) as Record<string, unknown>
    if (type === 'PASTE' && typeof d.chars === 'number') return `붙여넣기 ${d.chars}자${typeof d.target === 'string' ? ` (${d.target})` : ''}`
    if (typeof d.faceCount === 'number') return `얼굴 ${d.faceCount}개`
    if (typeof d.yaw === 'number') return `고개 ${Math.round(Math.abs(d.yaw))}°`
    return Object.entries(d).map(([k, v]) => `${k} ${v}`).join(', ')
  } catch {
    return raw
  }
}

function fromEvent(e: ApiEvent): PEvent {
  return {
    id: String(e.id),
    type: e.type as PEventType,
    at: e.startedAt,
    durationMs: e.durationMs,
    confidence: e.confidence ?? undefined,
    detail: detailText(e.type, e.detail),
    snapshot: e.snapshot ?? undefined,
    review: e.review ?? undefined,
    reviewNote: e.reviewNote ?? undefined,
    reviewedBy: e.reviewedBy == null ? undefined : `회원 #${e.reviewedBy}`,
    reviewedAt: e.reviewedAt ?? undefined,
  }
}

function fromParticipant(p: ApiParticipant, events: PEvent[], row?: ApiResultRow): Participant {
  const state: PState = p.submittedAt ? 'SUBMITTED' : p.startedAt ? 'SOLVING' : 'NOT_ENTERED'
  const items = row?.score != null ? Object.fromEntries(Object.entries(row.items).map(([k, v]) => [ITEM_KEY_BY_NAME[k] ?? k, v])) : undefined
  return {
    id: String(p.id),
    name: p.name,
    email: p.email,
    invitedAt: p.invitedAt,
    enteredAt: p.enteredAt ?? undefined,
    state,
    // AI 대화 수·마지막 활동은 응시 기록(팀원 3)에 있어 아직 콘솔 API 로 오지 않는다
    aiTurns: 0,
    lastActiveAt: p.submittedAt ?? p.startedAt ?? p.enteredAt ?? undefined,
    inviteStatus: p.inviteStatus,
    inviteError: p.inviteError ?? undefined,
    remindedAt: p.remindedAt ?? undefined,
    score: row?.score ?? undefined,
    items,
    events,
  }
}

/** 회차 목록 다시 읽기. 이미 불러온 회차의 대상자는 그대로 둔다 */
export async function refreshSessions() {
  if (!CONSOLE_USES_API) return
  setLoad({ loading: true, error: null })
  try {
    const [list, map] = await Promise.all([consoleApi.sessions(), tasksById()])
    const prev = new Map(sessions.map((s) => [s.id, s]))
    sessions = list.map((a) => fromSummary(a, map, prev.get(String(a.id))))
    setLoad({ loading: false, error: null })
  } catch (e) {
    setLoad({ loading: false, error: errorText(e) })
  }
}

/** 회차 하나를 대상자·감독 이벤트·결과까지 다시 읽기 (상세 화면, 실시간 탭은 5초마다) */
export async function refreshSession(id: string) {
  if (!CONSOLE_USES_API) return
  try {
    const [detail, events, map] = await Promise.all([consoleApi.session(id), consoleApi.events(id), tasksById()])
    // 결과(점수)는 매니저만, 시작한 회차만. 감독관(403)·채점 전이면 점수 없이 보여 준다
    const results = detail.session.phase === 'UPCOMING' ? null : await consoleApi.results(id).catch(() => null)
    const rows = new Map((results?.rows ?? []).map((r) => [r.participantId, r]))
    const byParticipant = new Map<number, PEvent[]>()
    for (const e of events) byParticipant.set(e.participantId, [...(byParticipant.get(e.participantId) ?? []), fromEvent(e)])
    const prev = sessions.find((s) => s.id === id)
    const next: Session = {
      ...fromSummary(detail.session, map, prev),
      participants: detail.participants.map((p) => fromParticipant(p, byParticipant.get(p.id) ?? [], rows.get(p.id))),
    }
    sessions = prev ? sessions.map((s) => (s.id === id ? next : s)) : [next, ...sessions]
    setLoad({ loading: false, error: null })
  } catch (e) {
    setLoad({ loading: false, error: errorText(e) })
  }
}

// ── 바꾸기 (api 모드는 서버에 저장한 뒤 다시 읽는다) ──
export type NewSession = Omit<Session, 'id' | 'createdAt' | 'participants'>

export async function createSession(input: NewSession): Promise<Session> {
  if (!CONSOLE_USES_API) {
    const s: Session = { ...input, id: nid('s'), createdAt: new Date().toISOString(), participants: [] }
    sessions = [s, ...sessions]
    emit()
    return s
  }
  const created = await consoleApi.create({
    companyId: input.companyId,
    title: input.title,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    proctoring: input.proctoring,
    taskIds: input.tasks.map((t) => t.id),
  })
  const s = fromSummary(created, await tasksById())
  sessions = [s, ...sessions.filter((x) => x.id !== s.id)]
  emit()
  return s
}

export async function updateSession(id: string, patch: Partial<Pick<Session, 'title' | 'proctoring' | 'startsAt' | 'endsAt' | 'tasks'>>) {
  const cur = sessions.find((s) => s.id === id)
  if (!cur) return
  if (!CONSOLE_USES_API) {
    patchSession(id, (s) => ({ ...s, ...patch }))
    return
  }
  const next = { ...cur, ...patch }
  await consoleApi.update(id, {
    companyId: next.companyId,
    title: next.title,
    startsAt: next.startsAt,
    endsAt: next.endsAt,
    proctoring: next.proctoring,
    taskIds: next.tasks.map((t) => t.id),
  })
  await refreshSession(id)
}

/** 시작 전 취소. 지우지 않고 취소 기록을 남기며, 서버가 대상자에게 안내 메일을 보낸다 */
export async function cancelSession(id: string) {
  if (!CONSOLE_USES_API) {
    patchSession(id, (s) => ({ ...s, canceledAt: new Date().toISOString() }))
    return
  }
  await consoleApi.cancel(id)
  await refreshSession(id)
}

export type InviteResult = { added: number; rejected: { line: number; name: string; email: string; reason: string }[] }

export async function inviteParticipants(id: string, people: { name: string; email: string }[]): Promise<InviteResult> {
  if (!CONSOLE_USES_API) {
    const t = new Date().toISOString()
    patchSession(id, (s) => ({
      ...s,
      participants: [...s.participants, ...people.map((p) => ({ id: nid('p'), ...p, invitedAt: t, state: 'NOT_ENTERED' as const, aiTurns: 0, events: [] }))],
    }))
    return { added: people.length, rejected: [] }
  }
  const r = await consoleApi.addParticipants(id, people)
  await refreshSession(id)
  return r
}

/** 대상자 CSV 원본을 그대로 올린다 (서버가 원본을 보관하고 줄마다 검사). dryRun 이면 미리 보기만 */
export async function uploadParticipantsCsv(id: string, file: File, dryRun = false): Promise<InviteResult> {
  if (!CONSOLE_USES_API) {
    const rows = parseParticipantsCsv(await file.text())
    const ok = rows.filter((r) => !r.error)
    if (!dryRun) {
      await inviteParticipants(id, ok.map(({ name, email }) => ({ name, email })))
      patchSession(id, (s) => ({ ...s, participantsCsv: file.name }))
    }
    return { added: ok.length, rejected: rows.filter((r) => r.error).map((r) => ({ line: r.line, name: r.name, email: r.email, reason: r.error! })) }
  }
  const r = await consoleApi.uploadCsv(id, file, dryRun)
  if (!dryRun) {
    patchSession(id, (s) => ({ ...s, participantsCsv: file.name }))
    await refreshSession(id)
  }
  return r
}

export async function removeParticipant(id: string, pid: string) {
  if (CONSOLE_USES_API) {
    await consoleApi.removeParticipant(id, pid)
    await refreshSession(id)
    return
  }
  patchSession(id, (s) => ({ ...s, participants: s.participants.filter((p) => p.id !== pid) }))
}

/** 초대 메일 다시 보내기 (새 링크, 이전 링크는 막힘) */
export async function resendInvite(id: string, pid: string) {
  if (CONSOLE_USES_API) {
    await consoleApi.resendInvite(id, pid)
    await refreshSession(id)
  }
}

export async function reviewEvent(sid: string, pid: string, eid: string, review: Review | undefined, note: string | undefined, by: string) {
  let saved: Partial<PEvent> | null = null
  if (CONSOLE_USES_API) {
    const e = fromEvent(await consoleApi.review(sid, eid, review ?? null, note))
    saved = { review: e.review, reviewNote: e.reviewNote, reviewedBy: e.reviewedBy, reviewedAt: e.reviewedAt }
  }
  patchSession(sid, (s) => ({
    ...s,
    participants: s.participants.map((p) =>
      p.id !== pid
        ? p
        : {
            ...p,
            events: p.events.map((e) =>
              e.id !== eid
                ? e
                : saved
                  ? { ...e, ...saved }
                  : review
                    ? { ...e, review, reviewNote: note ?? e.reviewNote, reviewedBy: by, reviewedAt: new Date().toISOString() }
                    : { ...e, review: undefined, reviewNote: undefined, reviewedBy: undefined, reviewedAt: undefined },
            ),
          },
    ),
  }))
}

/** 실시간 현황 갱신: api 모드는 서버에서 다시 읽고, mock 모드는 활동을 흉내 낸다 */
export function tickLive(id: string) {
  if (CONSOLE_USES_API) void refreshSession(id)
  else mockTick(id)
}

/** 실시간 현황 흉내: 응시자 활동과 감독 이벤트를 조금씩 바꾼다 */
function mockTick(id: string) {
  const now = Date.now()
  const r = Math.random
  patchSession(id, (s) => ({
    ...s,
    participants: s.participants.map((p) => {
      if (p.state === 'SOLVING' || p.state === 'FOLLOWUP') {
        const next: Participant = { ...p }
        if (r() < 0.6) next.lastActiveAt = new Date(now - Math.floor(r() * 8000)).toISOString()
        if (r() < 0.25) next.aiTurns = p.aiTurns + 1
        if (p.state === 'SOLVING' && r() < 0.04) next.state = 'FOLLOWUP'
        else if (p.state === 'FOLLOWUP' && r() < 0.15) next.state = 'SUBMITTED'
        if (s.proctoring && r() < 0.08) {
          const types: PEventType[] = ['TAB_HIDDEN', 'WINDOW_BLUR', 'HEAD_TURN', 'NO_FACE', 'PASTE']
          const type = types[Math.floor(r() * types.length)]
          next.events = [
            ...p.events,
            ev(type, new Date(now).toISOString(), {
              durationMs: type === 'PASTE' ? 0 : 1000 + Math.floor(r() * 9000),
              ...(isCameraEvent(type) ? { confidence: Math.round((0.55 + r() * 0.43) * 100) / 100 } : {}),
              ...(type === 'PASTE' ? { detail: `붙여넣기 ${100 + Math.floor(r() * 700)}자` } : type === 'HEAD_TURN' ? { detail: `고개 ${30 + Math.floor(r() * 40)}°` } : {}),
            }),
          ]
        }
        return next
      }
      if (p.state === 'DISCONNECTED' && r() < 0.2) return { ...p, state: 'SOLVING', lastActiveAt: new Date(now).toISOString() }
      if (p.state === 'NOT_ENTERED' && r() < 0.05) return { ...p, state: 'SOLVING', enteredAt: new Date(now).toISOString(), lastActiveAt: new Date(now).toISOString() }
      return p
    }),
  }))
}

// ── 샘플 리포트 (응시자 상세에서 필요할 때만 불러온다) ──
const REPORTS = import.meta.glob<{ default: Report }>('./sampleReports/*.json')
export async function loadReport(file: string): Promise<Report | null> {
  const key = `./sampleReports/sample__${file}__1.json`
  const f = REPORTS[key]
  return f ? (await f()).default : null
}

export const unreviewed = (p: Participant) => p.events.filter((e) => !e.review).length
export const suspects = (p: Participant) => p.events.filter((e) => e.review === 'SUSPECT').length
