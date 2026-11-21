import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { cloudflaredInstallHint, extractTunnelUrl, gradleCommand, planServices, quote } from '../../scripts/dev-all-lib.mjs'

describe('extractTunnelUrl', () => {
  it('cloudflared 로그에서 터널 주소를 꺼낸다', () => {
    const log = 'INF |  https://cube-checklist-gen-restaurant.trycloudflare.com  |'
    assert.equal(extractTunnelUrl(log), 'https://cube-checklist-gen-restaurant.trycloudflare.com')
  })
  it('api.trycloudflare.com 은 터널 주소가 아니므로 건너뛴다', () => {
    const log = 'Requesting new quick Tunnel on https://api.trycloudflare.com ...\n https://real-tunnel-name.trycloudflare.com'
    assert.equal(extractTunnelUrl(log), 'https://real-tunnel-name.trycloudflare.com')
  })
  it('주소가 없으면 null', () => {
    assert.equal(extractTunnelUrl('아무 로그'), null)
  })
})

describe('명령 만들기', () => {
  it('OS 에 맞는 gradle wrapper 를 쓴다', () => {
    assert.match(gradleCommand('win32'), /^backend\\gradlew\.bat -p backend bootRun/)
    assert.match(gradleCommand('linux'), /^\.\/backend\/gradlew -p backend bootRun/)
  })
  it('공백이 있는 경로만 따옴표로 감싼다', () => {
    assert.equal(quote('C:\\Program Files (x86)\\cloudflared\\cloudflared.exe'), '"C:\\Program Files (x86)\\cloudflared\\cloudflared.exe"')
    assert.equal(quote('/usr/bin/cloudflared'), '/usr/bin/cloudflared')
  })
  it('OS 별 cloudflared 설치 안내가 다르다', () => {
    assert.match(cloudflaredInstallHint('win32'), /winget/)
    assert.match(cloudflaredInstallHint('darwin'), /brew/)
  })
})

describe('planServices', () => {
  const base = { platform: 'linux', frontDir: '/p/pAIr-front/frontend', backDir: '/p/pAIr-back', javaTmp: null }

  it('터널이 있으면 주소를 백엔드·프론트에 넘기고 프론트는 빌드본으로 띄운다', () => {
    const [back, front] = planServices({ ...base, tunnelUrl: 'https://t.trycloudflare.com' })
    assert.equal(back.name, '백엔드')
    assert.equal(back.env.PAIR_ENTRY_BASE_URL, 'https://t.trycloudflare.com')
    assert.equal(front.env.PAIR_PUBLIC_ORIGIN, 'https://t.trycloudflare.com')
    assert.match(front.command, /^npm run build && npm run preview -- --port 5173 --strictPort$/)
  })

  it('터널이 없으면 환경변수 없이 개발 서버(dev:local)로 띄운다', () => {
    const [back, front] = planServices({ ...base, tunnelUrl: null })
    assert.equal(back.env.PAIR_ENTRY_BASE_URL, undefined)
    assert.deepEqual(front.env, {})
    assert.match(front.command, /^npm run dev:local -- --port 5173 --strictPort$/)
  })

  it('임시 폴더가 지정되면 gradle 에 넘긴다', () => {
    const [back] = planServices({ ...base, platform: 'win32', tunnelUrl: null, javaTmp: 'C:/dev/tmp' })
    assert.equal(back.env.JAVA_TOOL_OPTIONS, '-Djdk.net.unixdomain.tmpdir=C:/dev/tmp')
  })
})
