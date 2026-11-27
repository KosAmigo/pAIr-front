// 과제 콘솔 화면 시나리오: 목록(탭 순서, 직군 하위 필터, 검색)과 과제 만들기(추천 유지, 주제 확인, 생성 요청 본문).
// 동작은 단언으로 검사하고, @shot 테스트는 .shots/task-console-v2/ 에 스크린샷을 저장한다(저장소에는 올리지 않는다).
import { expect, test, type Page } from '@playwright/test'
import { mockApi, TYPO_TOPIC } from './mock'

const SHOTS = '.shots/task-console-v2'
const shot = (page: Page, name: string, project: string) => page.screenshot({ path: `${SHOTS}/${project}-${name}.png`, fullPage: true })
const titles = async (page: Page) => (await page.locator('ul h3').allTextContents()).map((t) => t.trim())

test.describe('목록', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page)
    await page.goto('/console/tasks')
    await expect(page.getByRole('tab')).toHaveCount(3)
    await expect(page.locator('ul h3').first()).toBeVisible()
  })

  test('탭 순서는 검수 전 → 자가진단 → 실전이고 처음엔 검수 전', async ({ page }) => {
    const tabs = page.getByRole('tab')
    await expect(tabs.nth(0)).toContainText('검수 전')
    await expect(tabs.nth(1)).toContainText('자가진단')
    await expect(tabs.nth(2)).toContainText('실전')
    await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('link', { name: '과제 만들기' }).first()).toBeVisible()
    const summary = await page.getByRole('group', { name: '상태별 과제 수' }).getByRole('button').allTextContents()
    expect(summary[0]).toContain('검수 전')
    expect(summary[1]).toContain('자가진단')
    expect(summary[2]).toContain('실전')
    expect((await titles(page)).sort()).toEqual(['검수 전 로그 파서', '검수 전 매출 보고서'])
  })

  test('카드는 윗줄(직군·난이도·시간)과 역량 배지를 보여 주고 자가진단·실전·AI 생성 배지는 없다', async ({ page }) => {
    await page.getByRole('tab', { name: /^자가진단/ }).click()
    const card = page.locator('ul li').filter({ has: page.getByRole('heading', { name: '쿠폰 할인 계산' }) })
    await expect(card.getByText('보통')).toBeVisible()
    await expect(card.getByText('40', { exact: true })).toBeVisible()
    const comps = card.getByRole('list', { name: '이 과제가 보는 역량' }).getByRole('listitem')
    await expect(comps).toHaveText(['AI 통제력', 'AI 활용력'])
    // 역량이 없는 카드는 그 줄이 없다
    const plain = page.locator('ul li').filter({ has: page.getByRole('heading', { name: '재고 차감 동시성' }) })
    await expect(plain.getByRole('list')).toHaveCount(0)
    for (const text of ['자가진단', '실전', 'AI 생성', '자동 확인 통과']) await expect(page.locator('ul li').getByText(text)).toHaveCount(0)
    // 자동 확인 실패는 검수 전 과제에서만
    await expect(page.getByText('자동 확인 실패')).toHaveCount(0)
    await page.getByRole('tab', { name: /검수 전/ }).click()
    await expect(page.getByText('자동 확인 실패')).toHaveCount(1)
  })

  test('카드에는 메뉴 버튼과 등록 시간 줄이 없고, 누르면 검수 상세로 간다', async ({ page }) => {
    await page.getByRole('tab', { name: /^자가진단/ }).click()
    const card = page.locator('ul li').filter({ has: page.locator('h3') }).first()
    await expect(card.getByRole('button')).toHaveCount(0)
    await expect(card.locator('.border-t')).toHaveCount(0)
    await card.locator('h3').click()
    await expect(page).toHaveURL(/\/console\/tasks\/[^/]+$/)
  })

  test('직군 필터는 작은 세그먼트이고 현재 탭 안의 개수를 보여 준다', async ({ page }) => {
    await page.getByRole('tab', { name: /^자가진단/ }).click()
    const group = page.getByRole('radiogroup', { name: '직군' })
    await expect(group.getByRole('radio')).toHaveText([/^전체\s*3$/, /^개발\s*2$/, /^비개발\s*1$/])
    await page.getByRole('tab', { name: /검수 전/ }).click()
    await expect(group.getByRole('radio')).toHaveText([/^전체\s*2$/, /^개발\s*1$/, /^비개발\s*1$/])
  })

  test('직군 하위 필터는 탭 안에서만 거른다', async ({ page }) => {
    await expect.poll(() => titles(page)).toHaveLength(2) // 처음 탭은 검수 전
    await page.getByRole('radio', { name: /^개발/ }).click()
    await expect.poll(() => titles(page)).toEqual(['검수 전 로그 파서'])
    await page.getByRole('radio', { name: /^비개발/ }).click()
    await expect.poll(() => titles(page)).toEqual(['검수 전 매출 보고서'])
  })

  test('검색은 부분 일치·공백 무시이고 결과가 없으면 안내한다', async ({ page }) => {
    await page.getByRole('tab', { name: /^자가진단/ }).click()
    const search = page.getByPlaceholder(/찾기/)
    await search.fill('쿠폰 할인')
    await expect.poll(() => titles(page)).toEqual(['쿠폰 할인 계산'])
    await search.fill('쿠폰할인')
    await expect.poll(() => titles(page)).toEqual(['쿠폰 할인 계산'])
    // 현재 탭(자가진단) 안에서만 찾는다: 검수 전 과제는 안 나옴
    await search.fill('로그')
    await expect(page.getByText('조건에 맞는 과제가 없어요')).toBeVisible()
    await search.fill('없는검색어')
    await expect(page.getByText('조건에 맞는 과제가 없어요')).toBeVisible()
  })
})

test.describe('과제 만들기', () => {
  test('주제 → 추천 → 직군을 바꿔도 유지 → 주제 확인 → 용도·시간 → 생성 요청 본문', async ({ page }) => {
    const api = await mockApi(page)
    const suggestions = () => api.sent.filter((r) => r.path === '/api/admin/task-gen/suggestions')
    await page.goto('/console/tasks/new?tab=manual')
    await expect(page.getByRole('heading', { name: '과제 만들기', level: 1 })).toBeVisible()
    // 직무·난이도 칸은 없다
    await expect(page.getByLabel('직무')).toHaveCount(0)
    await expect(page.getByText('난이도')).toHaveCount(0)

    const dev = page.getByRole('button', { name: /^개발/ })
    const biz = page.getByRole('button', { name: /^비개발/ })
    const askBtn = page.getByRole('button', { name: /추천 받기|다시 추천/ })
    const pickBtns = page.getByRole('button', { name: /^.*상황 \d/ })
    const topicInput = page.getByLabel('주제', { exact: true })

    await topicInput.fill('주문 취소 재고 복구')
    await expect(askBtn).toBeDisabled() // 직군을 고르기 전
    await dev.click()
    await askBtn.click()
    await expect(pickBtns).toHaveCount(3)
    await expect(page.getByText('왜 좋은 문제인가 1')).toBeHidden() // why 는 카드에 안 보이고 title 로만
    await expect(pickBtns.first()).toHaveAttribute('title', /왜 좋은 문제인가 1/)
    await pickBtns.first().click()
    await expect(page.getByLabel('상황', { exact: true })).toHaveValue(/상황 1/)
    await expect(page.getByLabel('함정')).toHaveValue(/함정 1/)

    // 비개발에서 따로 추천 → 개발로 돌아오면 앞서 받은 목록과 고른 카드가 그대로
    await biz.click()
    await expect(pickBtns).toHaveCount(0)
    await askBtn.click()
    await expect(pickBtns).toHaveCount(3)
    await dev.click()
    await expect(pickBtns).toHaveCount(3)
    await expect(page.locator('button[aria-pressed="true"]', { hasText: /상황 \d/ })).toHaveCount(1)

    // 다시 추천은 앞서 받은 상황을 exclude 로 보낸다
    await askBtn.click()
    // 비용 추정 GET 등 다른 요청이 뒤에 섞일 수 있으니 추천 요청만 본다
    await expect.poll(() => suggestions().at(-1)?.body.exclude?.length).toBe(3)
    expect(suggestions().at(-1)?.body).toMatchObject({ track: 'DEV', topic: '주문 취소 재고 복구' })

    // 오타 주제: 확인 박스가 카드 위에 뜨고 카드는 숨는다
    await topicInput.fill(TYPO_TOPIC)
    await askBtn.click()
    const box = page.getByRole('group', { name: '주제 확인' })
    await expect(box).toContainText(`'${TYPO_TOPIC}'를 '쿠폰 할인 계산'(으)로 이해했어요`)
    await expect(pickBtns).toHaveCount(0)
    const askedBefore = suggestions().length
    await box.getByRole('button', { name: '이대로 보기' }).click()
    await expect(pickBtns).toHaveCount(3)
    expect(suggestions().length).toBe(askedBefore) // 추가 추천 요청 없음

    // 주제 고치기: 주제 칸에 포커스
    await askBtn.click()
    await expect(box).toBeVisible()
    await box.getByRole('button', { name: '주제 고치기' }).click()
    await expect(topicInput).toBeFocused()

    // 용도·시간 → 확인 → 생성 요청 본문
    await page.getByRole('radio', { name: '실전' }).click()
    await expect(page.getByText('기업 회차에만 써요')).toBeVisible()
    for (const m of [20, 40, 60]) {
      await page.getByRole('radio', { name: `${m}분` }).click()
      await expect(page.getByRole('radio', { name: `${m}분` })).toHaveAttribute('aria-checked', 'true')
    }
    await page.getByRole('radio', { name: '20분' }).click()
    await page.getByLabel('상황', { exact: true }).fill('주문 취소 재고 복구')
    await page.getByLabel('함정').fill('취소가 두 번 오면 재고가 두 번 늘어남')
    await page.getByRole('button', { name: /^다음/ }).click()
    await expect(page.getByRole('heading', { name: /이대로/ })).toBeVisible()
    await page.getByRole('button', { name: '과제 만들기' }).click()
    await expect(page.getByText(/과제를 만들었어요/)).toBeVisible({ timeout: 15_000 })

    await expect.poll(() => api.sent.some((r) => r.path === '/api/admin/task-gen' && r.method === 'POST')).toBe(true)
    const gen = api.sent.find((r) => r.path === '/api/admin/task-gen' && r.method === 'POST')!
    expect(gen.body).toEqual({ track: 'DEV', topic: '주문 취소 재고 복구', trap: '취소가 두 번 오면 재고가 두 번 늘어남', usage: 'LIVE', minutes: 20, mode: 'NOW' })
    expect(gen.body).not.toHaveProperty('jobRole')
    expect(gen.body).not.toHaveProperty('difficulty')
  })
})

test('만드는 동안 새 단계 글이 와도 활성 단계와 세부 글이 보인다', async ({ page }) => {
  const api = await mockApi(page)
  api.holdJob() // 부하로 폴링이 빨리 와도 끝나 버리지 않게 진행 중으로 붙잡아 둔다
  await page.goto('/console/tasks/new?tab=manual')
  await page.getByRole('button', { name: /^개발/ }).click()
  await page.getByLabel('상황', { exact: true }).fill('주문 취소 재고 복구')
  await page.getByLabel('함정').fill('취소가 두 번 오면 재고가 두 번 늘어남')
  await page.getByRole('button', { name: /^다음/ }).click()
  await page.getByRole('button', { name: '과제 만들기' }).click()
  await expect(page.getByTestId('gen-detail')).toHaveText('설계도 작성 중')
  await expect(page.getByText('(진행 중)')).toHaveCount(1)
  // 진행 값(%)은 줄지 않고, 시간이 지나면 늘어난다
  const read = async () => parseInt((await page.getByText(/^\d+%$/).first().textContent()) ?? '0', 10)
  let last = await read()
  const first = last
  let shrank = false
  await expect.poll(async () => {
    const now = await read()
    if (now < last) shrank = true
    last = now
    return now
  }).toBeGreaterThan(first)
  expect(shrank).toBe(false)
})

test('추천 카드를 골라 만들면 그 카드의 역량을 같이 보낸다', async ({ page }) => {
  const api = await mockApi(page)
  await page.goto('/console/tasks/new?tab=manual')
  await page.getByRole('button', { name: /^개발/ }).click()
  await page.getByRole('button', { name: /추천 받기/ }).click()
  await page.getByRole('button', { name: /^.*상황 \d/ }).nth(1).click()
  // 카드 내용이 글자씩 채워지는 동안에는 값이 카드와 달라 역량이 안 붙는다 → 두 칸이 다 채워진 뒤에 넘어간다
  await expect(page.getByLabel('상황', { exact: true })).toHaveValue('상황 2: 주문 취소 후 재고가 복구되지 않는다')
  await expect(page.getByLabel('함정')).toHaveValue('함정 2: 취소 이벤트가 두 번 와도 한 번만 복구해야 함')
  await page.getByRole('button', { name: /^다음/ }).click()
  await page.getByRole('button', { name: '과제 만들기' }).click()
  await expect(page.getByText(/과제를 만들었어요/)).toBeVisible({ timeout: 15_000 })
  await expect.poll(() => api.sent.find((r) => r.path === '/api/admin/task-gen' && r.method === 'POST')?.body.competencies).toEqual(['usage', 'delegation'])
})

test('추천 카드를 채우는 도중에 다음을 눌러도 그 카드의 역량을 같이 보낸다', async ({ page }) => {
  const api = await mockApi(page)
  await page.clock.install()
  await page.goto('/console/tasks/new?tab=manual')
  await page.getByRole('button', { name: /^개발/ }).click()
  await page.getByRole('button', { name: /추천 받기/ }).click()
  const card = page.getByRole('button', { name: /^.*상황 \d/ }).nth(1)
  await expect(card).toBeVisible()
  // 채우기 연출의 타이머를 멈춰 둔 채(= 채우는 도중) 다음으로 넘어간다
  await page.clock.pauseAt(new Date(Date.now() + 60_000))
  await card.click()
  await page.getByRole('button', { name: /^다음/ }).click()
  await page.getByRole('button', { name: '과제 만들기' }).click()
  await expect.poll(() => api.sent.find((r) => r.path === '/api/admin/task-gen' && r.method === 'POST')?.body.competencies).toEqual(['usage', 'delegation'])
})

test('경고만 있으면 축하는 그대로, 경고 안내와 경고 줄이 위에 보인다', async ({ page }) => {
  await mockApi(page)
  await page.goto('/console/tasks/new?tab=manual')
  await page.getByRole('button', { name: /^개발/ }).click()
  await page.getByRole('button', { name: /추천 받기/ }).click()
  await page.getByRole('button', { name: /^.*상황 \d/ }).first().click()
  await expect(page.getByLabel('함정')).toHaveValue(/함정/)
  await page.getByRole('button', { name: /^다음/ }).click()
  await page.getByRole('button', { name: '과제 만들기' }).click()
  await expect(page.getByRole('heading', { name: /과제를 만들었어요.*경고 1개/ })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('status').filter({ hasText: '확인해 볼 경고가 1개 있어요' })).toBeVisible()
  const rows = page.getByRole('list', { name: '자동 확인 결과' }).getByRole('listitem')
  await expect(rows.first()).toHaveAttribute('data-state', 'warn') // 경고가 통과보다 위
  await expect(rows.first().getByRole('img', { name: '경고' })).toBeVisible()
  await expect(page.getByText('1 / 2 통과')).toBeVisible()
  await expect(page.getByRole('img', { name: '실패' })).toHaveCount(0)
})

test('@shot 과제 콘솔 화면 스크린샷', async ({ page }, info) => {
  const p = info.project.name
  await mockApi(page)
  await page.goto('/console/tasks')
  await expect(page.locator('ul h3').first()).toBeVisible()
  await page.waitForTimeout(1200) // 카드가 나타나는 애니메이션이 끝난 뒤 찍는다
  await shot(page, '01-list-public', p)
  await page.getByRole('tab', { name: /검수 전/ }).click()
  await page.getByRole('radio', { name: /^개발/ }).click()
  await expect.poll(async () => (await titles(page)).length).toBe(1)
  await shot(page, '02-list-draft-dev', p)
  await page.getByRole('tab', { name: /^자가진단/ }).click()
  await page.getByRole('radio', { name: /^전체/ }).click()
  await page.getByPlaceholder(/찾기/).fill('쿠폰 할인')
  await expect.poll(async () => (await titles(page)).length).toBe(1)
  await shot(page, '03-list-search', p)

  await page.goto('/console/tasks/new?tab=manual')
  await shot(page, '10-new-empty', p)
  await page.getByLabel('주제', { exact: true }).fill(TYPO_TOPIC)
  await page.getByRole('button', { name: /^개발/ }).click()
  await page.getByRole('button', { name: '추천 받기' }).click()
  await expect(page.getByRole('group', { name: '주제 확인' })).toBeVisible()
  await shot(page, '11-new-topic-check', p)
  await page.getByRole('button', { name: '이대로 보기' }).click()
  await page.getByRole('button', { name: /상황 \d/ }).first().click()
  await expect(page.getByLabel('함정')).toHaveValue(/함정 1/)
  await shot(page, '12-new-picked', p)
  await page.getByRole('radio', { name: '실전' }).click()
  await page.getByRole('radio', { name: '20분' }).click()
  await page.getByRole('button', { name: /^다음/ }).click()
  await expect(page.getByRole('heading', { name: /이대로/ })).toBeVisible()
  await shot(page, '13-new-confirm', p)
})

test('상세에서 과제를 숨기면 목록 캐시가 바뀌어 검수 전 탭에 나타난다', async ({ page }) => {
  await mockApi(page)
  await page.goto('/console/tasks')
  await page.getByRole('tab', { name: /^자가진단/ }).click()
  await page.locator('ul h3', { hasText: '쿠폰 할인 계산' }).click()
  await expect(page).toHaveURL(/\/console\/tasks\/A1$/)
  await page.getByRole('button', { name: '숨기기' }).click()
  await page.getByRole('dialog').getByRole('button', { name: '숨기기' }).click()
  await expect(page.getByRole('button', { name: '숨기기' })).toHaveCount(0)
  await page.getByRole('link', { name: /과제 목록/ }).first().click()
  // 목록 응답은 그대로(A1 은 OPEN)라서, 다시 받았다면 검수 전에 없다. 캐시를 응답으로 고쳤을 때만 보인다
  await expect(page.getByRole('tab', { name: /^검수 전/ })).toBeVisible()
  await page.getByRole('tab', { name: /^검수 전/ }).click()
  await expect(page.locator('ul h3', { hasText: '쿠폰 할인 계산' })).toBeVisible()
})
