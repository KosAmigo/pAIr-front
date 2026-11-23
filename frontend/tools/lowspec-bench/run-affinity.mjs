// 별도 프로필의 Edge 를 띄워 모든 프로세스를 지정한 코어에만 묶은 뒤 app-path.html 측정을 돌려 JSON 한 줄로 출력한다.
// DevTools CPU 스로틀은 Worker 에 적용되지 않아서, 코어 제한(프로세스 어피니티)으로 Worker 까지 같이 느리게 만든다. Windows 전용.
//   node run-affinity.mjs --vision worker --cpus 20,21 --secs 30 [--base http://localhost:5174]
//   --cpus all 이면 제한하지 않는다. --phone 1 이면 휴대폰 분석 Worker 도 동시에 돌린다.
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import WebSocket from 'ws'

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]]] : a), []))
const vision = args.vision ?? 'worker'
const cpus = args.cpus ?? 'all'
const secs = Number(args.secs ?? 30)
const base = args.base ?? 'http://localhost:5174'
const port = Number(args.port ?? 9333)
const edge = args.browser ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const profile = mkdtempSync(join(tmpdir(), 'pair-bench-'))

const ps = (script) => execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8' })

function pinAll() {
  if (cpus === 'all') return 0
  const mask = cpus.split(',').reduce((m, c) => m | (1n << BigInt(c)), 0n)
  const out = ps(
    `$n=0; Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*${profile}*' } | ForEach-Object { try { (Get-Process -Id $_.ProcessId).ProcessorAffinity = [IntPtr]${mask}; $n++ } catch {} }; $n`,
  )
  return Number(out.trim())
}

async function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl)
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej) })
  let id = 0
  const pending = new Map()
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString())
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
  })
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
  return { send, close: () => ws.close() }
}

const proc = spawn(edge, [`--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, '--no-first-run', '--no-default-browser-check', '--window-size=900,700',
  // 창이 가려져도 타이머·렌더러가 느려지지 않게 한다 (측정이 흔들리지 않도록)
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', 'about:blank'], { stdio: 'ignore' })
let result = { error: '측정 실패' }
try {
  let target = null
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(500)
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      target = list.find((t) => t.type === 'page')
    } catch { /* 아직 안 떴다 */ }
  }
  if (!target) throw new Error('Edge 디버그 포트에 연결하지 못했습니다')
  const c = await cdp(target.webSocketDebuggerUrl)
  await c.send('Page.enable')
  await c.send('Page.navigate', { url: `${base}/tools/lowspec-bench/app-path.html?vision=${vision}&secs=${secs}${args.mode ? `&mode=${args.mode}` : ''}${args.phone ? '&phone=1' : ''}` })
  await sleep(4000) // 페이지와 모듈이 올라오게 한다
  const pinned = pinAll()
  await sleep(500)
  const start = await c.send('Runtime.evaluate', { expression: 'typeof window.__start === "function"', returnByValue: true })
  if (!start.result?.result?.value) throw new Error('측정 페이지가 준비되지 않았습니다')
  await c.send('Runtime.evaluate', { expression: 'void window.__start()' })
  const deadline = Date.now() + (secs + 120) * 1000
  while (Date.now() < deadline) {
    await sleep(2000)
    const r = await c.send('Runtime.evaluate', { expression: 'JSON.stringify(window.__result ?? null)', returnByValue: true })
    const v = r.result?.result?.value
    if (v && v !== 'null') { result = JSON.parse(v); break }
  }
  result.pinnedProcesses = pinned
  result.cpus = cpus
  c.close()
} catch (e) {
  result = { error: String(e?.message ?? e), vision, cpus }
} finally {
  try { ps(`Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like '*${profile}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`) } catch { /* 이미 끝남 */ }
  proc.kill()
  await sleep(1000)
  try { rmSync(profile, { recursive: true, force: true }) } catch { /* 잠겨 있으면 둔다 */ }
}
console.log(JSON.stringify(result))
