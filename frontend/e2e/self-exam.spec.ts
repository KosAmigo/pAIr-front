import { expect, test, type Page } from '@playwright/test'

// 자가진단 응시 화면(/exam/:id, 실전 맥락 없음). 모킹 방식은 live-proctor.spec.ts 와 같다 (/api route 가로채기 + 보낸 요청 기록).
// 실전 맥락(sessionStorage 의 live exam)은 넣지 않는다.
type Seen = { path: string; method: string; body: string | null }

const USER = { id: 7, email: 'user@example.test', name: '응시자', role: 'USER', companyId: null, companyName: null, emailVerified: true }
const TASK_MINUTES = 40
const ELAPSED = 600 // 10분 지남 → 남은 30:00

async function setup(page: Page) {
  const seen: Seen[] = []
  await page.addInitScript((u) => {
    localStorage.setItem('pair.auth', JSON.stringify({ token: 't', user: u }))
  }, USER)
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const req = route.request()
    const path = new URL(req.url()).pathname
    seen.push({ path, method: req.method(), body: req.postData() })
    const json = (data: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
    if (path === '/api/auth/me') return json(USER)
    if (path === '/api/credits') return json({ balance: 50 })
    if (path === '/api/attempts/101') {
      return json({
        attempt: {
          id: '101', taskId: 'order-deadlock', provider: 'openai', model: 'm', startedAt: '2026-11-25T00:00:00Z', submittedAt: null,
          followupsDoneAt: null, firstValidAt: null, status: 'SOLVING', followUpAnswers: [], error: null, followUpQuestions: null,
        },
        task: {
          id: 'order-deadlock', type: 'dev', title: '주문 과제', description: [], minutes: TASK_MINUTES, openFile: 'src/A.java', editableFile: null,
          requirements: [], requiredHeadings: [], followUps: ['락 순서를 어떻게 정했나요?'], notes: [],
        },
        files: ['src/A.java'], turns: [], chatMaxChars: 1000, elapsedSeconds: ELAPSED,
      })
    }
    if (path === '/api/attempts/101/chat/stream') {
      const turns = [
        { turn: 1, role: 'user', time: '2026-11-25T00:01:00Z', text: '데드락이 왜 생기나요?' },
        { turn: 2, role: 'ai', time: '2026-11-25T00:01:02Z', text: '락을 서로 반대 순서로 잡기 때문입니다.' },
      ]
      // chatStream 이 읽는 SSE: delta 이벤트(t)들 뒤에 done 이벤트(추가된 턴 배열)
      const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
      return route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: sse('delta', { t: '락을 서로 반대 ' }) + sse('delta', { t: '순서로 잡기 때문입니다.' }) + sse('done', turns),
      })
    }
    if (path === '/api/attempts/101/file' && req.method() === 'GET') return json({ path: 'src/A.java', content: 'class A {}' })
    if (path === '/api/attempts/101/file') return json({ saved: true })
    if (path === '/api/attempts/101/submit' || path === '/api/attempts/101/followups') {
      return json({ id: '101', status: path.endsWith('submit') ? 'FOLLOWUP' : 'SCORING' })
    }
    return json([])
  })
  return seen
}

const count = (seen: Seen[], path: string, method?: string) => seen.filter((r) => r.path === path && (!method || r.method === method)).length

test('자가진단으로 열면 응시 화면과 남은 시간이 뜨고 감독 요청은 가지 않는다', async ({ page }) => {
  const seen = await setup(page)
  await page.goto('/exam/101')
  await expect(page.getByRole('button', { name: '빌드', exact: true })).toBeVisible()
  await expect(page.getByText('주문 과제').first()).toBeVisible()
  // 과제 제한 시간(40분) - 지난 시간(10분) = 30분. 로딩 중 몇 초 지났을 수 있어 29분대도 허용
  await expect(page.getByRole('timer')).toHaveText(/^00:(30:00|29:[2-5]\d)$/)
  await page.waitForTimeout(1500)
  expect(seen.filter((r) => /heartbeat|proctor-events|proctor/.test(r.path))).toEqual([])
})

test('편집기에 글을 치면 약 2초 뒤 파일 저장 요청이 간다', async ({ page }) => {
  const seen = await setup(page)
  await page.goto('/exam/101')
  const editor = page.locator('.cm-content').first()
  await expect(editor).toBeVisible()
  await editor.click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type('// 자동저장확인')
  expect(count(seen, '/api/attempts/101/file', 'PUT')).toBe(0)
  await expect.poll(() => count(seen, '/api/attempts/101/file', 'PUT'), { timeout: 8000 }).toBeGreaterThan(0)
  const put = seen.find((r) => r.method === 'PUT' && r.path === '/api/attempts/101/file')!
  expect(JSON.parse(put.body ?? '{}').content).toContain('// 자동저장확인')
})

test('AI 에게 질문하면 답변이 나오고 크레딧을 다시 조회한다', async ({ page }) => {
  const seen = await setup(page)
  await page.goto('/exam/101')
  const input = page.locator('#chat-input')
  await expect(input).toBeVisible()
  // 처음 조회가 끝나 개수가 안정된 뒤 기준을 잡는다
  await expect.poll(() => count(seen, '/api/credits')).toBeGreaterThan(0)
  await page.waitForTimeout(500)
  const before = count(seen, '/api/credits')
  await input.fill('데드락이 왜 생기나요?')
  await page.getByRole('button', { name: '전송' }).click()
  await expect(page.getByText('락을 서로 반대 순서로 잡기 때문입니다.').first()).toBeVisible()
  const chat = seen.find((r) => r.path === '/api/attempts/101/chat/stream')!
  expect(JSON.parse(chat.body ?? '{}')).toMatchObject({ message: '데드락이 왜 생기나요?' })
  await expect.poll(() => count(seen, '/api/credits')).toBeGreaterThan(before)
})

test('제출하면 후속 질문으로 바뀌고 답을 내면 리포트로 이동한다', async ({ page }) => {
  const seen = await setup(page)
  await page.goto('/exam/101')
  await expect(page.getByRole('button', { name: '빌드', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '제출', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '풀이를 제출할까요?' })
  await dialog.getByRole('button', { name: '제출', exact: true }).click()
  await expect(page.getByRole('heading', { name: '락 순서를 어떻게 정했나요?' })).toBeVisible()
  expect(count(seen, '/api/attempts/101/submit', 'POST')).toBe(1)
  await page.getByLabel('답변').fill('항상 id 오름차순으로 잡았습니다')
  await page.getByRole('button', { name: '완료하고 채점하기' }).click()
  await expect(page).toHaveURL(/\/report\/101$/)
  const fu = seen.find((r) => r.path === '/api/attempts/101/followups')!
  expect(fu.method).toBe('POST')
  expect(JSON.parse(fu.body ?? '{}')).toEqual({ answers: ['항상 id 오름차순으로 잡았습니다'] })
})
