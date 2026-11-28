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
  assert.deepEqual(jobView(row({ step: '글 작성 중', waitingBatch: true, mode: 'BATCH', deadlineAt: clock(18, 30) })), { tone: 'batch', label: '절약 모드 대기 중', sub: '마감 18:30', done: false })
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
  assert.equal(buildGenRequest({ ...f, mode: 'BATCH', batchDeadlineHours: 12 }).batchDeadlineHours, 12)
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

// ── 만드는 중인 과제 페이지 (2026-11-27) ──
import { activeCount, contentSections, generatingHref, isEnded, jobsPollMs, modeLabel, newlyDone, JOBS_BUSY_MS, JOBS_IDLE_MS } from '../src/data/taskGenJobs.ts'

test('activeCount·jobsPollMs: 대기+진행만 센다, 도는 작업이 없으면 간격을 늘린다', () => {
  const rows = [{ status: 'QUEUED' }, { status: 'RUNNING' }, { status: 'DONE' }, { status: 'FAILED' }]
  assert.equal(activeCount(rows), 2)
  assert.equal(activeCount(null), 0)
  assert.equal(jobsPollMs(rows), JOBS_BUSY_MS)
  assert.equal(jobsPollMs(null), JOBS_BUSY_MS)
  assert.equal(jobsPollMs([{ status: 'DONE' }, { status: 'CANCELED' }]), JOBS_IDLE_MS)
  assert.equal(jobsPollMs([]), JOBS_IDLE_MS)
  assert.ok(JOBS_IDLE_MS > JOBS_BUSY_MS)
})

test('상태 표시 글: 대기 n번째 / 세부 단계 / 배치 대기 / 완료 / 실패 / 취소 (jobView) 와 isEnded·modeLabel', () => {
  assert.equal(jobView(row({ status: 'QUEUED', queuePosition: 2 })).label, '대기 2번째')
  assert.equal(jobView(row({ step: '정답 쪽 작성 중' })).sub, '정답과 숨은 테스트 작성 중')
  assert.equal(jobView(row({ waitingBatch: true, mode: 'BATCH' })).label, '절약 모드 대기 중')
  assert.equal(jobView(row({ status: 'DONE', checks: [{ name: 'a', ok: true, detail: '' }] })).label, '완료')
  assert.equal(jobView(row({ status: 'FAILED', error: '시간 초과' })).sub, '시간 초과')
  assert.equal(jobView(row({ status: 'CANCELED' })).label, '취소됨')
  assert.deepEqual(['QUEUED', 'RUNNING', 'DONE', 'FAILED', 'CANCELED'].map(isEnded), [false, false, true, true, true])
  assert.equal(modeLabel('NOW'), '일반')
  assert.equal(modeLabel(null), '일반')
  assert.equal(modeLabel('BATCH', clock(15, 5)), '절약 · 마감 15:05')
  assert.equal(modeLabel('BATCH'), '절약')
})

test('newlyDone: 이전에 DONE 이 아니었다가 DONE 이 된 작업만, 첫 조회는 없음', () => {
  const prev = [{ jobId: 'a', status: 'RUNNING' }, { jobId: 'b', status: 'DONE' }, { jobId: 'c', status: 'QUEUED' }]
  const next = [{ jobId: 'a', status: 'DONE' }, { jobId: 'b', status: 'DONE' }, { jobId: 'c', status: 'RUNNING' }, { jobId: 'd', status: 'DONE' }]
  assert.deepEqual(newlyDone(prev, next), ['a']) // d 는 이전에 없던 작업이라 제외
  assert.deepEqual(newlyDone(null, next), [])
  assert.deepEqual(newlyDone(next, next), [])
})

test('generatingHref: 작업 번호를 주소에 싣는다', () => {
  assert.equal(generatingHref(), '/console/tasks/generating')
  assert.equal(generatingHref('a 1'), '/console/tasks/generating?job=a%201')
})

test('contentSections: null 단계는 자리 표시, 나온 단계는 줄로, 결함·정답은 검수용', () => {
  // content 가 없으면 모두 자리 표시 (개발이면 코드, 문항은 없음)
  const empty = contentSections(null, 'DEV')
  assert.deepEqual(empty.map((s) => s.key), ['blueprint', 'writing', 'code', 'answer', 'fillers'])
  assert.ok(empty.every((s) => !s.ready && s.blocks.length === 0))
  // 비개발은 코드 대신 문항
  assert.deepEqual(contentSections(null, 'BIZ').map((s) => s.key), ['blueprint', 'writing', 'questions', 'answer', 'fillers'])

  const c = {
    form: { track: 'DEV' },
    blueprint: {
      title: '쿠폰', examples: [{ input: '2장', expected: '1번 할인' }], flaws: [{ what: '중복', where: 'A.java' }],
      judgments: [{ question: '허용?', options: ['예', '아니오'] }], fillers: [{ path: 'R.md', summary: '배경', confusing: true }],
    },
    writing: { description: ['p1', 'p2'], requirements: [], notes: null, documents: [{ path: 'd.pdf', chars: 1200 }] },
    code: null,
    answer: { hiddenTests: [{ path: 'T.java', methods: ['a', 'b'] }], wrongFixes: 2, altSolutions: 0 },
  }
  const s = contentSections(c, null) // 직군은 content.form 에서
  assert.deepEqual(s.map((x) => [x.key, x.ready]), [['blueprint', true], ['writing', true], ['code', false], ['answer', true], ['fillers', false]])
  const bp = s[0].blocks
  assert.deepEqual(bp.find((b) => b.label === '예시').lines, ['2장 → 1번 할인'])
  assert.equal(bp.find((b) => b.label.startsWith('결함')).adminOnly, true)
  assert.deepEqual(bp.find((b) => b.label === '판단 지점').lines, ['허용? (예 / 아니오)'])
  assert.deepEqual(bp.find((b) => b.label === '관련 자료').lines, ['R.md — 배경 (헷갈리게 둔 자료)'])
  assert.equal(bp.find((b) => b.label === '제목').adminOnly, undefined)
  assert.deepEqual(s[1].blocks.map((b) => b.label), ['설명', '문서 목록']) // 빈 요구사항·null notes 는 뺀다
  assert.equal(s[1].blocks[1].lines[0], 'd.pdf · 1,200자')
  assert.equal(s[3].adminOnly, true)
  assert.deepEqual(s[3].blocks.map((b) => b.lines), [['T.java — a, b'], ['오답 2개 · 다른 풀이 0개']])
})

// ── 생성 기록 카드: 단계별 모델·횟수 (genReportView) ──
import { countRows, modelLine, shortModel, stageGroup, stageSummary } from '../src/data/genReportView.ts'

test('shortModel·stageGroup: 모델 이름은 짧게, 단계 이름은 묶음으로', () => {
  assert.equal(shortModel('gpt-6.1-sol'), 'sol')
  assert.equal(shortModel('gpt-6.1-terra'), 'terra')
  assert.equal(shortModel('claude-sonnet-5-5'), 'sonnet')
  assert.equal(shortModel(''), '-')
  assert.equal(shortModel(null), '-')
  assert.deepEqual(['설계도 작성 중', '글 작성 중', '시작 코드 작성 중', '문항 글 작성 중', '정답 쪽 작성 중', '관련 적은 자료 작성 중', '관문 검사 중', 'blueprint', 'whatever'].map(stageGroup), ['blueprint', 'writing', 'code', 'questions', 'answer', 'fillers', 'judge', 'blueprint', 'other'])
})

test('stageSummary: 단계 묶음별 모델(중복 없이)·호출 수·배치/바로, stages 없으면 null', () => {
  assert.equal(stageSummary({ details: null }), null)
  assert.equal(stageSummary({ details: { stages: [] } }), null)
  const s = stageSummary({
    details: {
      stages: [
        { stage: '설계도 작성 중', model: 'gpt-6.1-sol', via: 'batch' },
        { stage: '글 작성 중', model: 'gpt-6.1-sol', via: 'batch' },
        { stage: '글 작성 중', model: 'gpt-6.1-sol', via: 'now' },
        { stage: '관련 적은 자료 작성 중', model: 'gpt-6.1-terra', via: 'now' },
        { stage: '관문 검사 중', model: 'gpt-6.1-sol', via: 'now' },
        { stage: '관문 검사 중', model: 'claude-sonnet-5-5', via: 'now' },
      ],
    },
  })
  assert.equal(modelLine(s), '설계도 sol · 글 sol · 자료 terra · 검사 sol/sonnet')
  assert.deepEqual(countRows(s), [{ label: '설계도', n: 1, redo: false }, { label: '글', n: 2, redo: true }, { label: '자료', n: 1, redo: false }]) // 검사는 만든 횟수에서 뺀다
  assert.deepEqual([s.batch, s.now, s.hasBatch], [2, 4, true])
})
