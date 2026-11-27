// 감독 패널의 경고 보내기: 준비된 문구 고르기, 직접 입력, 전송, 진행 중이 아닐 때 숨김.
import { expect, test, type Page } from '@playwright/test'
import { mockApi } from './mock'

async function setup(page: Page, phase: 'LIVE' | 'ENDED') {
  await mockApi(page)
  const sent: { message: string }[] = []
  const session = {
    id: 7, companyId: 1, title: '실전 시험', startsAt: '2026-11-25T01:00:00Z', endsAt: '2026-11-25T03:00:00Z', proctoring: true, phase,
    taskIds: [], participants: 1, entered: 1, submitted: 0, canceledAt: null, unreviewedEvents: 0, createdAt: '2026-11-01T00:00:00Z',
  }
  const participant = {
    id: 21, name: '김응시', email: 'kim@example.test', inviteStatus: 'SENT', inviteError: null, invitedAt: '2026-11-19T00:00:00Z', remindedAt: null,
    enteredAt: '2026-11-25T01:00:30Z', startedAt: '2026-11-25T01:01:00Z', submittedAt: null, attempts: {}, linkExpired: false,
  }
  await page.route((url) => url.pathname.startsWith('/api/console/sessions/7'), async (route) => {
    const req = route.request()
    const path = new URL(req.url()).pathname.replace('/api/console/sessions/7', '')
    const json = (data: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
    if (path === '') return json({ session, serverNow: '2026-11-25T02:00:00Z', closedAt: null, participants: [participant] })
    if (path === '/participants/21/notices' && req.method() === 'POST') {
      const body = JSON.parse(req.postData() ?? '{}')
      if (body.message.includes('실패')) return json({ message: '서버 오류로 보내지 못했습니다.' }, 400)
      sent.push(body)
      return json({ id: sent.length, message: body.message, sentAt: '2026-11-25T02:00:00Z', readAt: null })
    }
    // 종료된 회차는 감독 패널에 보관 기간 막대가 나온다: 객체 응답이어야 한다
    if (path === '/retention') {
      return json({ expiresAt: '2026-12-25T00:00:00Z', extensionsUsed: 0, maxExtensions: 2, extensionDays: 7, canExtend: true, history: [] })
    }
    return json([])
  })
  await page.goto('/console/sessions/7/attempts/21')
  return { sent }
}

test('준비된 문구를 고르면 입력칸에 채워지고, 보내면 서버로 전송된다', async ({ page }, info) => {
  const { sent } = await setup(page, 'LIVE')
  await expect(page.getByText('응시자에게 경고 보내기')).toBeVisible()
  await page.getByRole('button', { name: /고개를 자주 돌리고/ }).click()
  const box = page.getByRole('textbox', { name: '응시자에게 경고 보내기' })
  await expect(box).toHaveValue(/고개를 자주 돌리고/)
  await page.screenshot({ path: `.shots/notice/${info.project.name}-sender.png`, fullPage: true })
  await page.getByRole('button', { name: '보내기' }).click()
  await expect(page.getByText('보냈습니다.')).toBeVisible()
  await expect(box).toHaveValue('')
  expect(sent).toHaveLength(1)
  expect(sent[0].message).toContain('고개를 자주 돌리고')
})

test('직접 입력해 보낼 수 있고, 비어 있으면 보내기가 막힌다', async ({ page }) => {
  const { sent } = await setup(page, 'LIVE')
  const send = page.getByRole('button', { name: '보내기' })
  await expect(send).toBeDisabled()
  await page.getByRole('textbox', { name: '응시자에게 경고 보내기' }).fill('  자리에서 일어나지 마세요  ')
  await send.click()
  await expect(page.getByText('보냈습니다.')).toBeVisible()
  expect(sent[0].message).toBe('자리에서 일어나지 마세요')
})

test('전송이 실패하면 오류 문구를 보여 주고 입력은 남긴다', async ({ page }) => {
  await setup(page, 'LIVE')
  const box = page.getByRole('textbox', { name: '응시자에게 경고 보내기' })
  await box.fill('실패 시험')
  await page.getByRole('button', { name: '보내기' }).click()
  await expect(page.getByRole('alert').filter({ hasText: '서버 오류로 보내지 못했습니다.' })).toBeVisible()
  await expect(box).toHaveValue('실패 시험')
})

test('진행 중이 아닌 회차에서는 경고 보내기가 보이지 않는다', async ({ page }) => {
  await setup(page, 'ENDED')
  await expect(page.getByRole('region', { name: '감독 기록' })).toBeVisible()
  await expect(page.getByText('응시자에게 경고 보내기')).toHaveCount(0)
})
