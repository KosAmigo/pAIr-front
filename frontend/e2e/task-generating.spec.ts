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
    const info = detail.getByRole('group', { name: '만들 때 정한 내용' }).or(detail.locator('dl'))
    await expect(info.first()).toContainText('함정: 진행 주제')
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
    await expect(page.getByTestId('gen-job').nth(1).getByRole('status')).toHaveText('취소됨')
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

  test('묶음 펼치기·접기(진행 중은 펼침, 끝난 묶음은 접힘, 기억함)와 새로고침 버튼, 안내 문구 없음', async ({ page }) => {
    const api = await mockApi(page)
    // 진행 중인 묶음 b1 + 끝난 묶음 b2
    api.seedJobs([
      ...JOBS,
      job({ jobId: 'e1', batchId: 'b2', status: 'DONE', step: '완료', taskCode: 'N8', passed: true, topic: '끝난 묶음 주제', createdAt: at(0) }),
    ])
    let calls = 0
    page.on('request', (r) => {
      if (new URL(r.url()).pathname === '/api/admin/task-gen/jobs') calls++
    })
    await page.goto('/console/tasks/generating')
    const live = page.getByRole('button', { name: /3개 중 1개 끝남/ })
    const ended = page.getByRole('button', { name: /1개 중 1개 끝남/ })
    await expect(live).toHaveAttribute('aria-expanded', 'true')
    await expect(ended).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByRole('button', { name: '진행 주제 자세히 보기' })).toBeVisible()
    await expect(page.getByRole('button', { name: '끝난 묶음 주제 자세히 보기' })).toBeHidden() // 접힌 묶음의 행은 안 보이고 탭으로도 못 간다

    // 끝난 묶음을 펼치고 진행 묶음을 접는다 → 새로고침해도 그대로
    await ended.click()
    await live.click()
    await expect(page.getByRole('button', { name: '끝난 묶음 주제 자세히 보기' })).toBeVisible()
    await expect(page.getByRole('button', { name: '진행 주제 자세히 보기' })).toBeHidden()
    await page.reload()
    await expect(page.getByRole('button', { name: /3개 중 1개 끝남/ })).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByRole('button', { name: /1개 중 1개 끝남/ })).toHaveAttribute('aria-expanded', 'true')

    // 안내 문구는 없고, 새로고침 아이콘 버튼 하나가 바로 다시 불러온다
    await expect(page.getByText(/3초마다|새로 불러와요|나갔다 와도/)).toHaveCount(0)
    const refresh = page.getByRole('button', { name: '새로고침' })
    await expect(refresh).toHaveAttribute('title', /마지막 갱신 \d{2}:\d{2}:\d{2}/)
    const before = calls
    await refresh.click()
    await expect.poll(() => calls).toBeGreaterThan(before)
  })

  test('묶음 카드는 상태별로 다르게 보인다: 도는 중 / 모두 끝남 / 실패 섞임, 작업마다 한 칸', async ({ page }) => {
    const api = await mockApi(page)
    api.seedJobs([
      ...JOBS, // b1: 진행·대기·완료 → live
      job({ jobId: 'd1', batchId: 'b2', status: 'DONE', step: '완료', taskCode: 'N8', topic: '끝1', createdAt: at(10) }),
      job({ jobId: 'd2', batchId: 'b2', status: 'DONE', step: '완료', taskCode: 'N9', topic: '끝2', createdAt: at(11) }),
      job({ jobId: 'f1', batchId: 'b3', status: 'DONE', step: '완료', taskCode: 'N10', topic: '성공', track: 'BIZ', createdAt: at(20) }),
      job({ jobId: 'f2', batchId: 'b3', status: 'FAILED', error: '시간 초과', topic: '실패', track: 'BIZ', createdAt: at(21) }),
    ])
    await page.goto('/console/tasks/generating')
    const groups = page.getByTestId('gen-group')
    await expect(groups).toHaveCount(3)
    const state = (name: RegExp) => groups.filter({ has: page.getByRole('button', { name }) })
    await expect(state(/3개 중 1개 끝남/)).toHaveAttribute('data-state', 'live')
    await expect(groups.filter({ hasText: '끝1' })).toHaveAttribute('data-state', 'done')
    await expect(state(/실패 1/)).toHaveAttribute('data-state', 'failed')
    // 접힌 묶음에도 작업마다 막대 한 칸씩 (title = 주제 · 상태)
    await expect(state(/3개 중 1개 끝남/).locator('[title*="진행 주제"]')).toHaveCount(1)
    await expect(state(/실패 1/).locator('span[title]')).toHaveCount(2)
    // 개수는 머리 버튼 이름에, 직군·방식은 글로
    await expect(page.getByRole('button', { name: /3개 중 1개 끝남 · 진행 1 · 대기 1 · 완료 1/ })).toBeVisible()
    await expect(state(/3개 중 1개 끝남/)).toContainText('일반')
    await expect(state(/실패 1/)).toContainText('비개발')
  })
})
