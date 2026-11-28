// 관리자 통계: 콘솔 메뉴에서 들어가 기본 최근 30일을 보고, 빠른 선택·날짜 입력으로 기간을 바꾼다.
// @shot 은 .shots/admin-stats/ 에 스크린샷을 남긴다(저장소에는 올리지 않는다).
import { expect, test, type Page } from '@playwright/test'
import { mockApi } from './mock'

const part = (calls: number, input: number, output: number, usd: number, model: string) => ({
  calls, inputTokens: input, outputTokens: output, cachedTokens: 0, usd,
  models: calls ? [{ model, calls, inputTokens: input, outputTokens: output, cachedTokens: 0, usd }] : [],
})
const bands = (a: number, b: number, c: number, d: number) => [
  { range: '0-39', count: a }, { range: '40-59', count: b }, { range: '60-79', count: c }, { range: '80-100', count: d },
]
const stats = (from: string, to: string) => ({
  from, to,
  members: { users: 128, companyMembers: 9, companies: 3, newUsers: 42, withdrawn: 2 },
  selfDiagnosis: {
    started: 310, submitted: 240, scored: 236, averageScore: 64.3, bands: bands(30, 70, 90, 46),
    tasks: [
      { taskId: 'order-deadlock', title: '주문 처리 장애 원인 분석', scored: 150, averageScore: 61.2 },
      { taskId: 'pricing-plan', title: '신규 저가 요금제 출시 기획안', scored: 86, averageScore: 69.7 },
    ],
  },
  live: { sessions: 4, participants: 55, started: 98, submitted: 95, scored: 95, averageScore: 58.2, bands: bands(18, 30, 32, 15) },
  ai: {
    totalUsd: 18.4213,
    selfChat: part(2100, 3_100_000, 420_000, 6.1, 'gpt-5-mini'),
    liveChat: part(640, 900_000, 120_000, 1.8, 'gpt-5-mini'),
    scoring: part(1200, 2_400_000, 300_000, 6.2, 'claude-sonnet-5-5'),
    taskGen: { jobs: 12, calls: 140, inputTokens: 900_000, outputTokens: 120_000, cachedTokens: 50_000, usd: 4.3213 },
    unpricedModels: [],
  },
  credits: { paidCount: 15, paidKrw: 224_850, refundedCount: 1, refundedKrw: 4_990 },
})

async function setup(page: Page) {
  await mockApi(page)
  const asked: { from: string; to: string }[] = []
  await page.route((url) => url.pathname === '/api/admin/stats', (route) => {
    const u = new URL(route.request().url())
    const from = u.searchParams.get('from')!, to = u.searchParams.get('to')!
    asked.push({ from, to })
    return route.fulfill({ json: stats(from, to) })
  })
  return { asked }
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d) }

test('콘솔 메뉴의 통계는 기본 최근 30일을 보여 준다', async ({ page }) => {
  const { asked } = await setup(page)
  await page.goto('/console/sessions')
  await page.getByRole('link', { name: '통계' }).click()

  await expect(page).toHaveURL(/\/console\/stats$/)
  await expect(page.getByRole('button', { name: '최근 30일' })).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => asked.at(-1)).toEqual({ from: daysAgo(29), to: ymd(new Date()) })
  await expect(page.getByText('64.3점')).toBeVisible()
  await expect(page.getByText('224,850원')).toBeVisible()
  await expect(page.getByLabel('자가진단 점수 구간별 채점 건수').getByText('46건')).toBeVisible()
  await expect(page.getByText('$18.42')).toBeVisible()
  // AI 사용량도 처음엔 접혀 있고 총 비용만 보인다
  const aiRow = page.getByRole('row', { name: /자가진단 AI 채팅/ })
  await expect(aiRow).toHaveCount(0)
  await page.locator('button[aria-controls="ai-usage"]').click()
  await expect(aiRow).toContainText('$6.10')
  // 과제별 평균은 처음에 접혀 있고 과제 수만 보인다
  const byTask = page.getByRole('row', { name: /신규 저가 요금제 출시 기획안/ })
  await expect(page.getByText('과제 2개')).toBeVisible()
  await expect(byTask).toHaveCount(0)
  // 사이드바에도 "접기" 버튼이 있으므로 과제별 표를 여닫는 버튼(aria-controls)으로 찾는다
  const toggle = page.locator('button[aria-controls="task-scores"]')
  await expect(toggle).toHaveText('펼치기')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(toggle).toHaveText('접기')
  await expect(byTask).toContainText('86건')
  await expect(byTask).toContainText('69.7점')
})

test('빠른 선택과 날짜 입력으로 기간을 바꾸고, 시작일이 늦으면 부르지 않는다', async ({ page }) => {
  const { asked } = await setup(page)
  await page.goto('/console/stats')
  await page.getByRole('button', { name: '최근 7일' }).click()
  await expect.poll(() => asked.at(-1)).toEqual({ from: daysAgo(6), to: ymd(new Date()) })

  await page.getByLabel('시작일').fill('2026-11-01')
  await page.getByLabel('종료일').fill('2026-11-15')
  await expect.poll(() => asked.at(-1)).toEqual({ from: '2026-11-01', to: '2026-11-15' })
  await expect(page.getByText('2026-11-01 ~ 2026-11-15')).toBeVisible()

  const before = asked.length
  await page.getByLabel('시작일').fill('2026-11-20')
  await expect(page.getByRole('alert')).toContainText('시작일이 종료일보다 늦지 않게')
  expect(asked.length).toBe(before)
})

test('서버가 거절하면 이유를 보여 준다', async ({ page }) => {
  await mockApi(page)
  await page.route((url) => url.pathname === '/api/admin/stats', (route) =>
    route.fulfill({ status: 400, json: { message: '기간은 366일 이내로 골라 주세요.' } }))
  await page.goto('/console/stats')
  await expect(page.getByText('기간은 366일 이내로 골라 주세요.')).toBeVisible()
})

test('@shot 관리자 통계 화면 스크린샷', async ({ page }, info) => {
  await setup(page)
  await page.goto('/console/stats')
  await expect(page.getByText('64.3점')).toBeVisible()
  await page.screenshot({ path: `.shots/admin-stats/${info.project.name}.png`, fullPage: true })
})
