// 관리자 회원 목록: 콘솔 메뉴에서 들어가 회원별 자가진단 요약을 보고, 역할·검색·페이지로 거른다.
// @shot 은 .shots/admin-users/ 에 스크린샷을 남긴다(저장소에는 올리지 않는다).
import { expect, test, type Page } from '@playwright/test'
import { mockApi } from './mock'

const member = (id: number, over: Record<string, unknown> = {}) => ({
  id, name: `회원${id}`, email: `user${id}@example.test`, role: 'USER', status: 'ACTIVE', companyName: null,
  joinedAt: '2026-11-20T03:00:00Z', selfAttempts: 3, selfSubmitted: 2, averageScore: 71.5, creditBalance: 170,
  lastAttemptAt: '2026-11-27T05:00:00Z', ...over,
})
const ALL = [
  member(1, { name: '김자가', averageScore: 82.4 }),
  member(2, { name: '이매니저', role: 'MANAGER', companyName: '아미고테크', creditBalance: null, selfAttempts: 0, selfSubmitted: 0, averageScore: null, lastAttemptAt: null }),
  member(3, { name: '박감독', role: 'PROCTOR', status: 'PENDING', companyName: '아미고테크', creditBalance: null, selfAttempts: 0, selfSubmitted: 0, averageScore: null, lastAttemptAt: null }),
]

async function setup(page: Page) {
  await mockApi(page)
  const asked: Record<string, string>[] = []
  await page.route((url) => url.pathname === '/api/admin/members', (route) => {
    const p = Object.fromEntries(new URL(route.request().url()).searchParams)
    asked.push(p)
    let rows = ALL
    if (p.role === 'USER') rows = rows.filter((m) => m.role === 'USER')
    if (p.role === 'COMPANY') rows = rows.filter((m) => m.role === 'MANAGER' || m.role === 'PROCTOR')
    if (p.q) rows = rows.filter((m) => `${m.name} ${m.email}`.includes(p.q))
    const pageNo = Number(p.page)
    // 2쪽짜리 목록을 흉내 낸다: 전체 보기일 때 둘째 쪽에 회원 하나 더
    const totalPages = p.role === 'ALL' && !p.q ? 2 : 1
    const members = totalPages === 2 && pageNo === 1 ? [member(4, { name: '최다음' })] : rows
    return route.fulfill({ json: { members, page: pageNo, size: 20, totalElements: totalPages === 2 ? 4 : rows.length, totalPages } })
  })
  return { asked }
}

test('콘솔 메뉴의 회원은 회원별 자가진단 요약을 보여 준다', async ({ page }) => {
  await setup(page)
  await page.goto('/console/sessions')
  await page.getByRole('link', { name: '회원', exact: true }).click()

  await expect(page).toHaveURL(/\/console\/users$/)
  const kim = page.getByRole('row', { name: /김자가/ })
  await expect(kim).toContainText('82.4점')
  await expect(kim).toContainText('3건')
  await expect(kim).toContainText('170')
  const pending = page.getByRole('row', { name: /박감독/ })
  await expect(pending).toContainText('감독관')
  await expect(pending).toContainText('첫 로그인 전')
  await expect(pending).toContainText('아미고테크')
})

test('역할·검색·페이지로 거른다', async ({ page }) => {
  const { asked } = await setup(page)
  await page.goto('/console/users')
  await expect(page.getByRole('row', { name: /김자가/ })).toBeVisible()

  await page.getByRole('button', { name: '다음' }).click()
  await expect(page.getByRole('row', { name: /최다음/ })).toBeVisible()
  expect(asked.at(-1)).toMatchObject({ role: 'ALL', page: '1' })

  await page.getByRole('button', { name: '기업 계정' }).click()
  await expect(page.getByRole('row', { name: /김자가/ })).toHaveCount(0)
  await expect(page.getByRole('row', { name: /이매니저/ })).toBeVisible()
  expect(asked.at(-1)).toMatchObject({ role: 'COMPANY', page: '0' })

  await page.getByRole('button', { name: '전체' }).click()
  await page.getByLabel('이름 또는 이메일').fill('김자가')
  await page.getByRole('button', { name: '검색' }).click()
  await expect.poll(() => asked.at(-1)).toMatchObject({ role: 'ALL', q: '김자가', page: '0' })
  await expect(page.getByRole('row', { name: /이매니저/ })).toHaveCount(0)
})

test('@shot 관리자 회원 목록 스크린샷', async ({ page }, info) => {
  await setup(page)
  await page.goto('/console/users')
  await expect(page.getByRole('row', { name: /김자가/ })).toBeVisible()
  await page.screenshot({ path: `.shots/admin-users/${info.project.name}.png`, fullPage: true })
})
