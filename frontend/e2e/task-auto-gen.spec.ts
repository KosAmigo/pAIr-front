// 과제 만들기 – 자동 생성 탭: 폼 → 주제 미리보기(빼기·다시 받기) → 만들기 → 진행 목록(대기·진행·완료) → 대기 취소.
// 그리고 탭이 주소에 남는지, 직접 만들기의 배치 선택이 요청 본문에 들어가는지.
import { expect, test } from '@playwright/test'
import { mockApi } from './mock'

test.describe('자동 생성', () => {
  test('폼 기본값, 배치를 고르면 마감 칸이 나온다', async ({ page }) => {
    await mockApi(page)
    await page.goto('/console/tasks/new')
    await expect(page.getByRole('heading', { name: '과제 만들기', level: 1 })).toBeVisible()
    await expect(page.getByRole('tab', { name: '자동 생성' })).toHaveAttribute('aria-selected', 'true')
    expect(new URL(page.url()).searchParams.has('tab')).toBe(false)

    // 직군을 안 고르고 미리보기
    await page.getByRole('button', { name: /주제 미리보기/ }).click()
    await expect(page.getByRole('alert').filter({ hasText: '직군을 고르세요' })).toBeVisible()

    // 기본값: 60분, 자가진단, 10개, 바로 만들기, 마감 칸 없음
    await expect(page.getByRole('radio', { name: '60분' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByRole('radio', { name: /^자가진단/ })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByLabel('개수')).toHaveValue('10')
    await expect(page.getByRole('radio', { name: '바로 만들기' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByRole('radiogroup', { name: '마감' })).toHaveCount(0)

    await page.getByRole('radio', { name: '배치' }).click()
    await expect(page.getByRole('radio', { name: '3시간' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByText('비용 약 절반, 마감 안에 끝나요')).toBeVisible()
    await page.getByRole('radio', { name: '바로 만들기' }).click()
    await expect(page.getByRole('radiogroup', { name: '마감' })).toHaveCount(0)

    // 개수는 1~10 안으로 맞춰진다
    await page.getByLabel('개수').fill('99')
    await page.getByLabel('개수').blur()
    await expect(page.getByLabel('개수')).toHaveValue('10')
  })

  test('미리보기 → 카드 빼기 → 다시 받기(exclude) → 만들기 → 진행 목록 → 대기 취소', async ({ page }) => {
    const api = await mockApi(page)
    await page.goto('/console/tasks/new')
    await page.getByRole('button', { name: /^개발/ }).click()
    await page.getByLabel('개수').fill('4')
    await page.getByRole('radio', { name: '배치' }).click()
    await page.getByRole('radio', { name: '6시간' }).click()
    await page.getByRole('button', { name: /주제 미리보기/ }).click()

    const cards = page.getByRole('article')
    await expect(cards).toHaveCount(4)
    expect(api.sent.find((r) => r.path.endsWith('/auto/preview'))!.body).toEqual({ track: 'DEV', minutes: 60, count: 4 })

    // 카드 빼기
    await page.getByRole('button', { name: /자동 주제 1.* 빼기/ }).click()
    await expect(cards).toHaveCount(3)

    // 다시 받기: 본 것(뺀 것 포함) 4개를 exclude 로
    await page.getByRole('button', { name: '다시 받기' }).click()
    await expect(page.getByText(/자동 주제 5/)).toBeVisible()
    await expect(cards).toHaveCount(4)
    const again = api.sent.filter((r) => r.path.endsWith('/auto/preview')).at(-1)!
    expect(again.body.exclude).toHaveLength(4)
    expect(again.body.exclude[0]).toContain('자동 주제 1')

    await page.getByRole('button', { name: /자동 주제 5.* 빼기/ }).click()
    await expect(cards).toHaveCount(3)
    await page.getByRole('button', { name: '이대로 만들기' }).click()

    const auto = api.sent.find((r) => r.path === '/api/admin/task-gen/auto')!
    expect(auto.body).toMatchObject({ track: 'DEV', minutes: 60, usage: 'SELF', count: 3, mode: 'BATCH', batchDeadlineHours: 6 })
    expect(auto.body.topics).toHaveLength(3)
    expect(auto.body.topics[0]).toHaveProperty('trapType')

    // 진행 목록: 한 묶음에 진행·대기·완료 행
    const list = page.getByRole('region', { name: '진행 목록' })
    await expect(list.getByText('3개 중 1개 끝남')).toBeVisible()
    const rows = list.getByTestId('gen-job')
    await expect(rows).toHaveCount(3)
    await expect(rows.nth(0).getByRole('status')).toHaveText('생성 중')
    await expect(rows.nth(0)).toContainText('설계도 작성 중')
    await expect(rows.nth(0)).toContainText('마감 15:05') // 배치: 마감 시각
    await expect(rows.nth(1).getByRole('status')).toHaveText('대기 1번째')
    await expect(rows.nth(2).getByRole('status')).toHaveText('완료')
    await expect(rows.nth(2)).toContainText('통과 1 · 경고 1 · 실패 0')
    await expect(rows.nth(2).getByRole('link', { name: /검수하기/ })).toHaveAttribute('href', '/console/tasks/N7')

    // 대기 중인 것만 취소 버튼이 있다
    await expect(list.getByRole('button', { name: /취소/ })).toHaveCount(1)
    await list.getByRole('button', { name: /취소/ }).click()
    await expect(rows.nth(1).getByRole('status')).toHaveText('취소됨')
    expect(api.sent.some((r) => r.path === '/api/admin/task-gen/a2/cancel')).toBe(true)
    await expect(list.getByRole('button', { name: /취소/ })).toHaveCount(0)
  })

  test('건너뛰고 바로 만들기는 topics 없이 보낸다', async ({ page }) => {
    const api = await mockApi(page)
    await page.goto('/console/tasks/new')
    await page.getByRole('button', { name: /^비개발/ }).click()
    await page.getByRole('radio', { name: '20분' }).click()
    await page.getByRole('radio', { name: /^실전/ }).click()
    await page.getByLabel('개수').fill('3')
    await page.getByRole('button', { name: /주제 미리보기/ }).click()
    await expect(page.getByRole('article')).toHaveCount(3)
    await page.getByRole('button', { name: '건너뛰고 바로 만들기' }).click()
    await expect(page.getByRole('status').filter({ hasText: '3개를 만들기 시작했어요' })).toBeVisible()
    const auto = api.sent.find((r) => r.path === '/api/admin/task-gen/auto')!
    expect(auto.body).toEqual({ track: 'BIZ', minutes: 20, count: 3, usage: 'LIVE', mode: 'NOW' })
    await expect(page.getByText('서버가 고른 주제 1')).toBeVisible()
  })

  test('이미 시작해서 취소할 수 없으면(409) 쉬운 말로 알려 준다', async ({ page }) => {
    await mockApi(page)
    await page.route('**/api/admin/task-gen/a2/cancel', (route) => route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ message: 'x' }) }))
    await page.goto('/console/tasks/new')
    await page.getByRole('button', { name: /^개발/ }).click()
    await page.getByLabel('개수').fill('3')
    await page.getByRole('button', { name: '미리보기 없이 바로 만들기' }).click()
    await page.getByRole('button', { name: /취소/ }).click()
    await expect(page.getByRole('alert').filter({ hasText: '이미 시작했거나 끝나서 취소할 수 없어요' })).toBeVisible()
  })

  test('배치 대기 중(waitingBatch)이면 단계 대신 배치 대기와 마감을 보여 준다', async ({ page }) => {
    await mockApi(page)
    const deadline = new Date(2026, 10, 26, 18, 30).toISOString()
    await page.route('**/api/admin/task-gen/jobs*', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify([{ jobId: 'w1', batchId: null, status: 'RUNNING', step: '설계도 작성 중', waitingBatch: true, mode: 'BATCH', deadlineAt: deadline, topic: '배치 주제', track: 'DEV', minutes: 40, checks: [], error: null, taskCode: null, createdAt: deadline }]),
      }),
    )
    await page.goto('/console/tasks/new')
    const row = page.getByRole('region', { name: '진행 목록' }).getByTestId('gen-job')
    await expect(row.getByRole('status')).toHaveText('배치 대기 중')
    await expect(row).toContainText('마감 18:30')
  })
})

test.describe('탭과 직접 만들기', () => {
  test('탭은 주소에 남아 새로고침해도 유지된다', async ({ page }) => {
    await mockApi(page)
    await page.goto('/console/tasks/new')
    await page.getByRole('tab', { name: '직접 만들기' }).click()
    await expect(page).toHaveURL(/tab=manual/)
    await expect(page.getByRole('heading', { name: '상황과 함정' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('tab', { name: '직접 만들기' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('heading', { name: '상황과 함정' })).toBeVisible()
    await page.getByRole('tab', { name: '자동 생성' }).click()
    expect(new URL(page.url()).searchParams.has('tab')).toBe(false)
    await expect(page.getByLabel('개수')).toBeVisible()
  })

  test('직접 만들기에서 배치를 고르면 마감 칸이 보이고 요청 본문에 들어간다', async ({ page }) => {
    const api = await mockApi(page)
    await page.goto('/console/tasks/new?tab=manual')
    await page.getByRole('button', { name: /^개발/ }).click()
    await page.getByLabel('상황', { exact: true }).fill('주문 취소 재고 복구')
    await page.getByLabel('함정').fill('취소가 두 번 오면 재고가 두 번 늘어남')
    await expect(page.getByRole('radiogroup', { name: '마감' })).toHaveCount(0)
    await page.getByRole('radio', { name: '배치' }).click()
    await expect(page.getByRole('radiogroup', { name: '마감' })).toBeVisible()
    await page.getByRole('radio', { name: '1시간' }).click()
    await page.getByRole('button', { name: /^다음/ }).click()
    await expect(page.getByText(/배치 · 마감/)).toBeVisible()
    await page.getByRole('button', { name: '과제 만들기' }).click()
    await expect(page.getByText(/과제를 만들었어요/)).toBeVisible({ timeout: 15_000 })
    const gen = api.sent.find((r) => r.path === '/api/admin/task-gen')!
    expect(gen.body).toMatchObject({ track: 'DEV', mode: 'BATCH', batchDeadlineHours: 1 })
  })
})
