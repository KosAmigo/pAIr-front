// 완료된 회차의 감독 화면: 이벤트 증거 구간 타임라인과 사진 보관 기간·연장.
// 동작은 단언으로 검사하고, @shot 테스트는 .shots/evidence/ 에 스크린샷을 저장한다(저장소에는 올리지 않는다).
import { expect, test, type Page } from '@playwright/test'
import { mockApi } from './mock'

const SHOTS = '.shots/evidence'
const shot = (page: Page, name: string, project: string) => page.screenshot({ path: `${SHOTS}/${project}-${name}.png`, fullPage: true })

/** 1×1 JPEG */
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64')

type Retention = { expiresAt: string; extensionsUsed: number; maxExtensions: number; extensionDays: number; canExtend: boolean; history: unknown[] }

async function setup(page: Page, retention: Retention, withPhone = true) {
  await mockApi(page)
  const calls: string[] = []
  const session = {
    id: 7, companyId: 1, title: '11월 신입 코딩 시험', startsAt: '2026-11-20T01:00:00Z', endsAt: '2026-11-20T03:00:00Z', proctoring: true, phase: 'ENDED',
    taskIds: [], participants: 1, entered: 1, submitted: 1, canceledAt: null, unreviewedEvents: 1, createdAt: '2026-11-01T00:00:00Z',
  }
  const participant = {
    id: 21, name: '김응시', email: 'kim@example.test', inviteStatus: 'SENT', inviteError: null, invitedAt: '2026-11-19T00:00:00Z', remindedAt: null,
    enteredAt: '2026-11-20T01:00:30Z', startedAt: '2026-11-20T01:01:00Z', submittedAt: '2026-11-20T02:30:00Z', attempts: {}, linkExpired: false,
  }
  const event = {
    id: 5, participantId: 21, type: 'PHONE', source: 'PC_CAM', startedAt: '2026-11-20T01:30:00Z', durationMs: 1000, confidence: 0.9, detail: null,
    snapshot: 'ok', snapshotBytes: 1000, review: null, reviewNote: null, reviewedBy: null, reviewedAt: null,
  }
  const frames = [
    { id: 1, source: 'PC_CAM', offsetMs: -3000, sizeBytes: 900, deleted: false },
    { id: 2, source: 'PC_CAM', offsetMs: 0, sizeBytes: 900, deleted: false },
    { id: 3, source: 'PHONE_CAM', offsetMs: 1000, sizeBytes: 900, deleted: false },
  ].filter((f) => withPhone || f.source === 'PC_CAM')
  let current = retention
  await page.route((url) => url.pathname.startsWith('/api/console/sessions/7'), async (route) => {
    const req = route.request()
    const path = new URL(req.url()).pathname.replace('/api/console/sessions/7', '')
    calls.push(`${req.method()} ${path}`)
    const json = (data: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
    if (path === '') return json({ session, serverNow: '2026-11-21T00:00:00Z', closedAt: null, participants: [participant] })
    if (path === '/participants/21/events') return json([event])
    if (path === '/clips') return json({ '5': 3 })
    if (path === '/events/5/clip') return json({ eventId: 5, frames })
    if (path.startsWith('/events/5/clip/')) return route.fulfill({ status: 200, contentType: 'image/jpeg', body: JPEG })
    if (path === '/events/5/review') return json({ ...event, review: JSON.parse(req.postData() ?? '{}').review, reviewedBy: 1, reviewedAt: '2026-11-21T00:00:00Z' })
    if (path === '/retention') return json(current)
    if (path === '/retention/extend') {
      current = { ...current, extensionsUsed: current.extensionsUsed + 1, canExtend: false, history: [{ seq: 1, extendedBy: 1, extendedAt: '2026-11-21T00:00:00Z', days: 7, expiresBefore: current.expiresAt, expiresAfter: '2026-12-02T00:00:00Z' }] }
      return json(current)
    }
    return json([])
  })
  await page.goto('/console/sessions/7/attempts/21')
  return { calls }
}

const soon = (): Retention => ({ expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(), extensionsUsed: 0, maxExtensions: 2, extensionDays: 7, canExtend: true, history: [] })

// 휴대폰 사진은 더 이상 모으지 않는다. 예전 기록에 있을 때만 "휴대폰 (이전 기록)" 줄로 보인다
test('완료된 회차에서 증거 구간을 타임라인으로 본다', async ({ page }, info) => {
  await setup(page, soon())
  await expect(page.getByRole('button', { name: /증거 구간 보기 \(3장\)/ })).toBeVisible()
  await page.getByRole('button', { name: /증거 구간 보기/ }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText(/^웹캠\s*\d+장/)).toBeVisible()
  await expect(dialog.getByText(/^휴대폰 \(이전 기록\)\s*\d+장/)).toBeVisible()
  await expect(dialog.getByRole('button', { name: '웹캠 -3.0초 사진' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: '웹캠 0.0초 사진' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: '휴대폰 +1.0초 사진' })).toBeVisible()
  await expect(dialog.getByRole('img', { name: '0.0초 사진' })).toBeVisible()
  await dialog.getByRole('button', { name: '휴대폰 +1.0초 사진' }).click()
  await expect(dialog.getByRole('img', { name: '+1.0초 사진' })).toBeVisible()
  await shot(page, 'clip-timeline', info.project.name)
})

test('휴대폰 사진이 없는 구간에는 휴대폰 줄이 없다', async ({ page }) => {
  await setup(page, soon(), false)
  await page.getByRole('button', { name: /증거 구간 보기/ }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText(/^웹캠\s*\d+장/)).toBeVisible()
  await expect(dialog.getByText(/^휴대폰 \(이전 기록\)/)).toHaveCount(0)
  await expect(dialog.getByRole('button', { name: /^휴대폰 .*사진$/ })).toHaveCount(0)
})

test('완료된 회차에서도 이벤트를 확정/기각할 수 있다', async ({ page }) => {
  const { calls } = await setup(page, soon())
  const suspect = page.getByRole('radio', { name: '부정 의심', exact: true })
  await expect(suspect).toBeEnabled()
  await expect(page.getByRole('radio', { name: '문제 없음', exact: true })).toBeEnabled()
  await suspect.click()
  await expect(suspect).toHaveAttribute('aria-checked', 'true')
  expect(calls).toContain('PUT /events/5/review')
})

test('삭제 2일 이내면 경고 표시와 연장 버튼, 연장하면 횟수와 이력이 바뀐다', async ({ page }, info) => {
  const { calls } = await setup(page, soon())
  await expect(page.getByText(/일 뒤 삭제됩니다/)).toBeVisible()
  await expect(page.getByText('연장 0/2회')).toBeVisible()
  const btn = page.getByRole('button', { name: '7일 연장' })
  await expect(btn).toBeEnabled()
  await shot(page, 'retention-soon', info.project.name)
  await btn.click()
  await page.getByRole('button', { name: '연장하기' }).click()
  await expect(page.getByText('연장 1/2회')).toBeVisible()
  await expect(page.getByText(/1회 연장:/)).toBeVisible()
  expect(calls).toContain('POST /retention/extend')
  await expect(page.getByRole('button', { name: '7일 연장' })).toBeDisabled()
})

test('연장할 수 없을 때(삭제 예정 2일보다 이름) 버튼이 꺼지고 이유를 알린다', async ({ page }) => {
  await setup(page, { ...soon(), expiresAt: new Date(Date.now() + 6 * 24 * 3600 * 1000).toISOString(), canExtend: false })
  await expect(page.getByRole('button', { name: '7일 연장' })).toBeDisabled()
  await expect(page.getByText('삭제 예정 2일 전부터 연장할 수 있습니다')).toBeVisible()
})
