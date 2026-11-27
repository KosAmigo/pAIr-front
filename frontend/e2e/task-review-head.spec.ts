// 과제 검수 화면(/console/tasks/:code): 머리 안의 상태 칩 + 용도 토글, 메타에 영어 코드 없음, 생성 기록의 단계별 모델·횟수.
import { expect, test, type Page } from '@playwright/test'
import { mockApi, TASKS } from './mock'

const detail = (id: string) => ({ summary: TASKS.find((t) => t.id === id), definition: { id, title: id, description: [], requirements: [], notes: [], followUps: [], d4Minutes: null, requiredHeadings: null } })

async function setup(page: Page, id: string) {
  await mockApi(page)
  await page.route(`**/api/console/tasks/${id}`, (route) => route.fulfill({ json: detail(id) }))
  await page.route(`**/api/admin/tasks/${id}/gen-report`, (route) =>
    route.fulfill({
      json: {
        model: 'gpt-6.1-sol, gpt-6.1-terra, claude-sonnet-5-5', attempts: 2, seconds: 95, inputTokens: 12000, outputTokens: 3400, passed: true,
        checks: [{ name: '컴파일', ok: true, detail: '' }],
        details: {
          stages: [
            { stage: '설계도 작성 중', model: 'gpt-6.1-sol', via: 'batch' },
            { stage: '글 작성 중', model: 'gpt-6.1-sol', via: 'batch' },
            { stage: '글 작성 중', model: 'gpt-6.1-sol', via: 'now' },
            { stage: '시작 코드 작성 중', model: 'gpt-6.1-sol', via: 'now' },
            { stage: '관련 적은 자료 작성 중', model: 'gpt-6.1-terra', via: 'now' },
            { stage: '관문 검사 중', model: 'gpt-6.1-sol', via: 'now' },
            { stage: '관문 검사 중', model: 'claude-sonnet-5-5', via: 'now' },
          ],
        },
      },
    }),
  )
}

test('머리: 상태 칩 + 용도 토글이 한 곳에 있고, 가지 그림·영어 코드는 없다', async ({ page }) => {
  test.setTimeout(60_000)
  await setup(page, 'D1') // 검수 전(HIDDEN) 개발 과제
  await page.goto('/console/tasks/D1')
  const head = page.getByRole('region', { name: '과제 요약' })
  const status = head.getByRole('group', { name: '상태와 용도' })
  await expect(status).toContainText('검수 전')
  await expect(status.getByRole('radiogroup', { name: '용도 바꾸기' })).toBeVisible() // 검수 전이면 바꿀 수 있다
  await expect(page.getByLabel('과제 상태 흐름')).toHaveCount(0) // 옛 가지 그림 없음
  // 메타 줄에는 직군만 있고 과제 코드(D1)가 없다
  const meta = head.locator('.font-mono').first()
  await expect(meta).toContainText('개발')
  await expect(meta).not.toContainText('D1')
})

test('머리: 공개한 과제는 용도가 읽기 전용 칩', async ({ page }) => {
  test.setTimeout(60_000)
  await setup(page, 'A1') // 자가진단(공개)
  await page.goto('/console/tasks/A1')
  const status = page.getByRole('group', { name: '상태와 용도' })
  await expect(status).toContainText('자가진단')
  await expect(status.getByRole('radiogroup')).toHaveCount(0)
  await expect(status.getByLabel('용도 자가진단')).toBeVisible()
})

test('생성 기록: 단계별 모델과 단계별 만든 횟수(배치·바로)', async ({ page }) => {
  test.setTimeout(60_000)
  await setup(page, 'D1')
  await page.goto('/console/tasks/D1?tab=report')
  const models = page.getByRole('listitem').filter({ hasText: '생성 모델' })
  await expect(models).toContainText('설계도 sol')
  await expect(models).toContainText('글 sol')
  await expect(models).toContainText('자료 terra')
  await expect(models).toContainText('검사 sol/sonnet')
  const times = page.getByRole('listitem').filter({ hasText: '만든 횟수' })
  await expect(times).toContainText('글 2') // 글은 두 번 만들었다
  await expect(times).toContainText('설계도 1')
  await expect(times).not.toContainText('검사')
  await expect(times).toContainText('배치 2 · 바로 5')
  await expect(page.getByRole('listitem').filter({ hasText: '걸린 시간' })).toContainText('95초')
})
