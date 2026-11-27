// 선택형 토글은 고르는 값에 따라 레이아웃이 움직이지 않는다 (DESIGN.md §6 토글: 칸 폭 고정, 설명 높이 고정).
import { expect, test, type Locator } from '@playwright/test'
import { mockApi, TASKS } from './mock'

const size = async (l: Locator) => {
  const b = (await l.boundingBox())!
  return { w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10 }
}

test('용도 토글: 자가진단 ↔ 실전 전환 전후로 영역 폭·높이, 두 칸 폭이 같다', async ({ page }) => {
  test.setTimeout(60_000)
  await mockApi(page)
  // 용도 바꾸기(PATCH): 바뀐 요약을 돌려준다
  await page.route('**/api/console/tasks/D1/usage', (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as { usage: string }
    return route.fulfill({ json: { ...TASKS.find((t) => t.id === 'D1'), usage: body.usage } })
  })
  // 검수 화면이 읽는 칸을 채운 상세 응답
  await page.route('**/api/console/tasks/D1', (route) =>
    route.fulfill({ json: { summary: TASKS.find((t) => t.id === 'D1'), definition: { id: 'D1', title: 'D1', description: [], requirements: [], notes: [], followUps: [], d4Minutes: null, requiredHeadings: null } } }),
  )
  await page.goto('/console/tasks/D1')
  const group = page.getByRole('radiogroup', { name: '용도 바꾸기' })
  await expect(group).toBeVisible()
  const area = group.locator('xpath=..') // 머리 안 토글 영역
  const self = group.getByRole('radio', { name: /자가진단/ })
  const live = group.getByRole('radio', { name: /실전/ })
  const before = { area: await size(area), group: await size(group), self: await size(self), live: await size(live) }
  expect(before.self.w).toBe(before.live.w) // 두 칸 폭이 같다

  await live.click()
  await expect(live).toHaveAttribute('aria-checked', 'true')
  await expect(group).not.toHaveAttribute('aria-disabled', 'true')
  expect({ area: await size(area), group: await size(group), self: await size(self), live: await size(live) }).toEqual(before)

  await self.click()
  await expect(self).toHaveAttribute('aria-checked', 'true')
  expect({ area: await size(area), group: await size(group), self: await size(self), live: await size(live) }).toEqual(before)
})

test('과제 만들기 토글(직군·바로/배치·시간·탭): 고르기 전후로 칸 폭·높이가 같다', async ({ page }) => {
  test.setTimeout(60_000)
  await mockApi(page)
  await page.goto('/console/tasks/new?tab=manual')
  await page.waitForTimeout(800) // 폼이 들어오는 연출이 끝난 뒤에 잰다
  const radio = (group: string, name: RegExp) => page.getByRole('radiogroup', { name: group }).getByRole('radio', { name })
  const targets: [string, Locator][] = [
    ['바로', radio('방식', /바로 만들기/)],
    ['배치', radio('방식', /^배치/)],
    ['20분', radio('제한 시간', /20분/)],
    ['60분', radio('제한 시간', /60분/)],
    ['자가진단', radio('용도', /자가진단/)],
    ['실전', radio('용도', /실전/)],
  ]
  const before = await Promise.all(targets.map(([, l]) => size(l)))
  await radio('방식', /^배치/).click()
  await radio('제한 시간', /20분/).click()
  await radio('용도', /실전/).click()
  expect(await Promise.all(targets.map(([, l]) => size(l)))).toEqual(before)
  await radio('방식', /바로 만들기/).click()
  await radio('제한 시간', /60분/).click()
  await radio('용도', /자가진단/).click()
  expect(await Promise.all(targets.map(([, l]) => size(l)))).toEqual(before)

  // 직군 카드(개발/비개발)
  const dev = page.getByRole('button', { name: /^개발/ })
  const biz = page.getByRole('button', { name: /^비개발/ })
  const track = [await size(dev), await size(biz)]
  await dev.click()
  await biz.click()
  expect([await size(dev), await size(biz)]).toEqual(track)

  // 탭(자동 생성 / 직접 만들기): 탭 묶음 크기는 선택과 무관
  const tabs = page.getByRole('tablist')
  const t0 = await size(tabs)
  await page.getByRole('tab', { name: '자동 생성' }).click()
  expect(await size(tabs)).toEqual(t0)
})
