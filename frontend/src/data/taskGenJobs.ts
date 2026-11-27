// 만드는 중인 과제 페이지 (DESIGN.md §7-9-2-1). 목록·내용 화면 규칙은 모두 이 파일의 순수 함수에 둔다.
// 백엔드 응답 모양(GenContent)은 taskGen.ts 한 곳에만 있다.
import { fmtClock, type GenContent, type GenMode, type GenTrack, type JobRow, type JobState } from './taskGen.ts'

/** 대기 + 진행 중인 작업 수 (버튼 배지) */
export const activeCount = (rows: Pick<JobRow, 'status'>[] | null): number => (rows ?? []).filter((j) => j.status === 'QUEUED' || j.status === 'RUNNING').length

/** 끝난 작업(더 안 바뀐다) */
export const isEnded = (status: JobState | null | undefined): boolean => status === 'DONE' || status === 'FAILED' || status === 'CANCELED'

/** 목록 조회 간격: 도는 작업이 있으면(또는 아직 못 받았으면) 3초, 없으면 길게(30초) */
export const JOBS_BUSY_MS = 3000
export const JOBS_IDLE_MS = 30000
export const jobsPollMs = (rows: Pick<JobRow, 'status'>[] | null): number => (rows === null || activeCount(rows) > 0 ? JOBS_BUSY_MS : JOBS_IDLE_MS)

/** 이전 목록에서는 DONE 이 아니었는데 이번에 DONE 이 된 작업 번호. 이전 목록이 없으면(첫 조회) 없음 */
export function newlyDone(prev: Pick<JobRow, 'jobId' | 'status'>[] | null, next: Pick<JobRow, 'jobId' | 'status'>[]): string[] {
  if (!prev) return []
  const before = new Map(prev.map((j) => [j.jobId, j.status]))
  return next.filter((j) => j.status === 'DONE' && before.has(j.jobId) && before.get(j.jobId) !== 'DONE').map((j) => j.jobId)
}

/** 만드는 중인 과제 페이지 주소. jobId 가 있으면 그 작업을 고른 채로 연다 */
export const generatingHref = (jobId?: string | null): string => (jobId ? `/console/tasks/generating?job=${encodeURIComponent(jobId)}` : '/console/tasks/generating')

/** 만들어진 내용 한 덩어리: 이름 + 줄들 (한 줄이면 문단, 여러 줄이면 목록) */
export type ContentBlock = { label: string; lines: string[]; adminOnly?: boolean }
export type ContentKey = 'blueprint' | 'writing' | 'code' | 'answer' | 'questions' | 'fillers'
/** ready=false 면 아직 안 나온 단계('아직 만들지 않았어요' 자리 표시). adminOnly 면 '검수용' 배지 */
export type ContentSection = { key: ContentKey; title: string; ready: boolean; adminOnly: boolean; blocks: ContentBlock[] }

const list = <T,>(v: T[] | null | undefined): T[] => (Array.isArray(v) ? v : [])
const nonEmpty = (v: string | null | undefined): string[] => (v && v.trim() ? [v.trim()] : [])
const chars = (n: number | null | undefined) => (typeof n === 'number' ? ` · ${n.toLocaleString('ko-KR')}자` : '')

function block(label: string, lines: string[], adminOnly?: boolean): ContentBlock[] {
  return lines.length ? [{ label, lines, ...(adminOnly ? { adminOnly } : {}) }] : []
}

/**
 * content 응답 → 단계 순서(설계도 → 글 → 코드/문항 → 정답 → 관련 자료)의 섹션 목록.
 * 직군에 없는 단계는 뺀다(비개발엔 코드 없음, 개발엔 문항 없음). null 이거나 안 온 단계는 ready=false.
 * content 자체가 없으면(null) 모든 단계가 자리 표시다.
 */
export function contentSections(c: GenContent | null, track: GenTrack | null): ContentSection[] {
  const t = track ?? c?.form?.track ?? null
  const bp = c?.blueprint
  const out: ContentSection[] = []
  out.push({
    key: 'blueprint',
    title: '설계도',
    ready: !!bp,
    adminOnly: false,
    blocks: !bp
      ? []
      : [
          ...block('제목', nonEmpty(bp.title)),
          ...block('요약', nonEmpty(bp.summary)),
          ...block('상황', nonEmpty(bp.scenario)),
          ...block('분류', nonEmpty(bp.category)),
          ...block('역량', list(bp.competencies)),
          ...block('공개 API', list(bp.api)),
          ...block('예시', list(bp.examples).map((e) => `${e.input} → ${e.expected}`)),
          ...block('결함 (무엇을 · 어디에)', list(bp.flaws).map((f) => `${f.what} · ${f.where}`), true),
          ...block(
            '판단 지점',
            list(bp.judgments).map((j) => (list(j.options).length ? `${j.question} (${list(j.options).join(' / ')})` : j.question)),
          ),
          ...block('필요한 파일', list(bp.neededFiles)),
          ...block('관련 자료', [
            ...list(bp.fillers).map((f) => `${f.path}${f.summary ? ` — ${f.summary}` : ''}${f.confusing ? ' (헷갈리게 둔 자료)' : ''}`),
            ...list(bp.docs).map((d) => `${d.path}${d.role ? ` — ${d.role}` : ''}`),
          ]),
          ...block('문항 계획', list(bp.questionPlan)),
        ],
  })
  const w = c?.writing
  out.push({
    key: 'writing',
    title: '글',
    ready: !!w,
    adminOnly: false,
    blocks: !w
      ? []
      : [
          ...block('설명', list(w.description)),
          ...block('요구사항', list(w.requirements)),
          ...block('NOTES 요약', nonEmpty(w.notes)),
          ...block('문서 목록', list(w.documents).map((d) => `${d.path}${chars(d.chars)}`)),
        ],
  })
  if (t !== 'BIZ') {
    out.push({ key: 'code', title: '시작 코드', ready: !!c?.code, adminOnly: false, blocks: c?.code ? block('파일', list(c.code.files).map((f) => `${f.path}${chars(f.chars)}`)) : [] })
  }
  if (t !== 'DEV') {
    const q = c?.questions
    out.push({
      key: 'questions',
      title: '문항',
      ready: !!q,
      adminOnly: false,
      blocks: q ? block('문항', list(q).map((x) => `${x.seq != null ? `${x.seq}. ` : ''}${x.type ? `[${x.type}] ` : ''}${x.content ?? ''}`.trim())) : [],
    })
  }
  const a = c?.answer
  out.push({
    key: 'answer',
    title: '정답',
    ready: !!a,
    adminOnly: true,
    blocks: !a
      ? []
      : [
          ...block('숨은 테스트', list(a.hiddenTests).map((h) => `${h.path}${list(h.methods).length ? ` — ${list(h.methods).join(', ')}` : ''}`)),
          ...block('오답 · 다른 풀이', typeof a.wrongFixes === 'number' || typeof a.altSolutions === 'number' ? [`오답 ${a.wrongFixes ?? 0}개 · 다른 풀이 ${a.altSolutions ?? 0}개`] : []),
        ],
  })
  const f = c?.fillers
  out.push({ key: 'fillers', title: '관련 자료', ready: !!f, adminOnly: false, blocks: f ? block('파일', list(f.files).map((x) => `${x.path}${chars(x.chars)}`)) : [] })
  return out
}

/** 방식 글: 바로 만들기 / 배치 · 마감 HH:MM */
export function modeLabel(mode: GenMode | null | undefined, deadlineAt?: string | null): string {
  if (mode !== 'BATCH') return '일반'
  const d = fmtClock(deadlineAt)
  return d ? `절약 · 마감 ${d}` : '절약'
}
