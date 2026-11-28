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
  const req = page.locator('body') // 개요는 요구사항 칸(기능 카드)과 예시 칸으로 나뉜다
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
  const req = page.locator('body') // 개요는 요구사항 칸(기능 카드)과 예시 칸으로 나뉜다
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

const J = (o: unknown) => JSON.stringify(o)
const TABLE = [
  '만들 기능: `PassRegistry.availableCodes(LocalDate visitDate): List<String>` — 방문 날짜에 쓸 수 있는 이용권 코드를 돌려줘요',
  '- visitDate: 방문 예정 날짜',
  '만들 기능: `PassRegistry.canEnter(String code, LocalDate visitDate, int headCount): boolean` — 입장 가능 여부를 돌려줘요',
  '- code: 이용권 코드',
  '- visitDate: 방문 예정 날짜',
  '- headCount: 입장 인원',
  '예시 공통: 모든 시각은 한국 시간(+09:00)',
  '예시 준비: ' + J({ method: 'PassRegistry.availableCodes', text: '등록된 이용권: POOL-A 2026-06-30 만료, GYM-B 2026-06-01 만료' }),
  '예시: ' + J({ method: 'PassRegistry.availableCodes', args: [['visitDate', '2026-06-10']], expected: '["POOL-A", "GYM-B"]' }),
  '예시: ' + J({ method: 'PassRegistry.availableCodes', args: [['visitDate', '2026-06-20']], expected: '["POOL-A"]' }),
  '예시: ' + J({ method: 'PassRegistry.canEnter', args: [['code', '"POOL-A"'], ['visitDate', '2026-06-10'], ['headCount', '2']], expected: 'true' }),
  '예시: ' + J({ method: 'PassRegistry.canEnter', args: [['code', '"GYM-B"'], ['visitDate', '2026-06-20'], ['headCount', '1']], expected: 'false' }),
  '예시: ' + J({ method: 'Clock.today', expected: '2026-06-10' }),
]

test('@shot 새 모양: 함수별 매개변수|결과 표, 준비 상자, 공통 안내', async ({ page }, info) => {
  test.setTimeout(60_000)
  await setup(page, 'D1', TABLE)
  await page.goto('/console/tasks/D1')
  const req = page.locator('body')
  await expect(req.getByTestId('req-common')).toContainText('한국 시간')
  await expect(req.getByTestId('req-feature')).toHaveCount(2)
  await expect(req.getByTestId('req-prep')).toHaveCount(1) // 함수별 한 번
  // 개요에서는 요구사항 칸에 기능 카드만, 예시 칸에 표 (카드 아래 표 붙이기는 응시 화면 몫)
  const tables = req.getByTestId('requirements-examples').getByTestId('req-table')
  await expect(tables).toHaveCount(3) // 함수 둘 + 카드 없는 함수 하나
  await expect(tables.nth(0).getByRole('columnheader')).toHaveText(['visitDate', '결과'])
  await expect(tables.nth(1).getByRole('columnheader')).toHaveText(['code', 'visitDate', 'headCount', '결과'])
  await expect(tables.nth(2).getByRole('columnheader')).toHaveText(['결과']) // 매개변수 없음
  await expect(tables.nth(2)).toContainText('Clock.today')
  await expect(tables.nth(0).getByTestId('req-example')).toHaveCount(2)
  await req.getByTestId('requirements-examples').scrollIntoViewIfNeeded()
  await req.getByTestId('requirements-examples').screenshot({ path: `.shots/requirements-table/${info.project.name}-overview.png` })
})

test('옛 모양과 새 모양이 섞여도 둘 다 보인다', async ({ page }) => {
  test.setTimeout(60_000)
  await setup(page, 'D1', [...OLD, '예시: ' + J({ method: 'A.f', args: [['a', '1']], expected: '2' }), '예시: {깨진 JSON'])
  await page.goto('/console/tasks/D1')
  const req = page.locator('body') // 개요는 요구사항 칸(기능 카드)과 예시 칸으로 나뉜다
  await expect(req.getByTestId('req-table')).toHaveCount(1)
  await expect(req.getByTestId('req-example')).toHaveCount(3)
  await expect(req).toContainText('예시: {깨진 JSON') // 읽지 못한 줄은 글로
})
