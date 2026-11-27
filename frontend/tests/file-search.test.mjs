import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MAX_HITS, searchFiles } from '../src/lib/fileSearch.ts'

const paths = ['src/OrderService.java', 'src/Main.java']
const contents = { 'src/Main.java': 'class Main {\r\n  OrderService order;\r\n}' }

test('파일 이름 결과가 먼저, 내용 결과는 줄·열(1부터)을 담는다', () => {
  assert.deepEqual(searchFiles(paths, contents, 'orderservice'), [
    { path: 'src/OrderService.java' },
    { path: 'src/Main.java', line: 2, column: 3, text: 'OrderService order;' },
  ])
})

test('빈 검색어는 결과가 없고, 결과 수는 제한된다', () => {
  assert.deepEqual(searchFiles(paths, contents, '  '), [])
  assert.equal(searchFiles(paths, { 'src/Main.java': 'a\n'.repeat(500) }, 'a').length, MAX_HITS)
})
