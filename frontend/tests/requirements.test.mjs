// 요구사항 표시: 문자열 목록 → 만들 기능(시그니처·설명·매개변수) + 예시 표 (data/requirements.ts)
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hasStructure, methodOf, parseRequirements, splitCalls, splitSignature } from '../src/data/requirements.ts'

test('새 형식: 만들 기능 + 매개변수 + 예시', () => {
  const p = parseRequirements([
    '만들 기능: `UsageService.payable(int base, int used, int cap, int fee): int` — 이번 달 내야 할 금액을 돌려줘요',
    '- base: 기본 요금(원)',
    '- used: 사용한 금액',
    '새 UsageService에 addUsage("주문다", 60000)을 호출한 뒤 payable(20000, 5000, 100000, 3000) → 18000',
  ])
  assert.equal(p.features.length, 1)
  assert.deepEqual(p.features[0], {
    signature: 'UsageService.payable(int base, int used, int cap, int fee): int',
    summary: '이번 달 내야 할 금액을 돌려줘요',
    params: [{ name: 'base', meaning: '기본 요금(원)' }, { name: 'used', meaning: '사용한 금액' }],
  })
  assert.deepEqual(p.examples, [{ input: '새 UsageService에 addUsage("주문다", 60000)을 호출한 뒤 payable(20000, 5000, 100000, 3000)', expected: '18000' }])
  assert.deepEqual(p.other, [])
  assert.equal(hasStructure(p), true)
})

test('예전 형식: 예시 줄만 있다', () => {
  const p = parseRequirements(['coupon(1000, 2) → 800', 'coupon(500, 0) → 500'])
  assert.deepEqual(p.features, [])
  assert.deepEqual(p.examples.map((e) => [e.input, e.expected]), [['coupon(1000, 2)', '800'], ['coupon(500, 0)', '500']])
})

test('변형: 백틱 없음, — 대신 -, → 앞뒤 공백 없음', () => {
  const p = parseRequirements(['만들 기능: Cart.total(List items): int - 장바구니 합계', '- items: 담긴 상품', 'total([1,2])→3'])
  assert.equal(p.features[0].signature, 'Cart.total(List items): int')
  assert.equal(p.features[0].summary, '장바구니 합계')
  assert.deepEqual(p.features[0].params, [{ name: 'items', meaning: '담긴 상품' }])
  assert.deepEqual(p.examples, [{ input: 'total([1,2])', expected: '3' }])
})

test('섞인 경우: 기능 여러 개, 기능 앞의 글·매개변수 아닌 줄은 other, 기능 밖의 - 줄은 other', () => {
  const p = parseRequirements([
    '아래 규칙을 지켜야 해요',
    '- 이름: 기능 앞의 줄은 매개변수가 아니다',
    '만들 기능: `A.one(int x): int` — 하나',
    '- x: 값',
    '만들 기능: `A.two(): void` — 둘',
    '그냥 설명 한 줄',
    'one(1) → 2',
  ])
  assert.deepEqual(p.features.map((f) => [f.signature, f.params.length]), [['A.one(int x): int', 1], ['A.two(): void', 0]])
  assert.deepEqual(p.other, ['아래 규칙을 지켜야 해요', '- 이름: 기능 앞의 줄은 매개변수가 아니다', '그냥 설명 한 줄'])
  assert.equal(p.examples.length, 1)
})

test('줄바꿈이 들어간 항목: 기능+매개변수가 한 항목, 예시 입력에 줄바꿈', () => {
  const p = parseRequirements(['만들 기능: `B.f(int a): int` — 설명\n- a: 값\n- b: 다른 값', 'f(1)\nf(2) → 3'])
  assert.equal(p.features[0].params.length, 2)
  assert.deepEqual(p.examples, [{ input: 'f(1)\nf(2)', expected: '3' }])
})

test('읽을 게 없으면 hasStructure=false (화면은 번호 목록)', () => {
  const p = parseRequirements(['첫째 조건', '둘째 조건'])
  assert.equal(hasStructure(p), false)
  assert.deepEqual(p.other, ['첫째 조건', '둘째 조건'])
  assert.deepEqual(parseRequirements(null), { features: [], examples: [], other: [], common: null, tables: [] })
})

test('splitCalls: 호출을 줄 단위로, 연결 말은 줄이고 값·순서는 그대로', () => {
  assert.deepEqual(splitCalls('새 UsageService에 addUsage("주문다", 60000)을 호출한 뒤 payable(20000, 5000, 100000, 3000)'), [
    { kind: 'text', text: '새 UsageService에' },
    { kind: 'call', text: 'addUsage("주문다", 60000)' },
    { kind: 'call', text: 'payable(20000, 5000, 100000, 3000)' },
  ])
  // 따옴표 안의 괄호는 무시
  assert.deepEqual(splitCalls('f("a)b", 1)'), [{ kind: 'call', text: 'f("a)b", 1)' }])
  // 호출이 없거나 괄호가 안 닫히면 원문 그대로
  assert.deepEqual(splitCalls('빈 목록'), [{ kind: 'text', text: '빈 목록' }])
  assert.deepEqual(splitCalls('f(1, 2'), [{ kind: 'text', text: 'f(1, 2' }])
  // 호출 뒤의 다른 글은 남긴다
  assert.deepEqual(splitCalls('f(1) 이후 합계'), [{ kind: 'call', text: 'f(1)' }, { kind: 'text', text: '이후 합계' }])
})

test('splitSignature: 메서드 이름만 떼어 낸다', () => {
  assert.deepEqual(splitSignature('UsageService.payable(int a): int'), { before: 'UsageService.', name: 'payable', after: '(int a): int' })
  assert.deepEqual(splitSignature('no parens'), { before: 'no parens', name: '', after: '' })
})

const J = (o) => JSON.stringify(o)

test('새 모양: 공통·준비·함수별 표', () => {
  const p = parseRequirements([
    '만들 기능: `PassRegistry.availableCodes(LocalDate visitDate): List<String>` — 설명',
    '- visitDate: 방문 예정 날짜',
    '예시 공통: 모든 시각은 한국 시간(+09:00)',
    '예시 준비: ' + J({ method: 'PassRegistry.availableCodes', text: '등록된 이용권: POOL-A' }),
    '예시: ' + J({ method: 'PassRegistry.availableCodes', args: [['visitDate', '2026-06-10']], expected: '["POOL-A"]' }),
    '예시: ' + J({ method: 'PassRegistry.availableCodes', args: [['visitDate', '2026-07-01']], expected: '[]' }),
    '예시: ' + J({ method: 'Clock.now', expected: 'true' }),
  ])
  assert.equal(p.common, '모든 시각은 한국 시간(+09:00)')
  assert.deepEqual(p.examples, [])
  assert.deepEqual(p.other, [])
  assert.equal(p.tables.length, 2)
  assert.deepEqual(p.tables[0], {
    method: 'PassRegistry.availableCodes',
    prep: '등록된 이용권: POOL-A',
    columns: ['visitDate'],
    rows: [{ values: ['2026-06-10'], expected: '["POOL-A"]' }, { values: ['2026-07-01'], expected: '[]' }],
  })
  assert.deepEqual(p.tables[1], { method: 'Clock.now', prep: null, columns: [], rows: [{ values: [], expected: 'true' }] })
  assert.equal(methodOf(p.features[0].signature), 'PassRegistry.availableCodes')
  assert.equal(hasStructure(p), true)
})

test('새·옛 모양이 섞이면 둘 다 읽는다', () => {
  const p = parseRequirements(['coupon(1000, 2) → 800', '예시: ' + J({ method: 'A.f', args: [['a', '1']], expected: '2' })])
  assert.equal(p.examples.length, 1)
  assert.equal(p.tables.length, 1)
})

test('잘못된 JSON 예시 줄은 글로 남긴다', () => {
  const p = parseRequirements(['예시: {"method": "A.f", ', '예시 준비: 그냥 글', '예시: ' + J({ method: 'A.f', args: [['a']], expected: '1' })])
  assert.equal(p.tables.length, 0)
  assert.equal(p.other.length, 3)
})
