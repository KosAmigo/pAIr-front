import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  addAttachment, attachCost, attachLabel, decodeDrop, defaultPages, encodeDrag, removeAttachment, sendable, setPages, validPages,
} from '../src/lib/chatAttach.ts'

const file = (path) => ({ source: 'ATTEMPT_FILE', path })
const pdf = (path, pages) => ({ source: 'TASK_FILE', path, pages })

test('a drag value round-trips and anything else is ignored', () => {
  assert.deepEqual(decodeDrop(encodeDrag(file('src/A.java'))), file('src/A.java'))
  assert.deepEqual(decodeDrop(encodeDrag(pdf('자료/표.pdf', '1-2'))), pdf('자료/표.pdf', '1-2'))
  assert.equal(decodeDrop('not json'), null)
  assert.equal(decodeDrop(JSON.stringify({ source: 'OTHER', path: 'x' })), null)
  assert.equal(decodeDrop(JSON.stringify({ source: 'ATTEMPT_FILE' })), null)
  assert.equal(decodeDrop(JSON.stringify({ source: 'ATTEMPT_FILE', path: '' })), null)
})

test('five files at most, and the same file only once', () => {
  let list = []
  for (const p of ['a', 'b', 'c', 'd', 'e']) {
    const r = addAttachment(list, file(p))
    assert.equal(r.ok, true)
    list = r.list
  }
  const full = addAttachment(list, file('f'))
  assert.equal(full.ok, false)
  assert.equal(full.reason, 'full')
  const dup = addAttachment(list.slice(0, 2), file('a'))
  assert.equal(dup.ok, false)
  assert.equal(dup.reason, 'duplicate')
  // a PDF with another page range is still the same file: change the range on the chip instead
  assert.equal(addAttachment([pdf('자료/표.pdf', '1')], pdf('자료/표.pdf', '2')).ok, false)
})

test('removing and editing pages affect only the matching chip', () => {
  const list = [file('a'), pdf('자료/표.pdf', '1-2')]
  assert.deepEqual(removeAttachment(list, file('a')), [pdf('자료/표.pdf', '1-2')])
  assert.deepEqual(setPages(list, '자료/표.pdf', '3'), [file('a'), pdf('자료/표.pdf', '3')])
})

test('page ranges follow the server rule: "1,3-4" style, at most 20 pages', () => {
  assert.equal(validPages('1'), true)
  assert.equal(validPages('1,3-4'), true)
  assert.equal(validPages(' 2 - 3 '), false)
  assert.equal(validPages('1-20'), true)
  assert.equal(validPages('1-21'), false)
  assert.equal(validPages('1-10,15-25'), false)
  assert.equal(validPages('0'), false)
  assert.equal(validPages('3-1'), false)
  assert.equal(validPages(''), false)
  assert.equal(validPages(undefined), false)
  assert.equal(validPages('a'), false)
})

test('the default range covers the whole PDF up to 20 pages', () => {
  assert.equal(defaultPages(undefined), '1')
  assert.equal(defaultPages(1), '1')
  assert.equal(defaultPages(4), '1-4')
  assert.equal(defaultPages(25), '1-20')
})

test('a message with a PDF chip cannot be sent until its range is valid', () => {
  assert.equal(sendable([file('a')]), true)
  assert.equal(sendable([file('a'), pdf('자료/표.pdf', '1-2')]), true)
  assert.equal(sendable([pdf('자료/표.pdf', '')]), false)
  assert.equal(sendable([pdf('자료/표.pdf', '1-30')]), false)
})

test('each new attachment adds 5 credits and chips show a short label', () => {
  assert.equal(attachCost([]), 0)
  assert.equal(attachCost([file('a'), file('b'), pdf('자료/표.pdf', '1')]), 15)
  assert.equal(attachLabel(file('src/shop/OrderService.java')), 'OrderService.java')
  assert.equal(attachLabel(pdf('자료/요금 안내.pdf', '1-2')), '요금 안내.pdf 1-2쪽')
})
