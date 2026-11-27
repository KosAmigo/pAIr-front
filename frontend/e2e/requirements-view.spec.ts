// 요구사항 표시: '만들 기능' 카드(시그니처·매개변수) + 예시 표. 예전 형식(예시 줄만)은 표만. 검수 상세·미리보기·만드는 중인 과제 상세가 같은 컴포넌트를 쓴다.
import { expect, test, type Page } from '@playwright/test'
import { mockApi, TASKS } from './mock'

const NEW = [
  '만들 기능: `UsageService.payable(int base, int used, int cap, int fee): int` — 이번 달 내야 할 금액을 돌려줘요',
  '- base: 기본 요금(원)',
  '- used: 사용한 금액',
  '새 UsageService에 addUsage("주문다", 60000)을 호출한 뒤 payable(20000, 5000, 100000, 3000) → 18000',
]
const OLD = ['coupon(1000, 2) → 800', 'coupon(500, 0) → 500']

const detail = (id: string, requirements: string[]) => ({
  summary: TASKS.find((t) => t.id === id),
  definition: { id, title: id, description: ['설명'], requirements, notes: [], followUps: [], d4Minutes: null, requiredHeadings: null },
})
async function setup(page: Page, id: string, requirements: string[]) {
  await mockApi(page)
  await page.route(`**/api/console/tasks/${id}`, (route) => route.fulfill({ json: detail(id, requirements) }))
}

test('검수 상세: 기능 카드(시그니처·매개변수)와 예시 표', async ({ page }) => {
  test.setTimeout(60_000)
  await setup(page, 'D1', NEW)
  await page.goto('/console/tasks/D1')
  const req = page.getByTestId('requirements')
  const card = req.getByTestId('req-feature')
  await expect(card).toHaveCount(1)
  await expect(card).toContainText('UsageService.payable(int base, int used, int cap, int fee): int')
  await expect(card.locator('b')).toHaveText('payable') // 메서드 이름 강조
  await expect(card).toContainText('이번 달 내야 할 금액을 돌려줘요')
  await expect(card.locator('dt code')).toHaveText(['base', 'used'])
  await expect(card.locator('dd').first()).toHaveText('기본 요금(원)')
  // 예시 표: 실제 table, 열 머리 입력/결과, 호출은 줄 단위
  const table = req.getByRole('table')
  await expect(table.getByRole('columnheader')).toHaveText(['입력', '결과'])
  const row = req.getByTestId('req-example')
  await expect(row).toHaveCount(1)
  await expect(row.locator('code')).toHaveText(['addUsage("주문다", 60000)', 'payable(20000, 5000, 100000, 3000)', '18000'])
  await expect(row).not.toContainText('호출한 뒤') // 연결 말은 줄였다
})

test('예전 형식 과제는 예시 표만 보인다', async ({ page }) => {
  test.setTimeout(60_000)
  await setup(page, 'D1', OLD)
  await page.goto('/console/tasks/D1')
  const req = page.getByTestId('requirements')
  await expect(req.getByTestId('req-feature')).toHaveCount(0)
  await expect(req.getByTestId('req-example')).toHaveCount(2)
  await expect(req.getByRole('table').getByRole('row')).toHaveCount(3) // 머리 + 2줄
})

test('글만 있는 요구사항은 예전 번호 목록', async ({ page }) => {
  test.setTimeout(60_000)
  await setup(page, 'D1', ['첫째 조건', '둘째 조건'])
  await page.goto('/console/tasks/D1')
  await expect(page.getByTestId('requirements')).toHaveCount(0)
  await expect(page.getByRole('listitem').filter({ hasText: '둘째 조건' })).toBeVisible()
})

test('미리보기(응시 화면 모양)와 만드는 중인 과제 상세도 같은 표시', async ({ page }) => {
  test.setTimeout(60_000)
  await setup(page, 'D1', NEW)
  await page.goto('/console/tasks/D1/preview')
  await expect(page.getByTestId('req-feature')).toContainText('payable')
  await expect(page.getByTestId('req-example')).toHaveCount(1)

  // 만드는 중인 과제 상세: content.writing.requirements
  const api = await mockApi(page)
  api.seedJobs([{ jobId: 'a3', batchId: 'b1', status: 'DONE', step: '완료', taskCode: 'N7', passed: true, checks: [], error: null, mode: 'NOW', track: 'DEV', minutes: 40, topic: '완료 주제', createdAt: new Date().toISOString() }])
  await page.route('**/api/admin/task-gen/a3/content', (route) =>
    route.fulfill({ json: { jobId: 'a3', status: 'DONE', form: { track: 'DEV', topic: '완료 주제' }, blueprint: { title: 't' }, writing: { description: ['d'], requirements: NEW, notes: null, documents: [] }, code: null, answer: null, fillers: null } }),
  )
  await page.goto('/console/tasks/generating?job=a3')
  await page.getByText('글', { exact: true }).first().click()
  await expect(page.getByTestId('req-feature')).toContainText('UsageService.payable')
  await expect(page.getByTestId('req-example')).toHaveCount(1)
})
