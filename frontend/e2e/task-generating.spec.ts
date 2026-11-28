// 만드는 중인 과제 페이지(/console/tasks/generating): 버튼 배지 → 목록 → 작업 고르기(주소 유지) → 상세(단계·만들어진 내용·검사 결과) → 대기 취소.
// 그리고 과제 만들기 화면에 진행 목록이 없는지, 탭이 가운데인지, 작업이 끝나면 과제 목록에 새로고침 없이 나타나는지.
import { expect, test } from '@playwright/test'
import { mockApi } from './mock'

const at = (n: number) => new Date(2026, 10, 27, 9, n).toISOString()
const job = (o: Record<string, unknown>) => ({
  batchId: 'b1', status: 'QUEUED', step: null, taskCode: null, passed: null, checks: [], error: null, mode: 'NOW', deadlineAt: null, queuePosition: null,
  track: 'DEV', minutes: 40, ...o,
})
/** 진행 1, 대기 1, 완료 1 */
const JOBS = [
  job({ jobId: 'a1', status: 'RUNNING', step: '설계도 작성 중', topic: '진행 주제', createdAt: at(1) }),
  job({ jobId: 'a2', status: 'QUEUED', queuePosition: 1, topic: '대기 주제', createdAt: at(2) }),
  job({
    jobId: 'a3', status: 'DONE', step: '완료', taskCode: 'N7', passed: true, topic: '완료 주제', createdAt: at(3),
    checks: [{ name: '컴파일', ok: true, detail: '' }, { name: '분량 대비 시간', ok: false, level: 'warn', detail: '분량이 적어요' }],
  }),
]

test.describe('만드는 중인 과제', () => {
  test('버튼 배지는 대기+진행 개수, 목록 → 작업 고르기 → 상세, 주소에 남는다', async ({ page }) => {
    const api = await mockApi(page)
    api.seedJobs(JOBS)
    await page.goto('/console/tasks')
    const link = page.getByRole('link', { name: /만드는 중인 과제/ })
    await expect(link.getByTestId('gen-badge')).toHaveText('2')
    await link.click()
    await expect(page).toHaveURL(/\/console\/tasks\/generating$/)
    await expect(page.getByRole('heading', { name: '만드는 중인 과제', level: 1 })).toBeVisible()
    await expect(page.getByText('왼쪽에서 작업을 고르면')).toBeVisible()

    // 진행 작업을 고르면 주소에 ?job= 이 남고, 새로고침해도 유지된다
    await page.getByRole('button', { name: '진행 주제 자세히 보기' }).click()
    await expect(page).toHaveURL(/\?job=a1/)
    const detail = page.getByRole('region', { name: '작업 상세' })
    await expect(detail.getByRole('heading', { name: '진행 주제' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('region', { name: '작업 상세' }).getByRole('heading', { name: '진행 주제' })).toBeVisible()

    // 폼 정보 + 진행 단계(설계도 작성 중은 '생성 중' 단계, 세부 글은 그대로)
    await expect(detail.getByRole('list', { name: '만들 때 정한 내용' })).toContainText('자가진단')
    await expect(detail.getByText('함정: 진행 주제')).toBeVisible()
    await expect(detail.getByText('JOB', { exact: true })).toHaveCount(0)
    await expect(detail.getByTestId('gen-detail')).toHaveText('설계도 작성 중')
    await expect(detail.getByRole('listitem').filter({ hasText: '생성 중' }).first()).toContainText('진행 중')

    // 만들어진 내용: 설계도는 나와 있고(결함은 검수용), 나머지는 '아직 만들지 않았어요'
    await expect(detail.getByText('쿠폰 중복 할인').first()).toBeVisible()
    await expect(detail.getByText('중복 적용 · CouponService.apply')).toBeVisible()
    await expect(detail.getByText('검수용').first()).toBeVisible()
    await expect(detail.getByText('아직 만들지 않았어요')).toHaveCount(4) // 글, 시작 코드, 정답, 관련 자료
    await expect(detail.getByRole('link', { name: '검수하기' })).toHaveCount(0)
  })

  test('끝난 작업: 모든 내용·검사 결과·검수하기·미리보기 링크', async ({ page }) => {
    const api = await mockApi(page)
    api.seedJobs(JOBS)
    await page.goto('/console/tasks/generating?job=a3')
    const detail = page.getByRole('region', { name: '작업 상세' })
    await expect(detail.getByText('아직 만들지 않았어요')).toHaveCount(0)
    // 접힌 섹션을 펼쳐 숨은 테스트를 본다
    await detail.getByText('정답', { exact: true }).click()
    await expect(detail.getByText('CouponServiceTest.java — stacksOnce, noNegative')).toBeVisible()
    await expect(detail.getByText('오답 2개 · 다른 풀이 1개')).toBeVisible()
    await expect(detail.getByRole('list', { name: '자동 확인 결과' })).toContainText('분량 대비 시간')
    await expect(detail.getByRole('link', { name: /검수하기/ })).toHaveAttribute('href', '/console/tasks/N7')
    await expect(detail.getByRole('link', { name: /미리보기/ })).toHaveAttribute('href', '/console/tasks/N7/preview')
  })

  test('대기 중인 작업만 취소할 수 있고, 취소하면 상태가 바뀐다', async ({ page }) => {
    const api = await mockApi(page)
    api.seedJobs(JOBS)
    await page.goto('/console/tasks/generating?job=a2')
    await expect(page.getByRole('region', { name: '작업 상세' })).toContainText('앞 작업이 끝나면 시작해요')
    await expect(page.getByRole('button', { name: /취소/ })).toHaveCount(1)
    await page.getByRole('button', { name: '대기 주제 취소' }).click()
    // 취소된 작업은 끝난 쪽(완료 줄)으로 내려간다
    await expect(page.getByTestId('gen-done-toggle')).toContainText(/완료\s*2/)
    // 고른 작업(a2)이라 완료 줄이 저절로 펼쳐져 취소됨이 보인다
    await expect(page.getByRole('button', { name: '대기 주제 자세히 보기' }).locator('[role=status]')).toHaveText('취소됨')
    expect(api.sent.some((r) => r.path === '/api/admin/task-gen/a2/cancel')).toBe(true)
  })

  test('과제 만들기 화면: 진행 목록이 없고, 제목 옆 버튼 배지가 있고, 탭은 가운데다', async ({ page }) => {
    const api = await mockApi(page)
    api.seedJobs(JOBS)
    await page.goto('/console/tasks/new')
    await expect(page.getByRole('region', { name: '진행 목록' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: /만드는 중인 과제/ }).getByTestId('gen-badge')).toHaveText('2')
    // 탭 묶음의 가운데가 화면 틀의 가운데와 거의 같다
    const tabs = await page.getByRole('tablist').boundingBox()
    const frame = await page.getByRole('tabpanel').boundingBox()
    expect(tabs && frame).toBeTruthy()
    const mid = (b: { x: number; width: number }) => b.x + b.width / 2
    expect(Math.abs(mid(tabs!) - mid(frame!))).toBeLessThan(40)
    // 두 탭 모두 같은 틀(오른쪽 요약)을 쓴다
    await expect(page.getByRole('complementary', { name: '고른 값 요약' })).toBeVisible()
    await page.getByRole('tab', { name: '직접 만들기' }).click()
    await expect(page.getByRole('complementary', { name: '고른 값 요약' })).toBeVisible()
  })

  test('작업이 끝나면 과제 목록에 새로고침 없이 나타난다', async ({ page }) => {
    const api = await mockApi(page)
    api.seedJobs([JOBS[0]])
    await page.goto('/console/tasks')
    await page.getByRole('tab', { name: /검수 전/ }).click()
    await expect(page.getByText('방금 만든 로그 분석기')).toHaveCount(0)
    api.finishJob('a1', 'N9', '방금 만든 로그 분석기')
    await expect(page.getByText('방금 만든 로그 분석기')).toBeVisible({ timeout: 10_000 })
  })

  test('조회 간격: 도는 작업이 있으면 3초, 모두 끝나면 30초로 바뀐다', async ({ page }) => {
    const api = await mockApi(page)
    api.seedJobs([JOBS[0]])
    let calls = 0
    page.on('request', (r) => {
      if (new URL(r.url()).pathname === '/api/admin/task-gen/jobs') calls++
    })
    await page.clock.install()
    await page.goto('/console/tasks/generating')
    await expect.poll(() => calls).toBe(1)
    await page.clock.runFor(3100)
    await expect.poll(() => calls).toBe(2)
    await page.clock.runFor(3100)
    await expect.poll(() => calls).toBe(3)
    // 모두 끝나면 긴 간격
    api.seedJobs([JOBS[2]])
    await page.clock.runFor(3100)
    await expect.poll(() => calls).toBe(4)
    // 다음 간격은 4번째 응답을 화면이 받은 뒤에 잰다. 응답이 반영(완료 줄이 나타남)되기 전에 시계를 돌리면 30초 타이머가 그 뒤에 걸려 어긋난다
    await expect(page.getByTestId('gen-done-toggle')).toBeVisible()
    await page.clock.runFor(10_000)
    await page.waitForTimeout(200)
    expect(calls).toBe(4)
    await page.clock.runFor(21_000)
    await expect.poll(() => calls).toBe(5)
  })

  test('두 버튼은 세 화면에서 같은 컴포넌트(같은 testid·모양)로 보이고, 도는 작업이 없으면 배지가 없다', async ({ page }) => {
    const api = await mockApi(page)
    api.seedJobs(JOBS)
    const cls = async (id: string) => (await page.getByTestId(id).first().getAttribute('class')) ?? ''
    // 과제 목록: 둘 다 있다(큰 크기)
    await page.goto('/console/tasks')
    await expect(page.getByTestId('create-task-btn')).toBeVisible()
    await expect(page.getByTestId('generating-btn')).toHaveAttribute('data-live', 'true')
    await expect(page.getByTestId('gen-badge')).toHaveText('2')
    await expect(page.getByTestId('generating-btn')).toHaveAccessibleName('만드는 중인 과제, 진행 중 2개')
    const big = { create: await cls('create-task-btn'), gen: await cls('generating-btn') }
    // 과제 만들기 화면: 만드는 중인 과제 버튼만 (제목 옆)
    await page.goto('/console/tasks/new')
    await expect(page.getByTestId('generating-btn')).toBeVisible()
    await expect(page.getByTestId('gen-badge')).toHaveText('2')
    // 만드는 중인 과제 페이지: 과제 만들기로 돌아가는 같은 버튼
    await page.goto('/console/tasks/generating')
    await expect(page.getByTestId('create-task-btn')).toBeVisible()
    // 크기(h-12 ↔ h-10)만 다르고 나머지 모양 클래스는 같다
    const strip = (c: string) => c.split(/\s+/).filter((x) => !/^(h-1[02]|px-[56]|text-\[1[56]px\])$/.test(x)).sort().join(' ')
    expect(strip(await cls('create-task-btn'))).toBe(strip(big.create))
    // 도는 작업이 없으면 차분하다: 배지·진행 점 없음
    api.seedJobs([JOBS[2]])
    await page.goto('/console/tasks')
    await expect(page.getByTestId('generating-btn')).toHaveAttribute('data-live', 'false')
    await expect(page.getByTestId('gen-badge')).toHaveCount(0)
    await expect(page.getByTestId('generating-btn')).toHaveAccessibleName('만드는 중인 과제')
  })

  test("끝난 작업은 맨 아래 '완료 N' 줄에 접혀 있고(기억함), 새로고침 버튼이 바로 다시 불러온다, 안내 문구 없음", async ({ page }) => {
    const api = await mockApi(page)
    // 진행 b1(진행·대기·완료) + 끝난 작업 e1: 완료 쪽은 a3, e1 두 개
    api.seedJobs([
      ...JOBS,
      job({ jobId: 'e1', batchId: 'b2', status: 'DONE', step: '완료', taskCode: 'N8', passed: true, topic: '끝난 묶음 주제', createdAt: at(0) }),
    ])
    let calls = 0
    page.on('request', (r) => {
      if (new URL(r.url()).pathname === '/api/admin/task-gen/jobs') calls++
    })
    await page.goto('/console/tasks/generating')
    // 위에는 진행·대기 작업만, 끝난 작업은 접힌 '완료 2' 줄 안에 있다
    await expect(page.getByRole('button', { name: '진행 주제 자세히 보기' })).toBeVisible()
    await expect(page.getByRole('button', { name: '대기 주제 자세히 보기' })).toBeVisible()
    const done = page.getByTestId('gen-done-toggle')
    await expect(done).toContainText(/완료\s*2/)
    await expect(done).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByRole('button', { name: '끝난 묶음 주제 자세히 보기' })).toBeHidden() // 접힌 곳의 카드는 안 보이고 탭으로도 못 간다
    await expect(page.getByTestId('gen-summary')).toContainText('진행 중 2')

    // 펼치면 보이고, 새로고침해도 그대로(기억)
    await done.click()
    await expect(page.getByRole('button', { name: '끝난 묶음 주제 자세히 보기' })).toBeVisible()
    await expect(page.getByRole('button', { name: '완료 주제 자세히 보기' })).toBeVisible()
    await page.reload()
    await expect(page.getByTestId('gen-done-toggle')).toHaveAttribute('aria-expanded', 'true')

    // 안내 문구는 없고, 새로고침 아이콘 버튼 하나가 바로 다시 불러온다
    await expect(page.getByText(/3초마다|새로 불러와요|나갔다 와도/)).toHaveCount(0)
    const refresh = page.getByRole('button', { name: '새로고침' })
    await expect(refresh).toHaveAttribute('title', /마지막 갱신 \d{2}:\d{2}:\d{2}/)
    const before = calls
    await refresh.click()
    await expect.poll(() => calls).toBeGreaterThan(before)
  })

  test('작업 카드는 상태별로 다르게 보인다: 진행 중 / 실패 / 완료, 선택한 카드 표시, 진행 막대', async ({ page }) => {
    const api = await mockApi(page)
    api.seedJobs([
      ...JOBS, // a1 진행(설계도 작성 중), a2 대기, a3 완료
      job({ jobId: 'f1', batchId: 'b3', status: 'FAILED', error: '시간 초과', topic: '실패 주제', track: 'BIZ', createdAt: at(21) }),
    ])
    await page.goto('/console/tasks/generating?job=a3')
    const jobs = page.getByTestId('gen-job')
    // 묶음 카드는 없다: 작업 하나마다 카드 하나
    await expect(page.getByTestId('gen-group')).toHaveCount(0)
    // 선택한 작업(a3)이 완료 쪽에 있으면 완료 줄이 펼쳐져 보인다
    await expect(page.getByTestId('gen-done-toggle')).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByTestId('gen-done-toggle')).toContainText(/완료\s*2/)
    const card = (title: string) => jobs.filter({ has: page.getByRole('button', { name: `${title} 자세히 보기` }) })
    await expect(card('진행 주제')).toHaveAttribute('data-state', 'live')
    await expect(card('대기 주제')).toHaveAttribute('data-state', 'live')
    await expect(card('실패 주제')).toHaveAttribute('data-state', 'failed')
    await expect(card('완료 주제')).toHaveAttribute('data-state', 'done')
    // 고른 카드만 aria-current 와 ring
    await expect(page.getByRole('button', { name: '완료 주제 자세히 보기' })).toHaveAttribute('aria-current', 'true')
    await expect(card('완료 주제')).toHaveClass(/ring-2/)
    await expect(card('진행 주제')).not.toHaveClass(/ring-2/)
    // 진행 중 카드에만 얇은 진행 막대(생성 단계 = 1/3), 끝난 카드에는 없다
    await expect(card('진행 주제').locator('[style*="scaleX(0.34)"]')).toHaveCount(1)
    await expect(card('완료 주제').locator('[style*="scaleX"]')).toHaveCount(0)
    // 정보 한 줄: 분 · 방식 · 상태 (직군 글자는 화면에 없고 title 에만)
    await expect(card('진행 주제')).toContainText('40분')
    await expect(card('진행 주제')).toContainText('일반')
    await expect(card('실패 주제')).not.toContainText('비개발')
    await expect(page.getByRole('button', { name: '실패 주제 자세히 보기' })).toHaveAttribute('title', /비개발/)
    // '진행 목록' 글씨는 화면에 없고 화면 읽기용 제목으로만 남는다
    await expect(page.getByRole('region', { name: '진행 목록' })).toBeAttached()
    await expect(page.getByRole('heading', { name: '진행 목록' })).toHaveClass(/sr-only/)
  })
})
