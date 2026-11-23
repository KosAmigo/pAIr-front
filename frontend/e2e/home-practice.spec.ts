// 로그인 없는 홈에서 응시 환경 테스트(/practice)로 들어가는 길. 새 페이지 없이 기존 사전 테스트 화면을 연다.
import { expect, test } from '@playwright/test'

test('홈의 "응시 환경 테스트" 버튼이 로그인 없이 /practice 로 이어진다', async ({ page }) => {
  await page.goto('/')
  const link = page.getByRole('link', { name: '응시 환경 테스트' })
  await expect(link).toBeVisible()
  await link.click()
  await expect(page).toHaveURL(/\/practice$/)
  await expect(page.getByRole('heading', { name: '사전 테스트', level: 1 })).toBeVisible()
  // 웹캠·휴대폰 캠 연결 구간이 같은 화면에 있다 (연결 상태 목록)
  await expect(page.getByRole('heading', { name: '연결 상태' })).toBeVisible()
  await expect(page.getByText(/휴대폰.*연결/).first()).toBeVisible()
})
