// 흰 유리 알약의 선택 칸 색, /tasks 시간 필터(20·40·60분 + 개수), 학습자 위쪽 메뉴 선택 표시
import { expect, test, type Page } from '@playwright/test'
import { PNG } from 'pngjs'
import { mockApi } from './mock'

const TASKS = [
  { id: 'A1', type: 'dev', title: '주문 취소 재고', minutes: 40, status: 'OPEN' },
  { id: 'A2', type: 'dev', title: '쿠폰 할인 계산', minutes: 60, status: 'OPEN' },
  { id: 'A3', type: 'dev', title: '로그 파서', minutes: 20, status: 'OPEN' },
  { id: 'A4', type: 'dev', title: '캐시 무효화', minutes: 20, status: 'OPEN' },
  { id: 'B1', type: 'biz', title: '회의록 정리', minutes: 45, status: 'OPEN' },
]
const detail = (id: string) => ({ ...TASKS.find((t) => t.id === id), description: ['설명'], requirements: [], notes: [], followUps: [], openFile: 'Main.java', editableFile: null })

async function openTasks(page: Page) {
  await mockApi(page)
  await page.route((u) => u.pathname === '/api/tasks' || u.pathname.startsWith('/api/tasks/'), (r) => {
    const p = new URL(r.request().url()).pathname
    return r.fulfill({ json: p === '/api/tasks' ? TASKS : detail(p.split('/').pop()!) })
  })
  await page.goto('/tasks')
  await expect(page.getByRole('radiogroup', { name: '시간' })).toBeVisible()
}

// 알약 한가운데가 진한 보라인지(연한 라벤더가 아닌지) 화면 픽셀로 본다
const pillPixel = async (page: Page, sel: string) => {
  const b = (await page.locator(sel).first().boundingBox())!
  const p = PNG.sync.read(await page.screenshot({ clip: { x: b.x + 4, y: b.y + b.height / 2 - 1, width: 8, height: 2 } }))
  return [p.data[0], p.data[1], p.data[2]]
}

test('콘솔 탭 알약과 직군 스위치 알약은 진한 보라로 보인다', async ({ page }) => {
  await mockApi(page)
  await page.goto('/console/tasks')
  await page.waitForTimeout(1200)
  const [r, g] = await pillPixel(page, '[role=tablist] span.bg-brand-gradient')
  expect(r).toBeLessThan(160)
  expect(g).toBeLessThan(120)
})

test('직군 스위치 알약이 진하고, 시간 필터는 20·40·60분과 개수를 보여 준다', async ({ page }) => {
  await openTasks(page)
  await page.waitForTimeout(1200)
  const [r, g] = await pillPixel(page, '[role=tablist] span.bg-brand-gradient')
  expect(r).toBeLessThan(160)
  expect(g).toBeLessThan(120)
  const time = page.getByRole('radiogroup', { name: '시간' })
  await expect(time.getByRole('radio')).toHaveText(['전체4', '20분2', '40분1', '60분1'])
  await time.getByRole('radio', { name: /20분/ }).click()
  await expect(time.getByRole('radio', { name: /20분/ })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByText('로그 파서').first()).toBeVisible()
  await expect(page.getByText('쿠폰 할인 계산')).toHaveCount(0)
  // 비개발 직군: 45분은 가장 가까운 40분 칸, 0개 칸도 누를 수 있다
  await page.getByRole('tab', { name: /비개발/ }).click()
  await expect(time.getByRole('radio')).toHaveText(['전체1', '20분0', '40분1', '60분0'])
})

test('학습자 위쪽 메뉴: 선택 칸이 테두리로 감싸지고 이동한다', async ({ page }) => {
  await openTasks(page)
  const nav = page.getByRole('navigation', { name: '자가진단 메뉴' })
  const mark = page.getByTestId('self-tab-active')
  await expect(mark).toHaveCount(1)
  expect(await mark.evaluate((e) => getComputedStyle(e).borderTopWidth)).toBe('1px')
  await expect(nav.getByRole('link', { name: '과제' })).toHaveAttribute('aria-current', 'page')
  await nav.getByRole('link', { name: '대시보드' }).click()
  await expect(nav.getByRole('link', { name: '대시보드' })).toHaveAttribute('aria-current', 'page')
  await expect(mark).toHaveCount(1)
})
