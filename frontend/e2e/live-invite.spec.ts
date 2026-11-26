import { expect, test, type Page } from '@playwright/test'

const INVITE = 'A'.repeat(43)

/** 응시 API 를 흉내 내고, 요청마다 초대 토큰 헤더를 모은다 */
async function setup(page: Page, status: string) {
  const seen: { path: string; method: string; invite: string | null }[] = []
  await page.addInitScript((invite) => {
    const live = {
      invite, title: '회차', startsAt: '2020-01-01T00:00:00Z', endsAt: '2099-01-01T00:00:00Z', proctoring: false,
      attempts: { 'order-deadlock-live': '101' }, serverOffsetMs: 0,
    }
    sessionStorage.setItem('pair:live-exam', JSON.stringify(live))
  }, INVITE)
  await page.route((url) => url.pathname.startsWith('/api/'), (route) => {
    const req = route.request()
    const path = new URL(req.url()).pathname
    const json = (data: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
    if (path.startsWith('/api/attempts')) seen.push({ path, method: req.method(), invite: req.headers()['x-pair-invite'] ?? null })
    if (path === '/api/attempts/101') {
      return json({
        attempt: {
          id: '101', taskId: 'order-deadlock', provider: 'openai', model: 'm', startedAt: '2026-11-25T00:00:00Z', submittedAt: null,
          followupsDoneAt: null, firstValidAt: null, status, followUpAnswers: [], error: null, followUpQuestions: null,
        },
        task: {
          id: 'order-deadlock', type: 'dev', title: '주문 과제', description: [], minutes: 60, openFile: 'src/A.java', editableFile: null,
          requirements: [], requiredHeadings: [], followUps: ['질문'], notes: [],
        },
        files: ['src/A.java', 'test/ATest.java'], turns: [], chatMaxChars: 1000, elapsedSeconds: 1,
      })
    }
    if (path.endsWith('/file')) return json({ path: 'src/A.java', content: 'class A {}' })
    if (path.endsWith('/heartbeat')) return json({ expired: false })
    if (path.endsWith('/build')) return json({ success: true, lines: ['BUILD SUCCESSFUL'], diagnostics: [], millis: 1 })
    return json([])
  })
  return seen
}

test('실전 응시 화면은 모든 응시 API 요청에 초대 토큰을 붙인다', async ({ page }) => {
  const seen = await setup(page, 'SOLVING')
  await page.goto('/exam/101?mode=live')
  await expect.poll(() => seen.some((r) => r.path.endsWith('/file'))).toBe(true)
  await page.getByRole('button', { name: '빌드', exact: true }).click()
  await expect.poll(() => seen.some((r) => r.path.endsWith('/build'))).toBe(true)
  expect(seen.filter((r) => r.invite !== INVITE)).toEqual([])
})

test('제출이 끝난 실전 응시는 리포트가 아니라 제출 완료 화면으로 가고 토큰으로 조회한다', async ({ page }) => {
  const seen = await setup(page, 'SCORING')
  await page.goto('/exam/101?mode=live')
  await expect(page).toHaveURL(/\/exam\/101\/submitted$/)
  await expect(page.getByText('수고하셨습니다.')).toBeVisible()
  expect(seen.length).toBeGreaterThan(0)
  expect(seen.filter((r) => r.invite !== INVITE)).toEqual([])
})
