// 테스트용 가짜 서버. page.route 로 /api 응답을 넣고, 관리자 로그인 상태를 만든다.
// 앱 코드나 vite 설정에는 아무것도 넣지 않는다.
import type { Page } from '@playwright/test'
import type { AuthUser } from '../src/auth/auth'

export type SentRequest = { method: string; path: string; body: any }

type Task = Record<string, unknown>
const task = (id: string, o: Task): Task => ({
  id, type: 'dev', title: id, minutes: 40, usage: 'SELF', parentId: null, status: 'OPEN', publishedAt: null,
  updatedAt: '2026-11-20T00:00:00Z', createdAt: `2026-11-${10 + id.length}T00:00:00Z`, generated: true, checksOk: true, difficulty: '보통', ...o,
})

/** 목록 화면용 과제: 자가진단 3(개발 2, 비개발 1), 실전 1, 검수 전 2(개발 1, 비개발 1) */
export const TASKS: Task[] = [
  task('A1', { title: '쿠폰 할인 계산', summary: '쿠폰 두 장 중복 적용 함정', track: 'DEV', competencies: ['control', 'usage'] }),
  task('A22', { title: '재고 차감 동시성', summary: '락 없이 읽고 쓰면 음수', track: 'DEV' }),
  task('B1', { title: '요금제 개편안 손익 비교', summary: '표의 단위를 놓치기 쉬워요', track: 'BIZ', type: 'biz' }),
  task('C1', { title: '실전 환불 정책 분석', summary: '예외 조항', track: 'BIZ', type: 'biz', usage: 'LIVE', competencies: ['delivery'] }),
  task('D1', { title: '검수 전 로그 파서', summary: '경계값', track: 'DEV', status: 'HIDDEN', checksOk: false }),
  task('D22', { title: '검수 전 매출 보고서', summary: '합계 오류', track: 'BIZ', type: 'biz', status: 'HIDDEN' }),
]

const suggestion = (n: number, competencies: string[]) => ({
  situation: `상황 ${n}: 주문 취소 후 재고가 복구되지 않는다`,
  trap: `함정 ${n}: 취소 이벤트가 두 번 와도 한 번만 복구해야 함`,
  trapType: ['경계값', '중복 적용', '동시성'][n % 3],
  competencies,
  why: `왜 좋은 문제인가 ${n}: AI가 흔히 놓치는 지점이라 통제력을 보기 좋아요.`,
})

/** 자동 생성 미리보기 주제 하나 */
const autoTopic = (n: number) => ({
  situation: `자동 주제 ${n}: 환불 금액이 소수점에서 틀어진다`,
  trap: `자동 함정 ${n}: 반올림 순서가 바뀌면 합계가 달라짐`,
  trapType: `R${(n % 6) + 1} 반올림`,
  competencies: ['control', 'usage'],
})

/** 오타 주제. 이 주제를 보내면 topicCheck.ok=false 로 답한다 */
export const TYPO_TOPIC = '쿠뽕'

export async function mockApi(page: Page, user: AuthUser = { id: 1, email: 'admin@example.test', name: '관리자', role: 'ADMIN', companyId: null, companyName: null, emailVerified: true }) {
  const sent: SentRequest[] = []
  await page.addInitScript((authUser) => {
    localStorage.setItem('pair.auth', JSON.stringify({ token: 't', user: authUser }))
  }, user)
  let polls = 0
  // 자동 생성으로 만든 작업 목록 (GET /jobs 가 이걸 돌려준다)
  let autoJobs: Record<string, unknown>[] = []
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const req = route.request()
    const path = new URL(req.url()).pathname
    const raw = req.postData()
    const body = raw ? JSON.parse(raw) : null
    const json = (data: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
    if (path === '/api/auth/me') return json(user)
    if (path === '/api/console/tasks') return json(TASKS)
    // 과제 상세: 카드를 눌러 상세로 갈 때 화면이 터지지 않을 만큼만
    const detail = path.match(/^\/api\/console\/tasks\/([^/]+)$/)
    if (detail) {
      const summary = TASKS.find((t) => t.id === decodeURIComponent(detail[1]))
      if (summary) return json({ summary, definition: { id: summary.id, title: summary.title, requirements: [], d4Minutes: null, requiredHeadings: null } })
    }
    if (path === '/api/admin/task-gen/suggestions') {
      sent.push({ method: req.method(), path, body })
      const base = (body.track === 'DEV' ? 0 : 10) + (body.exclude?.length ?? 0)
      return json({
        topicCheck: body.topic === TYPO_TOPIC ? { ok: false, understood: '쿠폰 할인 계산', message: '오타로 보여서 가까운 주제로 이해했어요.' } : null,
        suggestions: [suggestion(base + 1, ['control']), suggestion(base + 2, ['usage', 'delegation']), suggestion(base + 3, ['decomposition', 'delivery'])],
      })
    }
    if (path === '/api/admin/task-gen/auto/preview') {
      sent.push({ method: req.method(), path, body })
      const seen = body.exclude?.length ?? 0
      return json(Array.from({ length: body.count }, (_, i) => autoTopic(seen + i + 1)))
    }
    if (path === '/api/admin/task-gen/auto' && req.method() === 'POST') {
      sent.push({ method: req.method(), path, body })
      const n: number = body.topics?.length ?? body.count
      const at = Date.now()
      // 첫 작업은 진행 중, 마지막(3개 이상일 때)은 완료, 나머지는 대기 1, 2, …
      let queued = 0
      autoJobs = Array.from({ length: n }, (_, i) => {
        const state = i === 0 ? 'RUNNING' : i === n - 1 && n > 2 ? 'DONE' : 'QUEUED'
        return {
          jobId: `a${i + 1}`, batchId: 'b1', status: state, step: state === 'RUNNING' ? '설계도 작성 중' : null,
          taskCode: state === 'DONE' ? 'N7' : null, passed: state === 'DONE' ? true : null,
          checks: state === 'DONE' ? [{ name: '컴파일', ok: true, detail: '' }, { name: '분량 대비 시간', ok: false, level: 'warn', detail: '' }] : [],
          error: null, mode: body.mode, deadlineAt: body.mode === 'BATCH' ? new Date(2026, 10, 26, 15, 5).toISOString() : null,
          queuePosition: state === 'QUEUED' ? ++queued : null,
          topic: body.topics?.[i]?.situation ?? `서버가 고른 주제 ${i + 1}`, track: body.track, minutes: body.minutes, createdAt: new Date(at + i).toISOString(),
        }
      })
      return json({ batchId: 'b1', jobIds: autoJobs.map((j) => j.jobId) }, 202)
    }
    if (path === '/api/admin/task-gen/jobs') return json(autoJobs)
    const cancel = path.match(/^\/api\/admin\/task-gen\/(a\d+)\/cancel$/)
    if (cancel && req.method() === 'POST') {
      sent.push({ method: req.method(), path, body })
      autoJobs = autoJobs.map((j) => (j.jobId === cancel[1] ? { ...j, status: 'CANCELED', queuePosition: null } : j))
      return json(autoJobs.find((j) => j.jobId === cancel[1]))
    }
    if (path === '/api/admin/task-gen' && req.method() === 'POST') {
      sent.push({ method: req.method(), path, body })
      return json({ jobId: 'j1' })
    }
    if (path.startsWith('/api/admin/task-gen/j1')) {
      polls++
      return json({ status: polls > 1 ? 'DONE' : 'RUNNING', step: polls > 1 ? '완료' : '설계도 작성 중', taskCode: 'N1', checks: [{ name: '컴파일', ok: true, detail: '' }, { name: '분량 대비 시간', ok: false, level: 'warn', detail: '40분 치고 분량이 적어요' }], error: null })
    }
    return json([])
  })
  return { sent }
}
