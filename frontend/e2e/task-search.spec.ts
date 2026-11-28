// 과제 목록 검색: 입력 글자(공백·대소문자·초성·특수문자), 코드·한글 주제·직군 이름 검색, 0개 안내, 지우기(X·Esc),
// 탭·직군과 함께 쓰기, 주소(?q=)에 남아 새로고침·뒤로 가기에도 유지, 결과 개수 안내(aria-live).
import { expect, test, type Page } from '@playwright/test'
import { mockApi } from './mock'

const search = (page: Page) => page.getByRole('searchbox', { name: '과제 검색' })
const cards = (page: Page) => page.locator('ul li h3, ul li h2').filter({ hasText: /./ })

async function open(page: Page, url = '/console/tasks') {
  await mockApi(page)
  await page.goto(url)
  await expect(page.getByRole('tab', { name: /자가진단/ })).toBeVisible()
}

async function onPublic(page: Page) {
  await page.getByRole('tab', { name: /자가진단/ }).click()
  await expect(page.getByText('쿠폰 할인 계산').first()).toBeVisible()
}

test('공백·대소문자·코드(하이픈)·초성으로 찾고, 정규식 글자는 그대로 취급한다', async ({ page }) => {
  await open(page)
  await onPublic(page)
  const box = search(page)
  await box.fill('  쿠 폰할인  ')
  await expect(page.getByText('쿠폰 할인 계산')).toBeVisible()
  await expect(page.getByText('재고 차감 동시성')).toHaveCount(0)
  await box.fill('ㅈㄱㅊㄱ') // 초성
  await expect(page.getByText('재고 차감 동시성')).toBeVisible()
  await box.fill('a-22') // 코드: 하이픈 무시
  await expect(page.getByText('재고 차감 동시성')).toBeVisible()
  await expect(page.getByText('쿠폰 할인 계산')).toHaveCount(0)
  for (const q of ['(', '[', '*', '?', '\\', '.', '+']) {
    await box.fill(q)
    await expect(page.getByText('조건에 맞는 과제가 없어요')).toBeVisible() // 터지지 않고 빈 상태
  }
})

test('직군 이름(개발/비개발)으로 찾고, 0개면 다른 탭 결과를 알려 준다', async ({ page }) => {
  await open(page)
  await onPublic(page)
  await search(page).fill('비개발')
  await expect(page.getByText('요금제 개편안 손익 비교')).toBeVisible()
  await expect(page.getByText('쿠폰 할인 계산')).toHaveCount(0)
  await search(page).fill('환불') // 실전 탭에만 있음
  await expect(page.getByText('조건에 맞는 과제가 없어요')).toBeVisible()
  await page.getByRole('button', { name: /실전 1개/ }).click()
  await expect(page.getByRole('tab', { name: /실전/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('실전 환불 정책 분석')).toBeVisible()
})

test('X 버튼·Esc 로 지우고, 결과 개수를 aria-live 로 알린다. 한글 조합 중 Esc 는 글자를 건드리지 않는다', async ({ page }) => {
  await open(page)
  await onPublic(page)
  const box = search(page)
  await box.fill('쿠폰')
  await expect(page.getByRole('status')).toContainText('검색 결과 1개')
  await box.fill('없는말')
  await expect(page.getByRole('status')).toContainText('검색 결과가 없어요')
  await page.getByRole('button', { name: '검색어 지우기' }).click()
  await expect(box).toHaveValue('')
  await expect(box).toBeFocused()
  await expect(page.getByText('재고 차감 동시성')).toBeVisible()
  await box.fill('재고')
  await box.press('Escape')
  await expect(box).toHaveValue('')
  await expect(page).not.toHaveURL(/q=/)
  // 조합 중(isComposing) Esc 는 무시
  await box.fill('재')
  await box.evaluate((el) => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true })))
  await expect(box).toHaveValue('재')
})

test('검색어는 주소에 남아 새로고침·뒤로 가기·앞으로 가기에도 유지되고, 특수문자도 안전하다', async ({ page }) => {
  await open(page)
  await onPublic(page)
  const box = search(page)
  await box.fill('재고 & #1 %')
  await expect(page).toHaveURL(/q=%EC%9E%AC%EA%B3%A0\+%26\+%231\+%25|q=%EC%9E%AC%EA%B3%A0%20%26%20%231%20%25/)
  await page.reload()
  await expect(search(page)).toHaveValue('재고 & #1 %')
  // 탭을 바꾸면 기록이 쌓이고, 뒤로 가면 탭과 검색어가 같이 돌아온다
  await box.fill('재고')
  await page.getByRole('tab', { name: /실전/ }).click()
  await expect(page).toHaveURL(/tab=private/)
  await expect(search(page)).toHaveValue('재고')
  await page.goBack()
  await expect(page.getByRole('tab', { name: /자가진단/ })).toHaveAttribute('aria-selected', 'true')
  await expect(search(page)).toHaveValue('재고')
  await page.goForward()
  await expect(page.getByRole('tab', { name: /실전/ })).toHaveAttribute('aria-selected', 'true')
})

test('주소에 검색어가 있으면 입력창에 채워지고, 직군 거르기와 함께 쓰며, 글자를 지우면 주소에서도 빠진다', async ({ page }) => {
  await open(page, '/console/tasks?tab=public&track=DEV&q=%EA%B3%84%EC%82%B0')
  await expect(search(page)).toHaveValue('계산')
  await expect(page.getByText('쿠폰 할인 계산')).toBeVisible()
  await page.getByRole('radio', { name: /비개발/ }).click()
  await expect(page.getByText('조건에 맞는 과제가 없어요')).toBeVisible()
  await page.getByRole('button', { name: '거르기 풀기' }).click()
  await expect(search(page)).toHaveValue('')
  await expect(page).not.toHaveURL(/q=|track=/)
  await expect(page.getByText('쿠폰 할인 계산')).toBeVisible()
})

test('이상한 주소 값(없는 탭·직군, 너무 긴 검색어)도 화면이 터지지 않는다', async ({ page }) => {
  await open(page, `/console/tasks?tab=nope&track=x&q=${'가'.repeat(500)}`)
  expect((await search(page).inputValue()).length).toBeLessThanOrEqual(100)
})
