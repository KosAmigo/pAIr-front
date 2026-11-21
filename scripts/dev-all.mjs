#!/usr/bin/env node
// 터널 + 백엔드(8180) + 프론트(5173)를 한 터미널에서 한 번에 띄운다 (Windows·macOS·Linux 공통, Node 만 있으면 된다).
//   node pAIr-front/scripts/dev-all.mjs               (pAIr-front 와 pAIr-back 이 들어 있는 상위 폴더에서)
//   node scripts/dev-all.mjs                          (pAIr-front 폴더에서)
//   npm --prefix frontend run dev:all                 (pAIr-front 폴더에서)
//   옵션: --no-tunnel  같은 와이파이만 쓸 때(터널 없이)   --back-dir <경로>  pAIr-back 위치(기본: pAIr-front 옆)
// 실행 위치와 상관없이 이 파일 위치를 기준으로 경로를 찾는다. 끝낼 때는 Ctrl+C 한 번이면 세 프로세스가 모두 종료된다.
// 이미 떠 있는 포트는 건너뛴다. 터널을 먼저 열어 주소를 알아낸 뒤 백엔드(초대 메일 링크)와 프론트(휴대폰 QR)에 넘긴다.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BACK_PORT, FRONT_PORT, cloudflaredInstallHint, extractTunnelUrl, planServices, quote } from './dev-all-lib.mjs'

const PLATFORM = process.platform
const TUNNEL_WAIT_MS = 30_000
const READY_WAIT_MS = 180_000
const COLORS = { 터널: 36, 백엔드: 33, 프론트: 35 }

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const frontRoot = path.resolve(scriptDir, '..')
const args = process.argv.slice(2)
const noTunnel = args.includes('--no-tunnel')
const backIdx = args.indexOf('--back-dir')
const backDir = path.resolve(backIdx >= 0 ? args[backIdx + 1] : path.join(frontRoot, '..', 'pAIr-back'))
const frontDir = path.join(frontRoot, 'frontend')

const children = []
let stopping = false

function log(name, text) {
  const color = COLORS[name] ?? 37
  for (const line of String(text).split(/\r?\n/)) {
    if (line.trim()) process.stdout.write(`\x1b[${color}m[${name}]\x1b[0m ${line}\n`)
  }
}

function portInUse(port) {
  const probe = (host) =>
    new Promise((resolve) => {
      const s = net.connect({ port, host })
      s.once('connect', () => (s.destroy(), resolve(true)))
      s.once('error', () => resolve(false))
    })
  return Promise.all([probe('127.0.0.1'), probe('::1')]).then((r) => r.some(Boolean))
}

function findCloudflared() {
  const finder = PLATFORM === 'win32' ? 'where' : 'which'
  const found = spawnSync(finder, ['cloudflared'], { encoding: 'utf8' })
  if (found.status === 0) return found.stdout.split(/\r?\n/)[0].trim()
  const fallback = 'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe'
  return PLATFORM === 'win32' && existsSync(fallback) ? fallback : null
}

function launch(name, command, { cwd, env = {}, onOutput }) {
  const child = spawn(command, {
    cwd,
    env: { ...process.env, ...env },
    shell: true,
    detached: PLATFORM !== 'win32', // 유닉스에서는 프로세스 그룹으로 묶어 한 번에 끈다
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const handle = (chunk) => {
    log(name, chunk)
    onOutput?.(String(chunk))
  }
  child.stdout.on('data', handle)
  child.stderr.on('data', handle)
  child.on('exit', (code) => {
    if (!stopping) log(name, `종료됨 (코드 ${code})`)
  })
  children.push(child)
  return child
}

function killTree(child) {
  if (!child.pid || child.exitCode !== null) return
  if (PLATFORM === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      child.kill('SIGTERM')
    }
  }
}

function stopAll() {
  if (stopping) return
  stopping = true
  console.log('\n모든 서버를 종료합니다...')
  children.forEach(killTree)
  setTimeout(() => process.exit(0), 500)
}

async function waitFor(check, timeoutMs, intervalMs = 1000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline && !stopping) {
    const value = await check()
    if (value) return value
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  return null
}

async function openTunnel() {
  const exe = findCloudflared()
  if (!exe) {
    console.warn(`cloudflared 가 없어 터널 없이 시작합니다. 설치: ${cloudflaredInstallHint(PLATFORM)}`)
    console.warn('(같은 와이파이만 쓰면 --no-tunnel 로 이 안내를 끌 수 있습니다)')
    return null
  }
  let url = null
  launch('터널', `${quote(exe)} tunnel --no-autoupdate --url http://localhost:${FRONT_PORT}`, {
    cwd: frontDir,
    onOutput: (text) => (url ??= extractTunnelUrl(text)),
  })
  const found = await waitFor(() => url, TUNNEL_WAIT_MS, 500)
  if (!found) console.warn(`터널 주소를 ${TUNNEL_WAIT_MS / 1000}초 안에 찾지 못했습니다. [터널] 로그를 확인하세요.`)
  return found
}

async function main() {
  if (!existsSync(path.join(backDir, 'backend', PLATFORM === 'win32' ? 'gradlew.bat' : 'gradlew'))) {
    console.error(`pAIr-back 을 찾을 수 없습니다: ${backDir}\n--back-dir <경로> 로 pAIr-back 위치를 지정하세요.`)
    process.exit(1)
  }
  process.on('SIGINT', stopAll)
  process.on('SIGTERM', stopAll)

  if (await portInUse(FRONT_PORT)) console.log(`[프론트] ${FRONT_PORT} 번이 이미 사용 중이라 건너뜁니다. (터널은 이 포트를 가리킵니다)`)
  const tunnelUrl = noTunnel ? null : await openTunnel()

  // 윈도우는 사용자 이름에 한글이 있으면 임시 폴더 경로 때문에 gradle 이 실패할 수 있어 짧은 경로를 쓴다
  const javaTmp = process.env.PAIR_JAVA_TMP ?? (PLATFORM === 'win32' ? 'C:/dev/tmp' : null)
  if (javaTmp) mkdirSync(javaTmp, { recursive: true })

  const started = []
  for (const svc of planServices({ platform: PLATFORM, frontDir, backDir, tunnelUrl, javaTmp })) {
    if (await portInUse(svc.port)) {
      console.log(`[${svc.name}] ${svc.port} 번이 이미 사용 중이라 건너뜁니다.`)
      if (svc.name === '백엔드' && tunnelUrl) console.warn('이미 떠 있는 백엔드는 새 터널 주소를 모릅니다. 초대 메일 링크가 이전 주소로 나오면 백엔드를 껐다가 다시 실행하세요.')
      continue
    }
    launch(svc.name, svc.command, { cwd: svc.cwd, env: svc.env })
    started.push(svc)
  }

  for (const svc of started) {
    const ready = await waitFor(async () => {
      try {
        return (await fetch(`http://localhost:${svc.port}${svc.readyPath}`)).ok
      } catch {
        return false
      }
    }, READY_WAIT_MS)
    console.log(ready ? `[${svc.name}] 준비됐습니다 (포트 ${svc.port})` : `[${svc.name}] 준비 확인 시간이 지났습니다. 위 로그를 확인하세요.`)
  }

  console.log('')
  if (tunnelUrl) console.log(`터널 주소: ${tunnelUrl}`)
  console.log(`PC 브라우저: http://localhost:${FRONT_PORT}${tunnelUrl ? ' (휴대폰 QR 에는 터널 주소가 들어갑니다)' : ''}`)
  console.log('끝낼 때는 Ctrl+C 를 누르세요.')
  if (children.length === 0) process.exit(0)
}

main().catch((e) => {
  console.error(e)
  stopAll()
})
