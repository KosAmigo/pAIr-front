import assert from 'node:assert/strict'
import { test } from 'node:test'
import { completionInsert, completionType, inCommentOrString, isJavaSource, JAVA_KEYWORDS, javaSources, marksFor, posOf, shouldAskCompletion } from '../src/lib/liveDiagnostics.ts'

const d = (file, line, severity = 'error') => ({ file, line, column: 3, severity, message: `m${line}` })

test('only .java files under src/ or test/ are sent for analysis', () => {
  assert.equal(isJavaSource('src/app/A.java'), true)
  assert.equal(isJavaSource('test/app/ATest.java'), true)
  assert.equal(isJavaSource('README.md'), false)
  assert.equal(isJavaSource('docs/A.java'), false)
  assert.equal(isJavaSource('src/data.csv'), false)
  assert.deepEqual(javaSources({ 'src/A.java': 'a', 'README.md': 'r', 'test/T.java': 't' }), { 'src/A.java': 'a', 'test/T.java': 't' })
})

test('marks come from live results when present, otherwise from the last build', () => {
  const live = [d('src/A.java', 1), d('src/B.java', 2)]
  const built = [d('src/A.java', 9)]
  assert.deepEqual(marksFor('src/A.java', live, built).map((m) => m.line), [1])
  assert.deepEqual(marksFor('src/A.java', null, built).map((m) => m.line), [9])
  assert.deepEqual(marksFor('src/A.java', null, undefined), [])
  // 실시간 결과가 "오류 없음"(빈 배열)이면 낡은 빌드 오류를 다시 보여 주지 않는다
  assert.deepEqual(marksFor('src/A.java', [], built), [])
  assert.deepEqual(marksFor(null, live, built), [])
})

test('picking a method inserts the call and parks the cursor inside the parentheses only when it takes arguments', () => {
  assert.deepEqual(completionInsert({ name: 'size', kind: 'method', signature: '() : int', hasParams: false }), { text: 'size()', cursor: 6 })
  assert.deepEqual(completionInsert({ name: 'add', kind: 'method', signature: '(E e) : boolean', hasParams: true }), { text: 'add()', cursor: 4 })
  assert.deepEqual(completionInsert({ name: 'name', kind: 'field', signature: ': String', hasParams: false }), { text: 'name', cursor: 4 })
})

test('a line and column from the server map to a document position, clamped to the document', () => {
  // "ab\ncde\n\nf" : 줄 시작 0, 3, 7, 8 / 전체 길이 9
  const starts = [0, 3, 7, 8]
  assert.equal(posOf(starts, 9, 1, 1), 0)
  assert.equal(posOf(starts, 9, 2, 3), 5)
  assert.equal(posOf(starts, 9, 2, 99), 6) // 줄 끝을 넘으면 줄 끝
  assert.equal(posOf(starts, 9, 99, 1), 8) // 마지막 줄로
  assert.equal(posOf(starts, 9, 0, 0), 0)
})

test('completion is asked after a dot or once a name letter is typed, never for number literals', () => {
  assert.equal(shouldAskCompletion('', '.', false), true) // "inventory."
  assert.equal(shouldAskCompletion('lo', '.', false), true) // "inventory.lo"
  assert.equal(shouldAskCompletion('to', ' ', false), true) // 이름 글자를 친 자리
  assert.equal(shouldAskCompletion('', ' ', false), false) // 글자도 점도 없으면 묻지 않는다
  assert.equal(shouldAskCompletion('', ' ', true), true) // Ctrl+Space 로 직접 연 경우
  assert.equal(shouldAskCompletion('12', ' ', false), false)
  assert.equal(shouldAskCompletion('1a', '.', true), false)
})

test('variables and classes are inserted by name, and fields get a property icon', () => {
  assert.deepEqual(completionInsert({ name: 'total', kind: 'variable', signature: ': int', hasParams: false }), { text: 'total', cursor: 5 })
  assert.deepEqual(completionInsert({ name: 'Basket', kind: 'class', signature: ': app.Basket', hasParams: false }), { text: 'Basket', cursor: 6 })
  assert.equal(completionType('field'), 'property')
  assert.equal(completionType('method'), 'method')
  assert.equal(completionType('variable'), 'variable')
})

test('keywords cover the basics once each, and are not offered inside comments or strings', () => {
  for (const k of ['for', 'if', 'return', 'public', 'static', 'class', 'new', 'null', 'true', 'try', 'catch']) assert.ok(JAVA_KEYWORDS.includes(k), k)
  assert.equal(new Set(JAVA_KEYWORDS).size, JAVA_KEYWORDS.length)
  assert.ok(JAVA_KEYWORDS.every((k) => /^[a-z]+$/.test(k)))
  for (const n of ['LineComment', 'BlockComment', 'StringLiteral', 'TextBlock', 'CharacterLiteral']) assert.equal(inCommentOrString(n), true, n)
  for (const n of ['Block', 'MethodDeclaration', 'Identifier', 'Program']) assert.equal(inCommentOrString(n), false, n)
})
