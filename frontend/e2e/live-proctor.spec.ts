import { expect, test, type Page } from '@playwright/test'

// 실전 감독 경로: 연결 신호 만료, 종료 시각 자동 종료, 붙여넣기 감지.
// 모킹 방식은 live-invite.spec.ts 와 같다 (route 가로채기 + sessionStorage 의 실전 맥락).
const INVITE = 'B'.repeat(43)

type Opts = { proctoring: boolean; endsInMs?: number; expired?: boolean }
type Seen = { path: string; method: string; body: string | null }

async function setup(page: Page, opts: Opts) {
  const seen: Seen[] = []
  await page.addInitScript(
    ({ invite, o }) => {
      // 전체 화면 조건: 헤드리스에서는 requestFullscreen 이 막히므로 fullscreenElement 만 켜진 것으로 돌려준다 (전체 화면 안내창이 화면을 덮지 않게)
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => document.documentElement })
      const live = {
        invite, title: '회차', startsAt: '2020-01-01T00:00:00Z',
        endsAt: new Date(o.endsInMs ? Date.now() + o.endsInMs : Date.parse('2099-01-01T00:00:00Z')).toISOString(),
        proctoring: o.proctoring, attempts: { 'order-deadlock-live': '101' }, serverOffsetMs: 0,
      }
      sessionStorage.setItem('pair:live-exam', JSON.stringify(live))
    },
    { invite: INVITE, o: opts },
  )
  // 감독 릴레이(웹소켓)는 열어 두기만 하고 아무것도 보내지 않는다
  await page.routeWebSocket(() => true, () => undefined)
  await page.route((url) => url.pathname.startsWith('/api/'), (route) => {
    const req = route.request()
    const path = new URL(req.url()).pathname
    const json = (data: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
    seen.push({ path, method: req.method(), body: req.postData() })
    if (path === '/api/attempts/101') {
      return json({
        attempt: {
          id: '101', taskId: 'order-deadlock', provider: 'openai', model: 'm', startedAt: '2026-11-25T00:00:00Z', submittedAt: null,
          followupsDoneAt: null, firstValidAt: null, status: 'SOLVING', followUpAnswers: [], error: null, followUpQuestions: null,
        },
        task: {
          id: 'order-deadlock', type: 'dev', title: '주문 과제', description: [], minutes: 60, openFile: 'src/A.java', editableFile: null,
          requirements: [], requiredHeadings: [], followUps: ['질문'], notes: [],
        },
        files: ['src/A.java'], turns: [], chatMaxChars: 1000, elapsedSeconds: 1,
      })
    }
    if (path.endsWith('/file')) return json({ path: 'src/A.java', content: 'class A {}' })
    if (path.endsWith('/heartbeat')) return json({ expired: Boolean(opts.expired) })
    if (path.endsWith('/proctor-events')) return json({ id: 1 })
    return json([])
  })
  return seen
}

test('연결 신호 응답이 만료면 입장 링크 만료 안내가 뜬다', async ({ page }) => {
  await setup(page, { proctoring: false, expired: true })
  await page.goto('/exam/101?mode=live')
  const dialog = page.getByRole('alertdialog', { name: '입장 링크 만료' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('입장 링크가 만료되었습니다')).toBeVisible()
})

test('종료 시각이 지나면 제출 완료 화면으로 한 번만 이동한다', async ({ page }) => {
  const seen = await setup(page, { proctoring: false, endsInMs: 10_000 })
  const submittedNav: string[] = []
  page.on('framenavigated', (f) => {
    if (f === page.mainFrame() && /\/exam\/101\/submitted$/.test(f.url())) submittedNav.push(f.url())
  })
  await page.goto('/exam/101?mode=live')
  await expect(page.getByRole('button', { name: '빌드', exact: true })).toBeVisible()
  await expect(page).toHaveURL(/\/exam\/101\?mode=live$/)
  await expect(page).toHaveURL(/\/exam\/101\/submitted$/, { timeout: 20_000 })
  // 종료 처리가 중복으로 돌 시간을 더 준 뒤에도 이동은 한 번이어야 한다
  await page.waitForTimeout(3000)
  expect(submittedNav).toHaveLength(1)
  expect(seen.filter((r) => r.method === 'POST' && /\/(submit|finish|end)$/.test(r.path))).toEqual([])
})

test('감독 회차에서 외부 글을 붙여 넣으면 PASTE 이벤트가 글자 수·위치만 담아 전송된다', async ({ page }) => {
  const seen = await setup(page, { proctoring: true })
  await page.goto('/exam/101?mode=live')
  await expect(page.locator('.cm-editor').first()).toBeVisible()
  // 감지기는 풀이 화면이 뜬 뒤(watching) 켜지므로, 이벤트가 전송될 때까지 붙여넣기를 반복한다
  const SECRET = '외부에서 복사한 비밀 문장입니다 SECRET-PASTE-BODY\n두 번째 줄'
  const paste = () =>
    page.evaluate((text) => {
      const dt = new DataTransfer()
      dt.setData('text/plain', text)
      const target = document.querySelector('.cm-content') ?? document.body
      target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    }, SECRET)
  await expect
    .poll(async () => {
      await paste()
      return seen.filter((r) => r.path.endsWith('/proctor-events')).length
    }, { timeout: 10_000 })
    .toBeGreaterThan(0)
  const events = seen.filter((r) => r.path.endsWith('/proctor-events'))
  const body = JSON.parse(events[0].body ?? '{}')
  expect(events[0].method).toBe('POST')
  expect(events[0].path).toContain(INVITE)
  expect(body).toMatchObject({ type: 'PASTE', source: 'BROWSER' })
  expect(body.detail).toMatchObject({ chars: SECRET.length, lines: 2, target: 'editor' })
  for (const e of events) expect(e.body).not.toContain('SECRET-PASTE-BODY')
})
