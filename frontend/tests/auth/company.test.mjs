import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { companyApi } from '../../src/company/companyApi.ts'
import { canDelegate, mustLogoutForOnboarding, needsOnboarding } from '../../src/company/policy.ts'

const originalFetch = globalThis.fetch
const originalStorage = globalThis.localStorage
afterEach(() => {
  globalThis.fetch = originalFetch
  if (originalStorage === undefined) delete globalThis.localStorage
  else globalThis.localStorage = originalStorage
})

function session() {
  globalThis.localStorage = { getItem: () => JSON.stringify({ token: 'test-token', user: { id: 1, role: 'MANAGER' } }) }
}

test('enterprise onboarding fails closed unless both conditions are complete', () => {
  for (const role of ['MANAGER', 'PROCTOR']) {
    assert.equal(needsOnboarding({ role }), true)
    assert.equal(needsOnboarding({ role, emailVerified: true, passwordChangeRequired: true }), true)
    assert.equal(needsOnboarding({ role, emailVerified: false, passwordChangeRequired: false }), true)
    assert.equal(needsOnboarding({ role, emailVerified: true, passwordChangeRequired: false }), false)
  }
  assert.equal(needsOnboarding({ role: 'USER' }), false)
  assert.equal(needsOnboarding({ role: 'ADMIN' }), false)
})

test('delegation requires an authenticated and password-updated proctor', () => {
  const member = { role: 'PROCTOR', status: 'ACTIVE', emailVerified: true, passwordChangeRequired: false }
  assert.equal(canDelegate(member), true)
  assert.equal(canDelegate({ ...member, role: 'MANAGER' }), false)
  assert.equal(canDelegate({ ...member, status: 'WITHDRAWN' }), false)
  assert.equal(canDelegate({ ...member, emailVerified: false }), false)
  assert.equal(canDelegate({ ...member, passwordChangeRequired: true }), false)
})

test('company detail matches the backend company and members response', async () => {
  session()
  const detail = {
    company: { id: 3, name: 'Example', businessNo: '123', contact: 'contact@example.com', createdAt: '2026-01-01T00:00:00Z' },
    members: [{ id: 9, name: 'Manager', email: 'manager@example.com', role: 'MANAGER', status: 'ACTIVE', emailVerified: true, passwordChangeRequired: false, onboardingMailStatus: 'SENT' }],
  }
  globalThis.fetch = async (url) => {
    assert.equal(url, '/api/admin/companies/3')
    return Response.json(detail)
  }
  assert.deepEqual(await companyApi.company(3), detail)
})

test('incomplete account is logged out on navigation away from onboarding', () => {
  const user = { role: 'MANAGER', emailVerified: false, passwordChangeRequired: true }
  assert.equal(mustLogoutForOnboarding(user, '/onboarding', '/login'), false)
  assert.equal(mustLogoutForOnboarding(user, '/login', '/login'), false)
  assert.equal(mustLogoutForOnboarding(user, '/login', '/onboarding'), true)
  assert.equal(mustLogoutForOnboarding(user, '/console/sessions', '/onboarding'), true)
  assert.equal(mustLogoutForOnboarding({ ...user, emailVerified: true, passwordChangeRequired: false }, '/console/sessions', '/onboarding'), false)
})

test('public inquiry uploads the supplied multipart data and preserves server errors', async () => {
  const form = new FormData()
  form.set('companyName', 'Example')
  form.set('businessNo', '123')
  form.set('members', new Blob(['회원명,회원이메일,역할']), 'members.csv')
  globalThis.fetch = async (url, init) => {
    assert.equal(url, '/api/company-inquiries')
    assert.equal(init.body, form)
    assert.equal(init.headers, undefined)
    return Response.json({ message: '매니저는 정확히 1명이어야 합니다.' }, { status: 400 })
  }
  await assert.rejects(companyApi.submitInquiry(form), /매니저는 정확히 1명/)
})

test('manager operations send only server-scoped email or proctor id with bearer authentication', async () => {
  session()
  const seen = []
  globalThis.fetch = async (url, init) => {
    seen.push({ url, init })
    return new Response(null, { status: 204 })
  }
  await companyApi.invite('proctor@example.com')
  await companyApi.delegate(123)
  assert.equal(seen[0].url, '/api/console/company/proctor-invites')
  assert.deepEqual(JSON.parse(seen[0].init.body), { email: 'proctor@example.com' })
  assert.equal(seen[1].url, '/api/console/company/manager-delegation')
  assert.deepEqual(JSON.parse(seen[1].init.body), { proctorUserId: 123 })
  assert.equal(seen[1].init.headers.Authorization, 'Bearer test-token')
})

test('invite tokens are encoded and acceptance never sends role or company', async () => {
  const seen = []
  globalThis.fetch = async (url, init) => {
    seen.push({ url, init })
    return Response.json({})
  }
  await companyApi.invitation('a/b')
  await companyApi.inviteCode('a/b')
  await companyApi.accept('a/b', 'Name', 'password', '123456')
  assert.equal(seen[0].url, '/api/company-invites/a%2Fb')
  assert.equal(seen[1].url, '/api/company-invites/a%2Fb/email-verifications')
  assert.deepEqual(JSON.parse(seen[2].init.body), { token: 'a/b', name: 'Name', password: 'password', code: '123456' })
})

test('onboarding and admin CSV requests use correct authenticated endpoints', async () => {
  session()
  const seen = []
  globalThis.fetch = async (url, init) => {
    seen.push({ url, init })
    return new Response(null, { status: 204 })
  }
  await companyApi.onboardingCode()
  await companyApi.verifyOnboarding('123456')
  await companyApi.replaceMembers(12, new File(['csv'], 'members.csv'))
  await companyApi.replaceManager(3, 'Name', 'manager@example.com')
  await companyApi.reissue(9)
  assert.equal(seen[0].init.headers.Authorization, 'Bearer test-token')
  assert.deepEqual(JSON.parse(seen[1].init.body), { code: '123456' })
  assert.equal(seen[2].url, '/api/admin/company-inquiries/12/members')
  assert.equal(seen[2].init.body.get('file').name, 'members.csv')
  assert.equal(seen[2].init.headers['Content-Type'], undefined)
  assert.deepEqual(JSON.parse(seen[3].init.body), { name: 'Name', email: 'manager@example.com' })
  assert.equal(seen[4].url, '/api/admin/members/9/onboarding/reissue')
})
