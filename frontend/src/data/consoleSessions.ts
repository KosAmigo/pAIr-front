// 콘솔 회차 목업 저장소 (DESIGN.md §7-9-4). 테이블 companies, exam_sessions, exam_participants, proctor_events 를
// 화면에서 쓰기 좋게 묶었다. 진행 중 회차는 지금 시각 기준으로 만들고, 실시간 현황은 tickLive 로 흉내 낸다.
// 새로 고치면 처음 상태로 돌아간다.
import { useSyncExternalStore } from 'react'
import type { Report } from '../api'

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

export type PEventType = 'TAB_HIDDEN' | 'WINDOW_BLUR' | 'PASTE' | 'FULLSCREEN_EXIT' | 'NO_FACE' | 'MULTI_FACE' | 'HEAD_TURN' | 'PHONE'
export const EVENT_LABEL: Record<PEventType, string> = {
  TAB_HIDDEN: '탭 전환',
  WINDOW_BLUR: '창 이탈',
  PASTE: '외부 붙여넣기',
  FULLSCREEN_EXIT: '전체 화면 해제',
  NO_FACE: '얼굴 없음',
  MULTI_FACE: '여러 얼굴',
  HEAD_TURN: '고개 돌림',
  PHONE: '휴대폰',
}
export const isCameraEvent = (t: PEventType) => t === 'NO_FACE' || t === 'MULTI_FACE' || t === 'HEAD_TURN' || t === 'PHONE'

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
  participants: Participant[]
}

export type SessionPhase = 'upcoming' | 'live' | 'ended'
export const phaseOf = (s: Session, now = Date.now()): SessionPhase =>
  now < Date.parse(s.startsAt) ? 'upcoming' : now < Date.parse(s.endsAt) ? 'live' : 'ended'

let seq = 500
const nid = (p: string) => `${p}-${++seq}`
const iso = (ms: number) => new Date(ms).toISOString()
const MIN = 60_000

const token = () => Array.from({ length: 16 }, () => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('')
// 입장 링크가 유일한 입장 방법이다(회차 공용 입장 코드 없음)
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
let sessions: Session[] = seed()
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
export const useSessions = () => useSyncExternalStore(subscribe, () => sessions)
export function useSession(id: string | undefined) {
  return useSessions().find((s) => s.id === id)
}

export function createSession(input: Omit<Session, 'id' | 'createdAt' | 'participants'>) {
  const s: Session = { ...input, id: nid('s'), createdAt: new Date().toISOString(), participants: [] }
  sessions = [s, ...sessions]
  emit()
  return s
}
export function updateSession(id: string, patch: Partial<Session>) {
  patchSession(id, (s) => ({ ...s, ...patch }))
}
export function deleteSession(id: string) {
  sessions = sessions.filter((s) => s.id !== id)
  emit()
}

export function inviteParticipants(id: string, people: { name: string; email: string }[]) {
  const t = new Date().toISOString()
  patchSession(id, (s) => ({
    ...s,
    participants: [...s.participants, ...people.map((p) => ({ id: nid('p'), ...p, invitedAt: t, state: 'NOT_ENTERED' as const, aiTurns: 0, events: [] }))],
  }))
}
export function removeParticipant(id: string, pid: string) {
  patchSession(id, (s) => ({ ...s, participants: s.participants.filter((p) => p.id !== pid) }))
}

export function reviewEvent(sid: string, pid: string, eid: string, review: Review | undefined, note: string | undefined, by: string) {
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
                : review
                  ? { ...e, review, reviewNote: note ?? e.reviewNote, reviewedBy: by, reviewedAt: new Date().toISOString() }
                  : { ...e, review: undefined, reviewNote: undefined, reviewedBy: undefined, reviewedAt: undefined },
            ),
          },
    ),
  }))
}

/** 실시간 현황 흉내: 응시자 활동과 감독 이벤트를 조금씩 바꾼다 */
export function tickLive(id: string) {
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
