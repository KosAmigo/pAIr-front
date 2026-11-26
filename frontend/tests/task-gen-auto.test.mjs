// AI 과제 만들기 – 자동 생성·진행 목록 데이터 함수 (2026-11-26). 화면 규칙은 모두 data/taskGen.ts 의 순수 함수에 있다.
import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { ApiError } from '../src/api.ts'
import {
  autoRequest,
  buildGenRequest,
  canCancel,
  cancelErrorMessage,
  clampCount,
  fmtClock,
  groupJobs,
  groupSummary,
  jobView,
  pollJob,
  previewRequest,
  removeTopic,
  rerollExclude,
  taskGenApi,
} from '../src/data/taskGen.ts'

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

const job = (o) => ({ status: 'RUNNING', step: '생성 중', taskCode: null, checks: [], error: null, ...o })
const row = (o) => ({ jobId: 'j', status: 'RUNNING', step: null, taskCode: null, checks: [], error: null, track: 'DEV', ...o })
/** 이 PC 시간대의 h시 m분 (화면의 HH:MM 이 시간대와 상관없이 같게 나오도록) */
const clock = (h, m) => new Date(2026, 10, 26, h, m).toISOString()

test('pollJob 은 대기(QUEUED) 동안에도 계속 조회하고 CANCELED 에서 멈춘다', async () => {
  const seq = [job({ status: 'QUEUED', queuePosition: 2 }), job({ status: 'QUEUED', queuePosition: 1 }), job(), job({ status: 'CANCELED' })]
  const seen = []
  const end = await pollJob('j', (j) => seen.push(j.status), { signal: new AbortController().signal, intervalMs: 1, fetchJob: async () => seq.shift() })
  assert.deepEqual(seen, ['QUEUED', 'QUEUED', 'RUNNING', 'CANCELED'])
  assert.equal(end.status, 'CANCELED')
})

test('jobView: 대기 순번, 진행 단계, 배치 대기·마감', () => {
  assert.deepEqual(jobView(row({ status: 'QUEUED', queuePosition: 3 })), { tone: 'wait', label: '대기 3번째', sub: null, done: false })
  assert.equal(jobView(row({ status: 'QUEUED' })).label, '대기 중')
  // 배치 작업은 대기 중에도 마감을 같이 보인다
  assert.equal(jobView(row({ status: 'QUEUED', queuePosition: 1, mode: 'BATCH', deadlineAt: clock(9, 5) })).sub, '마감 09:05')
  // 진행: 기존 toGenStep·genDetail 그대로
  assert.deepEqual(jobView(row({ step: '설계도 작성 중' })), { tone: 'run', label: '생성 중', sub: '설계도 작성 중', done: false })
  assert.equal(jobView(row({ step: '관문 검사 중' })).label, '확인 중')
  assert.equal(jobView(row({ step: '다시 생성 중' })).label, '다시 생성 중')
  assert.equal(jobView(row({ step: '설계도 작성 중', mode: 'BATCH', deadlineAt: clock(15, 30) })).sub, '설계도 작성 중 · 마감 15:30')
  // waitingBatch 가 있으면 배치 대기, 없으면(백엔드가 아직 안 줌) 그냥 진행 단계
  assert.deepEqual(jobView(row({ step: '글 작성 중', waitingBatch: true, mode: 'BATCH', deadlineAt: clock(18, 30) })), { tone: 'batch', label: '배치 대기 중', sub: '마감 18:30', done: false })
  assert.equal(jobView(row({ step: '글 작성 중', mode: 'BATCH' })).tone, 'run')
})

test('jobView: 완료 요약, 실패, 취소', () => {
  const ok = { name: 'a', ok: true, detail: '' }
  const warn = { name: 'b', ok: false, level: 'warn', detail: '' }
  const bad = { name: 'c', ok: false, detail: '' }
  assert.deepEqual(jobView(row({ status: 'DONE', passed: true, checks: [ok, ok] })), { tone: 'done', label: '완료', sub: '통과 2 · 경고 0 · 실패 0', done: true })
  assert.equal(jobView(row({ status: 'DONE', passed: true, checks: [ok, warn] })).tone, 'warn')
  const failed = jobView(row({ status: 'DONE', passed: false, checks: [ok, bad, warn] }))
  assert.deepEqual([failed.tone, failed.label, failed.sub], ['fail', '완료 · 확인 실패', '통과 1 · 경고 1 · 실패 1'])
  assert.equal(jobView(row({ status: 'DONE', passed: false, checks: [] })).label, '완료 · 확인 실패') // passed=false 면 검사 목록이 비어도 실패
  assert.deepEqual(jobView(row({ status: 'FAILED', error: '모델 오류' })), { tone: 'fail', label: '실패', sub: '모델 오류', done: true })
  assert.deepEqual(jobView(row({ status: 'CANCELED' })), { tone: 'cancel', label: '취소됨', sub: null, done: true })
})

test('fmtClock: HH:MM, 잘못된 값은 null', () => {
  assert.equal(fmtClock(clock(7, 3)), '07:03')
  assert.equal(fmtClock(null), null)
  assert.equal(fmtClock('몰라'), null)
})

test('canCancel 은 대기 중만, 409 는 쉬운 말', () => {
  assert.equal(canCancel({ status: 'QUEUED' }), true)
  for (const s of ['RUNNING', 'DONE', 'FAILED', 'CANCELED']) assert.equal(canCancel({ status: s }), false)
  const e = new ApiError('x')
  e.status = 409
  assert.match(cancelErrorMessage(e), /이미 시작했거나/)
})

test('groupJobs: 묶음별로 묶고 새 묶음이 위, 직접 만들기는 하나씩', () => {
  const rows = [
    row({ jobId: 'a2', batchId: 'b1', status: 'QUEUED', createdAt: clock(9, 0) }),
    row({ jobId: 'm1', batchId: null, status: 'RUNNING', createdAt: clock(9, 30) }),
    row({ jobId: 'a1', batchId: 'b1', status: 'DONE', createdAt: clock(8, 59) }),
    row({ jobId: 'c1', batchId: 'b2', status: 'FAILED', createdAt: clock(7, 0) }),
  ]
  const g = groupJobs(rows)
  assert.deepEqual(g.map((x) => x.key), ['j:m1', 'b:b1', 'b:b2'])
  assert.deepEqual(g[1].jobs.map((j) => j.jobId), ['a1', 'a2']) // 묶음 안은 만든 순서
  assert.equal(groupSummary(g[1]), '2개 중 1개 끝남 · 대기 1')
  assert.equal(groupSummary(g[2]), '1개 중 1개 끝남 · 실패 1')
  assert.deepEqual(groupJobs([]), [])
})

test('clampCount: 1~10 정수로 맞추고 숫자가 아니면 10', () => {
  assert.equal(clampCount(0), 1)
  assert.equal(clampCount('3.9'), 3)
  assert.equal(clampCount(99), 10)
  assert.equal(clampCount('abc'), 10)
})

test('previewRequest·rerollExclude·removeTopic: 본 것(뺀 것 포함)을 exclude 로 쌓는다', () => {
  const f = { track: 'DEV', minutes: 60, usage: 'SELF', count: 10, mode: 'NOW', batchDeadlineHours: 3 }
  assert.deepEqual(previewRequest(f), { track: 'DEV', minutes: 60, count: 10 }) // exclude 가 없으면 키도 없다
  const t = (n) => ({ situation: `상황 ${n}`, trap: '함정', trapType: 'R1', competencies: [] })
  let seen = rerollExclude([], [t(1), t(2), t(3)])
  assert.deepEqual(seen, ['상황 1', '상황 2', '상황 3'])
  assert.deepEqual(previewRequest(f, seen).exclude, seen)
  seen = rerollExclude(seen, [t(3), t(4)]) // 겹침은 한 번만
  assert.deepEqual(seen, ['상황 1', '상황 2', '상황 3', '상황 4'])
  assert.equal(rerollExclude(Array.from({ length: 40 }, (_, i) => `s${i}`), [t(1)]).length, 30) // 최근 30개만
  assert.deepEqual(removeTopic([t(1), t(2)], '상황 1').map((x) => x.situation), ['상황 2'])
})

test('autoRequest: topics 가 있으면 개수는 topics 개수, 마감은 배치일 때만', () => {
  const f = { track: 'BIZ', minutes: 40, usage: 'LIVE', count: 8, mode: 'NOW', batchDeadlineHours: 6 }
  const topics = [{ situation: 's', trap: 't', trapType: 'B1', competencies: ['control'] }]
  assert.deepEqual(autoRequest(f, topics), { track: 'BIZ', minutes: 40, count: 1, usage: 'LIVE', mode: 'NOW', topics })
  assert.deepEqual(autoRequest(f, null), { track: 'BIZ', minutes: 40, count: 8, usage: 'LIVE', mode: 'NOW' }) // 건너뛰기: topics 키 없음
  assert.deepEqual(autoRequest({ ...f, mode: 'BATCH' }, []), { track: 'BIZ', minutes: 40, count: 8, usage: 'LIVE', mode: 'BATCH', batchDeadlineHours: 6 })
})

test('buildGenRequest: 방식(mode)과 배치 마감', () => {
  const f = { track: 'DEV', topic: ' 쿠폰 ', trap: ' 중복 ', usage: 'SELF', minutes: 40 }
  assert.deepEqual(buildGenRequest(f), { track: 'DEV', topic: '쿠폰', trap: '중복', usage: 'SELF', minutes: 40 }) // 안 고르면 예전 그대로
  assert.deepEqual(buildGenRequest({ ...f, mode: 'NOW', batchDeadlineHours: 6 }), { track: 'DEV', topic: '쿠폰', trap: '중복', usage: 'SELF', minutes: 40, mode: 'NOW' })
  assert.equal(buildGenRequest({ ...f, mode: 'BATCH', batchDeadlineHours: 1 }).batchDeadlineHours, 1)
  assert.equal(buildGenRequest({ ...f, mode: 'BATCH' }).batchDeadlineHours, 3) // 기본 3시간
})

test('자동 생성 API 는 미리보기·시작·목록·취소 주소를 그대로 부른다', async () => {
  const calls = []
  globalThis.fetch = async (url, o) => {
    calls.push([o.method, url])
    return Response.json(url.endsWith('/auto') ? { batchId: 'b', jobIds: ['j1'] } : [])
  }
  await taskGenApi.preview({ track: 'DEV', minutes: 60, count: 2 })
  const r = await taskGenApi.startAuto({ track: 'DEV', minutes: 60, count: 1, usage: 'SELF', mode: 'NOW' })
  await taskGenApi.jobs()
  await taskGenApi.cancel('a/b')
  assert.equal(r.batchId, 'b')
  assert.deepEqual(calls, [
    ['POST', '/api/admin/task-gen/auto/preview'],
    ['POST', '/api/admin/task-gen/auto'],
    ['GET', '/api/admin/task-gen/jobs?active=true'],
    ['POST', '/api/admin/task-gen/a%2Fb/cancel'],
  ])
})
