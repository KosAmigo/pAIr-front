// cam-proctor 에서 옮겨 온 테스트가 쓰던 vitest 문법(describe·it·expect)을 node:test 로 돌리기 위한 얇은 연결.
// frontend 는 테스트를 node --test 로 돌린다 (package.json test:anti-cheating 와 같은 방식).
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

export { describe, it }

export function expect(actual: unknown) {
  const num = () => {
    assert.equal(typeof actual, 'number', `숫자가 아님: ${String(actual)}`)
    return actual as number
  }
  return {
    toBe: (expected: unknown) => assert.equal(actual, expected),
    toEqual: (expected: unknown) => assert.deepEqual(actual, expected),
    toBeNull: () => assert.equal(actual, null),
    toBeUndefined: () => assert.equal(actual, undefined),
    toBeCloseTo: (expected: number, digits = 2) => {
      const diff = Math.abs(num() - expected)
      assert.ok(diff < 10 ** -digits / 2, `${String(actual)} 이(가) ${expected} 에 가깝지 않음`)
    },
    toBeGreaterThan: (n: number) => assert.ok(num() > n, `${String(actual)} > ${n}`),
    toBeGreaterThanOrEqual: (n: number) => assert.ok(num() >= n, `${String(actual)} >= ${n}`),
    toBeLessThanOrEqual: (n: number) => assert.ok(num() <= n, `${String(actual)} <= ${n}`),
    toContain: (item: unknown) => {
      if (typeof actual === 'string') assert.ok(actual.includes(String(item)), `"${actual}" 에 "${String(item)}" 없음`)
      else assert.ok((actual as unknown[]).includes(item), `${JSON.stringify(actual)} 에 ${JSON.stringify(item)} 없음`)
    },
    toHaveLength: (n: number) => assert.equal((actual as { length: number }).length, n),
    not: {
      toBeNull: () => assert.notEqual(actual, null),
    },
  }
}
