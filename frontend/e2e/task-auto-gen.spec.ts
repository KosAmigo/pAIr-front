// 과제 만들기 – 자동 생성 탭: 폼 → 주제 미리보기(빼기·다시 받기) → 만들기 → '만드는 중인 과제' 페이지의 목록(대기·진행·완료) → 대기 취소.
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

    // 기본값: 60분, 자가진단, 10개, 일반, 마감 칸은 흐리게(꺼짐)
    await expect(page.getByRole('radio', { name: '60분' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByRole('radio', { name: /^자가진단/ })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByLabel('개수')).toHaveValue('10')
    await expect(page.getByRole('radio', { name: '일반' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByRole('radiogroup', { name: '마감' })).toHaveAttribute('aria-disabled', 'true') // 바로: 같은 자리에서 흐리게

    await page.getByRole('radio', { name: '절약' }).click()
    await expect(page.getByRole('radio', { name: /^3시간/ })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByText('비용은 일반의 절반이에요')).toBeVisible()
    await page.getByRole('radio', { name: '일반' }).click()
    await expect(page.getByRole('radiogroup', { name: '마감' })).toHaveAttribute('aria-disabled', 'true') // 바로: 같은 자리에서 흐리게

    // 개수는 1~10 안으로 맞춰진다
    await page.getByLabel('개수').fill('99')
    await page.getByLabel('개수').blur()
    await expect(page.getByLabel('개수')).toHaveValue('10')
  })

  test('미리보기 → 카드 빼기 → 다시 받기(exclude) → 만들기 → 새 페이지의 목록 → 대기 취소', async ({ page }) => {
    const api = await mockApi(page)
    await page.goto('/console/tasks/new')
    await page.getByRole('button', { name: /^개발/ }).click()
    await page.getByLabel('개수').fill('4')
    await page.getByRole('radio', { name: '절약' }).click()
    await page.getByRole('radio', { name: /^6시간/ }).click()
    await page.getByRole('button', { name: /주제 미리보기/ }).click()

    const cards = page.getByRole('article')
    await expect(cards).toHaveCount(4)
    expect(api.sent.find((r) => r.path.endsWith('/auto/preview'))!.body).toEqual({ track: 'DEV', minutes: 60, count: 4 })

    // 카드 빼기
    await page.getByRole('button', { name: /자동 주제 1.* 빼기/ }).click()
    await expect(cards).toHaveCount(3)

    // 다시 받기: 본 것(뺀 것 포함) 4개를 exclude 로
    await page.getByRole('button', { name: '다시 받기' }).click()
    await expect(page.getByRole('article').getByText(/자동 주제 5/)).toBeVisible()
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

    // 만들기 뒤엔 만드는 중인 과제 페이지로 가고, 방금 만든 묶음의 첫 작업(a1)이 골라져 있다
    await expect(page).toHaveURL(/\/console\/tasks\/generating\?job=a1/)
    // 진행 목록: 작업마다 카드 하나. 진행·대기는 위에, 끝난 작업(a3)은 '완료 1' 줄 안에 접혀 있다
    const list = page.getByRole('region', { name: '진행 목록' })
    const rows = list.getByTestId('gen-job')
    await expect(rows).toHaveCount(3)
    await expect(page.getByTestId('gen-done-toggle')).toContainText(/완료\s*1/)
    await expect(page.getByTestId('gen-done-toggle')).toHaveAttribute('aria-expanded', 'false')
    await expect(rows.nth(0).getByRole('status')).toHaveText('생성 중')
    await expect(rows.nth(0)).toContainText('설계도 작성 중')
    await expect(rows.nth(0)).toContainText('마감 15:05') // 배치: 마감 시각
    await expect(rows.nth(1).getByRole('status')).toHaveText('대기 1번째')
    await page.getByTestId('gen-done-toggle').click()
    await expect(rows.nth(2).getByRole('status')).toHaveText('완료')
    await expect(rows.nth(2)).toContainText('통과 1 · 경고 1 · 실패 0')

    // 대기 중인 것만 취소 버튼이 있다
    await expect(list.getByRole('button', { name: /취소/ })).toHaveCount(1)
    await list.getByRole('button', { name: /취소/ }).click()
    // 취소된 작업은 끝난 쪽(완료 줄)으로 내려간다
    await expect(page.getByTestId('gen-done-toggle')).toContainText(/완료\s*2/)
    await expect(list.getByRole('status').filter({ hasText: '취소됨' })).toHaveCount(1)
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
    await expect(page).toHaveURL(/\/console\/tasks\/generating\?job=a1/)
    const auto = api.sent.find((r) => r.path === '/api/admin/task-gen/auto')!
    expect(auto.body).toEqual({ track: 'BIZ', minutes: 20, count: 3, usage: 'LIVE', mode: 'NOW' })
    await expect(page.getByRole('button', { name: '서버가 고른 주제 1 자세히 보기' })).toBeVisible()
  })

  test('이미 시작해서 취소할 수 없으면(409) 쉬운 말로 알려 준다', async ({ page }) => {
    await mockApi(page)
    await page.route('**/api/admin/task-gen/a2/cancel', (route) => route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ message: 'x' }) }))
    await page.goto('/console/tasks/new')
    await page.getByRole('button', { name: /^개발/ }).click()
    await page.getByLabel('개수').fill('3')
    await page.getByRole('button', { name: '미리보기 없이 바로 만들기' }).click()
    await expect(page).toHaveURL(/\/console\/tasks\/generating/)
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
    await page.goto('/console/tasks/generating')
    const row = page.getByRole('region', { name: '진행 목록' }).getByTestId('gen-job')
    await expect(row.getByRole('status')).toHaveText('절약 모드 대기 중')
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
    await expect(page.getByRole('radiogroup', { name: '마감' })).toHaveAttribute('aria-disabled', 'true') // 바로: 같은 자리에서 흐리게
    await page.getByRole('radio', { name: '절약' }).click()
    await expect(page.getByRole('radiogroup', { name: '마감' })).toHaveAttribute('aria-disabled', 'false')
    await page.getByRole('radio', { name: /^12시간/ }).click()
    await page.getByRole('button', { name: /^다음/ }).click()
    await expect(page.getByText(/절약 · 마감/)).toBeVisible()
    await page.getByRole('button', { name: '과제 만들기' }).click()
    await expect(page.getByText(/과제를 만들었어요/)).toBeVisible({ timeout: 15_000 })
    const gen = api.sent.find((r) => r.path === '/api/admin/task-gen')!
    expect(gen.body).toMatchObject({ track: 'DEV', mode: 'BATCH', batchDeadlineHours: 12 })
  })
})

test.describe('바로 ↔ 배치 전환은 레이아웃을 움직이지 않는다', () => {
  for (const [tab, url, action] of [
    ['자동 생성', '/console/tasks/new', /주제 미리보기/],
    ['직접 만들기', '/console/tasks/new?tab=manual', /^다음/],
  ] as const) {
    test(`${tab}: 아래 버튼·미리보기 높이가 같고, 마감 줄은 항상 있다`, async ({ page }) => {
      await mockApi(page)
      await page.goto(url)
      const btn = page.getByRole('button', { name: action }).last()
      const aside = page.getByRole('complementary', { name: '고른 값 요약' })
      await expect(page.getByText('일반은 30분~1시간 안에 끝나요')).toBeVisible()
      // 글꼴이 다 불러와지고 폼이 들어오는 연출이 끝난 뒤에 잰다(글꼴이 바뀌면 버튼 폭이 달라진다)
      await page.evaluate(async () => {
        await document.fonts.ready
        // 끝없이 도는 연출(반복 무한)은 기다리지 않는다
        const finite = document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        await Promise.all(finite.map((a) => a.finished.catch(() => undefined)))
      })
      // 스크롤과 상관없이 비교하려고 폼 맨 위(직군 제목)에서 버튼까지의 거리와 버튼 크기·x 를 잰다
      const top = page.getByRole('heading', { name: '직군' })
      const measure = async () => {
        const [b, t] = [await btn.boundingBox(), await top.boundingBox()]
        return { dy: b!.y - t!.y, x: b!.x, w: b!.width, h: b!.height }
      }
      const b0 = await measure()
      const a0 = await aside.boundingBox()
      await page.getByRole('radio', { name: '절약' }).click()
      await expect(page.getByRole('radiogroup', { name: '마감' })).toHaveAttribute('aria-disabled', 'false')
      await expect(page.getByText('비용은 일반의 절반이에요. 3시간 안에 끝나요')).toBeVisible()
      expect(await measure()).toEqual(b0)
      expect((await aside.boundingBox())!.height).toBe(a0!.height)
      await page.getByRole('radio', { name: '일반' }).click()
      expect(await measure()).toEqual(b0)
    })
  }
})
