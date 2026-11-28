// 과제 만들기 비용: 만들기 전 예상 비용(자동 생성·직접 만들기 폼) + 만든 뒤 실제 비용(작업 목록·묶음 합계·상세).
import { expect, test } from '@playwright/test'
import { mockApi } from './mock'

const at = (n: number) => new Date(2026, 10, 27, 9, n).toISOString()
const job = (o: Record<string, unknown>) => ({
  batchId: 'b1', status: 'QUEUED', step: null, taskCode: null, passed: null, checks: [], error: null, mode: 'NOW', deadlineAt: null, queuePosition: null,
  track: 'DEV', minutes: 40, ...o,
})
const JOBS = [
  job({ jobId: 'a1', status: 'RUNNING', step: '설계도 작성 중', topic: '진행 주제', createdAt: at(1), costUsd: 0.12 }),
  job({ jobId: 'a2', status: 'QUEUED', queuePosition: 1, topic: '대기 주제', createdAt: at(2), costUsd: null }),
  job({ jobId: 'a3', status: 'DONE', step: '완료', taskCode: 'N7', passed: true, topic: '완료 주제', createdAt: at(3), costUsd: 0.27 }),
]

test.describe('예상 비용', () => {
  test('자동 생성 폼: 값이 바뀔 때마다 한 줄로 보이고, 기록이 적으면 어림값이라고 알려 준다', async ({ page }) => {
    const api = await mockApi(page)
    await page.goto('/console/tasks/new')
    const line = page.getByTestId('cost-estimate')
    await expect(line).toHaveCount(0) // 직군을 고르기 전에는 없다

    await page.getByRole('button', { name: /^개발/ }).click()
    await page.getByLabel('개수').fill('3')
    await expect(line).toHaveText('예상 약 $0.90 (과제당 $0.30 · 최대 $2.40)')
    expect(api.sent.some((r) => r.path === '/api/admin/task-gen/cost-estimate?track=DEV&minutes=60&mode=NOW&count=3')).toBe(true)

    await page.getByRole('radio', { name: '절약' }).click()
    await expect(line).toHaveText('예상 약 $0.45 (과제당 $0.15 · 최대 $1.20)')

    await page.getByRole('radio', { name: '20분' }).click()
    await expect(line).toContainText('기록이 적어 어림값')
  })

  test('예상 비용을 못 불러오면 조용히 숨기고 폼은 그대로 쓸 수 있다', async ({ page }) => {
    const api = await mockApi(page)
    api.failEstimate()
    await page.goto('/console/tasks/new')
    await page.getByRole('button', { name: /^개발/ }).click()
    await expect(page.getByLabel('개수')).toBeVisible()
    await page.waitForTimeout(600)
    await expect(page.getByTestId('cost-estimate')).toHaveCount(0)
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /주제 미리보기/ })).toBeEnabled()
  })

  test('직접 만들기 폼에도 과제 하나 기준으로 보인다', async ({ page }) => {
    await mockApi(page)
    await page.goto('/console/tasks/new?tab=manual')
    await page.getByRole('button', { name: /^개발/ }).click()
    await expect(page.getByTestId('cost-estimate')).toHaveText('예상 약 $0.30 (과제당 $0.30 · 최대 $0.80)')
  })
})

test.describe('실제 비용', () => {
  test('목록: 진행 중은 "지금까지", 끝났으면 금액, 값이 없으면 안 보인다 · 진행 중 요약', async ({ page }) => {
    const api = await mockApi(page)
    api.seedJobs(JOBS)
    await page.goto('/console/tasks/generating')
    const rows = page.getByTestId('gen-job')
    await expect(rows.nth(0).getByTestId('job-cost')).toHaveText('지금까지 $0.12')
    await expect(rows.nth(1).getByTestId('job-cost')).toHaveCount(0)
    await expect(rows.nth(2).getByTestId('job-cost')).toHaveText('$0.27')
    // 묶음 합계는 없고, 진행 중 작업만 모은 작은 요약 한 줄이 있다 (진행 a1 $0.12)
    await expect(page.getByTestId('group-cost')).toHaveCount(0)
    await expect(page.getByTestId('gen-summary')).toContainText('지금까지 $0.12')
  })

  test('상세: 진행 중·끝난 작업의 비용', async ({ page }) => {
    const api = await mockApi(page)
    api.seedJobs(JOBS)
    await page.goto('/console/tasks/generating?job=a1')
    await expect(page.getByTestId('detail-cost')).toHaveText('지금까지 $0.12')
    await page.goto('/console/tasks/generating?job=a3')
    await expect(page.getByTestId('detail-cost')).toHaveText('$0.27')
    await page.goto('/console/tasks/generating?job=a2')
    await expect(page.getByRole('region', { name: '작업 상세' })).toBeVisible()
    await expect(page.getByTestId('detail-cost')).toHaveCount(0)
  })
})
