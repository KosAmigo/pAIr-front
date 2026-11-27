// 사용자가 바뀌면 React Query 캐시가 비워져, 이전 계정의 콘솔 과제 목록이 다음 계정 화면에 보이지 않는다.
import { expect, test } from '@playwright/test'
import { mockApi, TASKS } from './mock'

const B = { id: 2, email: 'b@example.test', name: '관리자B', role: 'ADMIN', companyId: null, companyName: null, emailVerified: true }
const B_TASKS = [{ ...TASKS[0], id: 'B-ONLY', title: 'B 전용 과제', status: 'HIDDEN' }]

test('로그아웃 뒤 다른 계정으로 로그인하면 이전 계정의 과제 목록을 한 번도 보여 주지 않는다', async ({ page }) => {
  await mockApi(page) // 관리자 A(id 1)
  let bLoggedIn = false
  await page.route('**/api/auth/logout', (route) => route.fulfill({ status: 204, body: '' }))
  await page.route('**/api/auth/login', (route) => {
    bLoggedIn = true
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'tb', refreshToken: 'rb', expiresIn: 900, user: B }) })
  })
  // 나중에 등록한 라우트가 먼저 적용된다: 로그인 뒤에는 B 의 응답만 준다. B 의 me 는 보호 요청이라 토큰으로 구분한다
  await page.route('**/api/console/tasks', (route, req) => {
    if (!bLoggedIn) return route.fallback()
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(B_TASKS) })
  })
  await page.route('**/api/auth/me', (route) => (bLoggedIn ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(B) }) : route.fallback()))

  await page.goto('/console/tasks')
  await expect(page.getByRole('heading', { name: '검수 전 로그 파서' })).toBeVisible()

  await page.getByRole('button', { name: /관리자/ }).first().click()
  await page.getByRole('menuitem', { name: '로그아웃' }).click()
  await expect(page).toHaveURL(/\/login/)
  // 로그아웃 이후 화면에 나타나는 모든 제목을 기록한다
  await page.evaluate(() => {
    const seen = new Set<string>()
    ;(window as any).__seen = seen
    new MutationObserver(() => document.querySelectorAll('h3').forEach((h) => seen.add(h.textContent?.trim() ?? ''))).observe(document.body, { childList: true, subtree: true, characterData: true })
  })

  await page.getByLabel('이메일').fill('b@example.test')
  await page.getByLabel('비밀번호', { exact: true }).fill('password1!')
  await page.getByRole('button', { name: '로그인', exact: true }).click()

  await expect(page.getByRole('heading', { name: 'B 전용 과제' })).toBeVisible()
  const seen: string[] = await page.evaluate(() => [...(window as any).__seen])
  expect(seen).toContain('B 전용 과제')
  expect(seen.filter((t) => TASKS.some((a) => a.title === t))).toEqual([])
})
