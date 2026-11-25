// 응시자 화면: 감독관이 보낸 경고가 상단 배너로 뜨고 "확인"으로 닫힌다.
import { expect, test } from '@playwright/test'
import { mockApi } from './mock'

const INVITE = 'A'.repeat(43)

test('경고 배너가 뜨고 확인을 누르면 닫히며 읽음 요청이 간다', async ({ page }, info) => {
  await mockApi(page)
  const reads: string[] = []
  await page.route((url) => url.pathname.startsWith(`/api/entry/${INVITE}`), async (route) => {
    const req = route.request()
    const path = new URL(req.url()).pathname.replace(`/api/entry/${INVITE}`, '')
    const json = (data: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
    if (path === '/notices') return json(reads.length ? [{ id: 3, message: '정면을 바라봐 주세요.', sentAt: '2026-11-25T02:00:00Z', readAt: '2026-11-25T02:01:00Z' }] : [{ id: 3, message: '정면을 바라봐 주세요.', sentAt: '2026-11-25T02:00:00Z', readAt: null }])
    if (path === '/notices/3/read') {
      reads.push(path)
      return route.fulfill({ status: 204 })
    }
    return json({ message: '없는 링크' }, 404)
  })
  await page.goto(`/entry?invite=${INVITE}`)
  const banner = page.getByRole('region', { name: '감독관 안내' })
  await expect(banner.getByText('정면을 바라봐 주세요.')).toBeVisible()
  await page.screenshot({ path: `.shots/notice/${info.project.name}-banner.png` })
  await banner.getByRole('button', { name: '확인' }).click()
  await expect(banner).toHaveCount(0)
  expect(reads).toHaveLength(1)
})
