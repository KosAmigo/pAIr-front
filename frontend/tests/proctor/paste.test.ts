// 외부 붙여넣기 감지: 페이지 안 복사는 통과, 바깥 글만 이벤트. 브라우저 이벤트 → 전송 형식
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MIN_PASTE_CHARS, normalize, PasteDetector } from '../../src/anti-cheating/core/PasteDetector.ts'
import { toRequest } from '../../src/proctor/api/camOutbox.ts'
import { toBrowserViolation } from '../../src/proctor/core/events.ts'

const LONG = 'public int sum(int a, int b) { return a + b; }'

/** document 대신 쓰는 최소 이벤트 대상 */
class FakeDoc {
  listeners = new Map<string, (e: unknown) => void>()
  activeElement: unknown = null
  addEventListener(type: string, fn: (e: unknown) => void) {
    this.listeners.set(type, fn)
  }
  removeEventListener(type: string) {
    this.listeners.delete(type)
  }
  fire(type: string, e: unknown = {}) {
    this.listeners.get(type)?.(e)
  }
}

const pasteEvent = (text: string, target: unknown = null) => ({ clipboardData: { getData: () => text }, target })

describe('외부 붙여넣기 감지', () => {
  it('짧은 글은 무시하고, 페이지 안에서 복사한 글(일부 포함)은 외부로 보지 않는다', () => {
    const d = new PasteDetector(() => undefined, { documentTarget: {} as Document })
    assert.equal(d.isExternal('x'.repeat(MIN_PASTE_CHARS - 1)), false)
    assert.equal(d.isExternal(LONG), true)
    d.rememberCopy(LONG + '\r\n  ')
    assert.equal(d.isExternal(LONG), false)
    assert.equal(d.isExternal('int sum(int a, int b) { return'), false)
    assert.equal(d.isExternal('완전히 다른 곳에서 가져온 아주 긴 문장입니다 이것은'), true)
  })

  it('copy 이벤트의 선택 글을 기억하고, 바깥 글을 붙이면 글자 수·줄 수·위치만 알린다', () => {
    const doc = new FakeDoc()
    let selected = LONG
    const win = { getSelection: () => ({ toString: () => selected }) } as unknown as Window
    const seen: { chars: number; lines: number; target: string }[] = []
    const d = new PasteDetector((p) => seen.push(p), { documentTarget: doc as unknown as Document, windowTarget: win })
    d.start()

    doc.fire('copy')
    doc.fire('paste', pasteEvent(LONG))
    assert.equal(seen.length, 0) // 안에서 복사한 것

    selected = ''
    const outside = '첫 줄은 바깥에서 가져왔습니다\n둘째 줄도 바깥에서 가져왔습니다'
    doc.fire('paste', pasteEvent(outside, { tagName: 'TEXTAREA', id: 'chat-input', closest: (q: string) => (q === '#chat-input' ? {} : null) }))
    assert.equal(seen.length, 1)
    assert.equal(seen[0].lines, 2)
    assert.equal(seen[0].chars, normalize(outside).length)
    assert.equal(seen[0].target, 'chat')

    d.stop()
    doc.fire('paste', pasteEvent(outside))
    assert.equal(seen.length, 1)
  })

  it('브라우저 이벤트는 source=BROWSER, 서버 시각 보정, 사진 없이 보낸다', () => {
    const v = toBrowserViolation('PASTE', '2026-12-01T06:00:00.000Z', 1500, { chars: 120 })
    const req = toRequest(v)
    assert.equal(req.type, 'PASTE')
    assert.equal(req.source, 'BROWSER')
    assert.equal(req.startedAt, '2026-12-01T06:00:01.500Z')
    assert.equal(req.snapshot, undefined)
    assert.deepEqual(req.detail, { chars: 120 })
  })
})
