import assert from 'node:assert/strict'
import { test } from 'node:test'
import { BrowserEventDetector, isWindowSwitchKey } from '../src/anti-cheating/core/BrowserEventDetector.ts'
import { ViolationManager } from '../src/anti-cheating/core/ViolationManager.ts'
import { DEFAULT_ANTI_CHEATING_CONFIG } from '../src/anti-cheating/core/types.ts'

class FakeDocument extends EventTarget {
  documentElement = new EventTarget()
  visibilityState = 'visible'
  fullscreenElement = null
}
class FakeWindow extends EventTarget {}

function harness(config = DEFAULT_ANTI_CHEATING_CONFIG) {
  const documentTarget = new FakeDocument()
  const windowTarget = new FakeWindow()
  let incidents = []
  const manager = new ViolationManager('att-test', config, 0, (violation, isNew) => {
    incidents = isNew
      ? [...incidents, violation]
      : incidents.map((item) => (item.violationId === violation.violationId ? violation : item))
  })
  const detector = new BrowserEventDetector(
    (type) => manager.signal(type),
    (reason) => manager.resume(reason),
    config,
    { documentTarget, windowTarget },
  )
  detector.start()
  return { manager, detector, documentTarget, windowTarget, incidents: () => incidents }
}

test('mouse leaving through the top or bottom edge is ignored, left and right are counted', () => {
  const h = harness()
  h.windowTarget.innerHeight = 800
  const leave = (clientX, clientY) => {
    const e = new Event('mouseleave')
    Object.assign(e, { clientX, clientY, relatedTarget: null })
    h.documentTarget.documentElement.dispatchEvent(e)
  }
  leave(400, 0) // 위쪽
  leave(400, -3)
  leave(400, 800) // 아래쪽
  leave(400, 805)
  assert.equal(h.manager.count, 0)
  leave(0, 400) // 왼쪽
  assert.equal(h.manager.count, 1)
  h.manager.resume('pointer-return')
  leave(1200, 400) // 오른쪽
  assert.equal(h.manager.count, 2)
  h.detector.stop()
})

test('movement inside the exam page creates no warning', () => {
  const h = harness()
  h.documentTarget.documentElement.dispatchEvent(new Event('pointermove'))
  assert.equal(h.manager.count, 0)
  assert.equal(h.incidents().length, 0)
  h.detector.stop()
})

test('leaving the document emits MOUSE_LEAVE and return starts a new incident next time', () => {
  const h = harness()
  h.documentTarget.documentElement.dispatchEvent(new Event('mouseleave'))
  assert.equal(h.manager.count, 1)
  assert.equal(h.incidents()[0].signals[0].type, 'MOUSE_LEAVE')
  h.documentTarget.documentElement.dispatchEvent(new Event('mouseenter'))
  h.documentTarget.documentElement.dispatchEvent(new Event('mouseleave'))
  assert.equal(h.manager.count, 2)
  h.detector.stop()
})

test('tab hidden is recorded and visible return closes that incident', () => {
  const h = harness()
  h.documentTarget.visibilityState = 'hidden'
  h.documentTarget.dispatchEvent(new Event('visibilitychange'))
  assert.equal(h.incidents()[0].signals[0].type, 'TAB_HIDDEN')
  h.documentTarget.visibilityState = 'visible'
  h.documentTarget.dispatchEvent(new Event('visibilitychange'))
  h.documentTarget.visibilityState = 'hidden'
  h.documentTarget.dispatchEvent(new Event('visibilitychange'))
  assert.equal(h.manager.count, 2)
  h.detector.stop()
})

test('mouse leave, blur, and hidden signals merge until every return state recovers', () => {
  const h = harness()
  h.documentTarget.documentElement.dispatchEvent(new Event('mouseleave'))
  h.windowTarget.dispatchEvent(new Event('blur'))
  h.documentTarget.visibilityState = 'hidden'
  h.documentTarget.dispatchEvent(new Event('visibilitychange'))
  assert.equal(h.manager.count, 1)
  assert.deepEqual(h.incidents()[0].signals.map((signal) => signal.type), ['MOUSE_LEAVE', 'WINDOW_BLUR', 'TAB_HIDDEN'])

  h.windowTarget.dispatchEvent(new Event('focus'))
  h.documentTarget.visibilityState = 'visible'
  h.documentTarget.dispatchEvent(new Event('visibilitychange'))
  h.documentTarget.documentElement.dispatchEvent(new Event('mouseenter'))
  h.documentTarget.documentElement.dispatchEvent(new Event('mouseleave'))
  assert.equal(h.manager.count, 2)
  h.detector.stop()
})

test('fullscreen exit is detected only after fullscreen was entered', () => {
  const h = harness()
  h.documentTarget.fullscreenElement = {}
  h.documentTarget.dispatchEvent(new Event('fullscreenchange'))
  h.documentTarget.fullscreenElement = null
  h.documentTarget.dispatchEvent(new Event('fullscreenchange'))
  assert.equal(h.incidents()[0].signals[0].type, 'FULLSCREEN_EXIT')
  h.documentTarget.dispatchEvent(new Event('keydown'))
  h.documentTarget.fullscreenElement = {}
  h.documentTarget.dispatchEvent(new Event('fullscreenchange'))
  h.documentTarget.fullscreenElement = null
  h.documentTarget.dispatchEvent(new Event('fullscreenchange'))
  assert.equal(h.manager.count, 2)
  h.detector.stop()
})

test('disabled signal types are ignored and a finished manager ignores new events', () => {
  const config = {
    ...DEFAULT_ANTI_CHEATING_CONFIG,
    signals: { ...DEFAULT_ANTI_CHEATING_CONFIG.signals, MOUSE_LEAVE: false },
  }
  const h = harness(config)
  h.documentTarget.documentElement.dispatchEvent(new Event('mouseleave'))
  assert.equal(h.manager.count, 0)
  h.manager.finish()
  h.windowTarget.dispatchEvent(new Event('blur'))
  assert.equal(h.manager.count, 0)
  h.detector.stop()
})

test('window switch keys are recognised, ordinary typing is not', () => {
  const key = (k, mods = {}) => ({ key: k, altKey: false, ctrlKey: false, ...mods })
  assert.equal(isWindowSwitchKey(key('Tab', { altKey: true })), true)
  assert.equal(isWindowSwitchKey(key('Meta')), true)
  assert.equal(isWindowSwitchKey(key('Tab', { ctrlKey: true })), true)
  assert.equal(isWindowSwitchKey(key('W', { ctrlKey: true })), true)
  assert.equal(isWindowSwitchKey(key('Tab')), false)
  assert.equal(isWindowSwitchKey(key('a')), false)
  assert.equal(isWindowSwitchKey(key('w')), false)
})
