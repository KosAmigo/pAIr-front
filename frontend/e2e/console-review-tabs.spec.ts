// 콘솔 과제 검수: 개요 2×2 격자(참고 사항 없음), 파일 폴더 트리(_gen 접힘), 자동 확인 요약 + 접힌 묶음.
// @shot 은 .shots/console-review-tabs/ 에 전체 페이지 스크린샷을 남긴다(저장소에는 올리지 않는다).
import { expect, test, type Page } from '@playwright/test'
import { mockApi, TASKS } from './mock'

const J = (o: unknown) => JSON.stringify(o)
const REQ = [
  '만들 기능: `PassRegistry.availableCodes(LocalDate visitDate): List<String>` — 방문 날짜에 쓸 수 있는 이용권 코드를 돌려줘요',
  '- visitDate: 방문 예정 날짜',
  '만들 기능: `PassRegistry.canEnter(String code, LocalDate visitDate, int headCount): boolean` — 입장 가능 여부를 돌려줘요',
  '- code: 이용권 코드',
  '- visitDate: 방문 예정 날짜',
  '- headCount: 입장 인원',
  '예시 공통: 모든 시각은 한국 시간(+09:00)',
  '예시 준비: ' + J({ method: 'PassRegistry.availableCodes', text: '등록된 이용권: POOL-A 2026-06-30 만료, GYM-B 2026-06-01 만료' }),
  '예시: ' + J({ method: 'PassRegistry.availableCodes', args: [['visitDate', '2026-06-10']], expected: '["POOL-A", "GYM-B"]' }),
  '예시: ' + J({ method: 'PassRegistry.canEnter', args: [['code', '"POOL-A"'], ['visitDate', '2026-06-10'], ['headCount', '2']], expected: 'true' }),
]
const FILES = [
  { path: 'src/main/java/com/pair/pass/PassRegistry.java', visibility: 'VISIBLE', content: 'class PassRegistry {}' },
  { path: 'src/main/java/com/pair/pass/Pass.java', visibility: 'VISIBLE', content: 'record Pass() {}' },
  { path: 'src/test/java/com/pair/pass/PassRegistryTest.java', visibility: 'HIDDEN', content: 'class T {}' },
  { path: 'README.md', visibility: 'VISIBLE', content: '# 이용권' },
  { path: '_gen/report.json', visibility: 'HIDDEN', content: '{}' },
  { path: '_gen/blueprint.json', visibility: 'HIDDEN', content: '{}' },
]
const CHECKS = [
  { name: '컴파일', ok: true, detail: '' },
  { name: '시작 코드 실행', ok: true, detail: '' },
  { name: '분량 대비 시간', ok: false, level: 'warn', detail: '40분 치고 분량이 적어요' },
  { name: '정답 코드 통과', ok: false, detail: '테스트 2개 중 1개가 실패해요' },
]

async function setup(page: Page) {
  await mockApi(page)
  await page.route('**/api/console/tasks/D1', (route) =>
    route.fulfill({
      json: {
        summary: TASKS.find((t) => t.id === 'D1'),
        definition: { id: 'D1', title: 'D1', description: ['이용권 서비스를 만드세요.'], requirements: REQ, notes: ['고정 안내 문구'], followUps: ['왜 이렇게 설계했나요?'], d4Minutes: null, requiredHeadings: null, openFile: 'src/main/java/com/pair/pass/PassRegistry.java', editableFile: null },
      },
    }),
  )
  await page.route('**/api/console/tasks/D1/files', (route) => route.fulfill({ json: FILES }))
  await page.route('**/api/admin/tasks/D1/gen-report', (route) => route.fulfill({ json: { model: 'm', attempts: 2, seconds: 95, inputTokens: 12000, outputTokens: 3400, checks: CHECKS } }))
}

test('개요: 2×2 격자, 참고 사항 없음, 예시 칸에 함수별 표', async ({ page }) => {
  test.setTimeout(60_000)
  await setup(page)
  await page.goto('/console/tasks/D1')
  await expect(page.getByText('고정 안내 문구')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: '참고 사항' })).toHaveCount(0)
  const heads = page.getByRole('heading', { level: 2 })
  await expect(heads.first()).toBeVisible({ timeout: 20_000 })
  await expect(heads).toHaveText(['과제 설명', '요구사항', '후속 질문', '예시'])
  const [a, b, c, d] = await Promise.all([0, 1, 2, 3].map((i) => heads.nth(i).boundingBox()))
  expect(Math.abs(a!.y - b!.y)).toBeLessThan(4) // 위 줄
  expect(Math.abs(c!.y - d!.y)).toBeLessThan(4) // 아래 줄
  expect(c!.y).toBeGreaterThan(a!.y)
  // 요구사항 칸은 기능 카드만, 표는 예시 칸에
  await expect(page.getByTestId('requirements').getByTestId('req-feature')).toHaveCount(2)
  await expect(page.getByTestId('requirements').getByTestId('req-table')).toHaveCount(0)
  const ex = page.getByTestId('requirements-examples')
  await expect(ex.getByTestId('req-common')).toContainText('한국 시간')
  await expect(ex.getByTestId('req-table')).toHaveCount(2)
  await expect(ex.getByTestId('req-prep')).toHaveCount(1)
})

test('@shot 개요 전체 페이지', async ({ page }, info) => {
  test.setTimeout(60_000)
  await page.setViewportSize({ width: info.project.use.viewport?.width ?? 1280, height: 1500 }) // 안쪽 스크롤 영역까지 한 장에
  await setup(page)
  await page.goto('/console/tasks/D1')
  await expect(page.getByTestId('requirements-examples')).toBeVisible()
  await page.waitForTimeout(800)
  await page.screenshot({ path: `.shots/console-review-tabs/${info.project.name}-overview.png`, fullPage: true })
})

test('파일: 폴더 트리, 폴더 접기, _gen 은 맨 아래 접힘', async ({ page }) => {
  test.setTimeout(60_000)
  await setup(page)
  await page.goto('/console/tasks/D1?tab=files')
  const tree = page.getByRole('navigation', { name: '과제 파일' })
  await expect(tree.getByRole('button', { name: /PassRegistry\.java/ }).first()).toBeVisible() // 이름만 보인다
  await expect(tree.getByText('처음')).toBeVisible()
  const items = tree.locator('> ul > li > button')
  await expect(items.last()).toContainText('_gen') // 맨 아래
  await expect(tree.getByRole('button', { name: /report\.json/ })).toBeHidden() // 접힘
  await tree.getByRole('button', { name: /_gen/ }).click()
  await expect(tree.getByRole('button', { name: /report\.json/ })).toBeVisible()
  await tree.getByRole('button', { name: /^.*\bsrc\b/ }).first().click() // src 접기
  await expect(tree.getByRole('button', { name: /^.*Pass\.java/ })).toBeHidden()
  await tree.getByRole('button', { name: /README\.md/ }).click()
  await expect(page.locator('pre')).toContainText('이용권')
})

test('@shot 파일 탭 전체 페이지', async ({ page }, info) => {
  test.setTimeout(60_000)
  await page.setViewportSize({ width: info.project.use.viewport?.width ?? 1280, height: 1300 })
  await setup(page)
  await page.goto('/console/tasks/D1?tab=files')
  await page.getByRole('navigation', { name: '과제 파일' }).getByRole('button', { name: /_gen/ }).click()
  await page.waitForTimeout(600)
  await page.screenshot({ path: `.shots/console-review-tabs/${info.project.name}-files.png`, fullPage: true })
})

test('자동 확인: 한 줄 요약, 묶음은 접혀 있고 펼치면 항목', async ({ page }) => {
  test.setTimeout(60_000)
  await setup(page)
  await page.goto('/console/tasks/D1?tab=report')
  const rep = page.getByTestId('check-report')
  await expect(rep.getByTestId('sum-pass')).toContainText('통과 2')
  await expect(rep.getByTestId('sum-warn')).toContainText('경고 1')
  await expect(rep.getByTestId('sum-fail')).toContainText('실패 1')
  await expect(rep).toContainText('시도 2번')
  const fail = rep.getByTestId('group-fail')
  await expect(fail.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
  await expect(fail.getByRole('button')).toContainText('정답 코드 통과') // 접힌 채로도 이름은 보인다
  await expect(fail.getByText('테스트 2개 중 1개가 실패해요')).toBeHidden()
  await fail.getByRole('button').click()
  await expect(fail.getByText('테스트 2개 중 1개가 실패해요')).toBeVisible()
  await expect(rep.getByTestId('group-pass').getByRole('button')).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('[style*="width"][aria-hidden]')).toHaveCount(0) // 초록 진행 바 없음
})

test('@shot 자동 확인 탭 전체 페이지', async ({ page }, info) => {
  test.setTimeout(60_000)
  await page.setViewportSize({ width: info.project.use.viewport?.width ?? 1280, height: 1000 })
  await setup(page)
  await page.goto('/console/tasks/D1?tab=report')
  await page.getByTestId('group-warn').getByRole('button').click()
  await page.waitForTimeout(600)
  await page.screenshot({ path: `.shots/console-review-tabs/${info.project.name}-report.png`, fullPage: true })
})
