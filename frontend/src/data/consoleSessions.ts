// 콘솔 회차 화면 공용: 표시용 상수(이벤트 이름, 응시 상태 이름)와 백엔드 불러오기 훅.
// 데이터는 모두 consoleApi(백엔드, AWS RDS)에서 온다. 목업 저장소는 2026-11-19에 지웠다.
import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { consoleApi, type ConsoleTaskSummary, type EventType, type ParticipantView, type Phase, type ProctorEventView, type ResultState } from '../consoleApi'

// ── 감독 이벤트 ──
export const EVENT_LABEL: Record<EventType, string> = {
  TAB_HIDDEN: '탭 전환',
  WINDOW_BLUR: '창 이탈',
  MOUSE_LEAVE: '마우스 이탈',
  PASTE: '외부 붙여넣기',
  FULLSCREEN_EXIT: '전체 화면 해제',
  NO_FACE: '얼굴 없음',
  MULTI_FACE: '여러 얼굴',
  HEAD_TURN: '고개 돌림',
  HEAD_DOWN: '고개 숙임',
  GAZE_AWAY: '시선 이탈',
  TORSO_SHIFT: '자세 이동',
  TORSO_TURN: '몸 돌림',
  HAND_MISSING: '손 안 보임',
  HAND_MOVED: '손 움직임',
  ARM_MOVE: '팔 움직임',
  PHONE: '휴대폰',
  EXTRA_SCREEN: '다른 화면',
  BOOK: '책·종이',
  PHONE_DISCONNECTED: '휴대폰 카메라 끊김',
  CONNECTION_LOST: '시험 화면 연결 끊김',
  LINK_EXPIRED: '유예 시간 초과(링크 만료)',
  LINK_RESTORED: '담당자가 링크 복구',
  SCREEN_STOPPED: '화면 공유 중단',
  SCREEN_PARTIAL: '창·탭만 공유',
  SCREEN_RESTARTED: '화면 공유 재시작',
}
/** 카메라(PC·휴대폰)에서 나온 이벤트인지. 브라우저·화면 공유 이벤트는 사진이 없다 */
export const isCameraEvent = (e: Pick<ProctorEventView, 'source'>) => e.source === 'PC_CAM' || e.source === 'PHONE_CAM'
/** 판정 대기 건수: 카메라 이벤트만 센다 (브라우저 이벤트는 이력만 보여 주고 판정하지 않는다) */
export const unreviewedOf = (events: ProctorEventView[], participantId: number) => events.filter((e) => e.participantId === participantId && isCameraEvent(e) && !e.review).length
export const suspectsOf = (events: ProctorEventView[], participantId: number) => events.filter((e) => e.participantId === participantId && e.review === 'SUSPECT').length

// ── 응시 상태 (백엔드 ResultState 와 같은 네 가지) ──
export const PSTATE_LABEL: Record<ResultState, string> = {
  NOT_ENTERED: '미입장',
  WAITING: '입장 (시작 전)',
  SOLVING: '응시 중',
  SUBMITTED: '제출',
}
export const stateOf = (p: ParticipantView): ResultState => (p.submittedAt ? 'SUBMITTED' : p.startedAt ? 'SOLVING' : p.enteredAt ? 'WAITING' : 'NOT_ENTERED')

// ── 회차 단계 ──
export const PHASE_LABEL: Record<Phase, string> = { UPCOMING: '예정', LIVE: '진행 중', ENDED: '종료', CANCELED: '취소됨' }
/** 회사 이름 API 가 아직 없어 회사는 번호로 보인다 */
export const companyLabel = (id: number) => `회사 #${id}`

// ── 대상자 CSV 미리 보기 (올리기 전 형식 검사. 실제 등록은 백엔드 importCsv) ──
export type CsvRow = { line: number; name: string; email: string; error?: string }
export const CSV_TEMPLATE = '이름,이메일\n홍길동,gildong@example.com\n'
export function parseParticipantsCsv(text: string): CsvRow[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).map((l) => l.trim())
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

// ── 불러오기 훅 ──
export type Loaded<T> = { data: T | null; error: string | null; loading: boolean; reload: () => void; setData: (f: (d: T | null) => T | null) => void }

/**
 * 백엔드에서 불러온다. key 가 바뀌면 다시 부르고, pollMs 를 주면 그 간격으로 조용히 다시 부른다
 * (다시 부를 때는 이전 데이터를 그대로 두고 바꾸기만 한다).
 */
export function useLoad<T>(key: string | null, fetcher: () => Promise<T>, pollMs?: number): Loaded<T> {
  const queryClient = useQueryClient()
  const q = useQuery<T | null>({
    queryKey: [key],
    queryFn: fetcher,
    enabled: key != null,
    refetchInterval: pollMs || false,
  })
  const { refetch } = q
  const reload = useCallback(() => void refetch(), [refetch])
  const setData = useCallback(
    (f: (d: T | null) => T | null) => queryClient.setQueryData<T | null>([key], (d) => f(d ?? null)),
    [queryClient, key],
  )
  return {
    data: key == null ? null : (q.data ?? null),
    error: key == null || !q.error ? null : q.error instanceof Error ? q.error.message : String(q.error),
    loading: key != null && q.isPending,
    reload,
    setData,
  }
}

/** 콘솔 과제 목록 → ID 로 찾기 (회차는 과제 ID 만 갖고 있다) */
export function useTaskMap() {
  const r = useLoad('console-tasks', () => consoleApi.tasks())
  const map = new Map<string, ConsoleTaskSummary>((r.data ?? []).map((t) => [t.id, t]))
  return { ...r, map }
}
export const taskTitle = (map: Map<string, ConsoleTaskSummary>, id: string) => map.get(id)?.title ?? id
/** 회차 과제 이름을 한 줄로 (목록·머리에 쓴다) */
export const taskTitlesOf = (map: Map<string, ConsoleTaskSummary>, ids: string[]) =>
  ids.length <= 1 ? (ids[0] ? taskTitle(map, ids[0]) : '') : `${taskTitle(map, ids[0])} 외 ${ids.length - 1}개`
