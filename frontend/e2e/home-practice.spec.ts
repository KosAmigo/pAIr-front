// 로그인 없는 홈에서 응시 환경 테스트(/practice)로 들어가는 길. 새 페이지 없이 기존 사전 테스트 화면을 연다.
import { expect, test } from '@playwright/test'

test('홈의 "응시 환경 테스트" 버튼이 로그인 없이 /practice 로 이어진다', async ({ page }) => {
  await page.goto('/')
  const link = page.getByRole('link', { name: '응시 환경 테스트' })
  await expect(link).toBeVisible()
  await link.click()
  await expect(page).toHaveURL(/\/practice$/)
  await expect(page.getByRole('heading', { name: '사전 테스트', level: 1 })).toBeVisible()
  // 연결 상태 목록: 웹캠만 보이고, 꺼진 기본 설정에서는 휴대폰 캠·PC 화면 공유 항목이 없다.
  // 휴대폰 캠(VITE_PHONE_CAM_ENABLED=true)이나 화면 공유(SCREEN_SHARE_ENABLED)를 다시 켜면 이 단언을 바꿀 것.
  const status = page.getByRole('region', { name: '연결 상태' })
  await expect(status.getByRole('heading', { name: '연결 상태' })).toBeVisible()
  const items = status.getByRole('listitem')
  await expect(items).toHaveCount(1)
  await expect(items.filter({ hasText: /^웹캠 (연결됨|미연결)$/ })).toBeVisible()
  await expect(items.filter({ hasText: '휴대폰 캠' })).toHaveCount(0)
  await expect(items.filter({ hasText: 'PC 화면 공유' })).toHaveCount(0)
})
