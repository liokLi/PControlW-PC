const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createMotion } = require('../electron/motion.cjs')
function fixture(move) {
  const calls = [], timers = new Map(); let id = 0
  const errors = []
  const motion = createMotion({ move: move || ((x, y) => calls.push([x, y])), onError: error => errors.push(error), schedule: (callback, delay) => { assert.equal(delay, 8); timers.set(++id, callback); return id }, cancel: id => timers.delete(id) })
  return { motion, calls, timers, errors, tick() { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(callback => callback()) } }
}
test('first motion responds immediately and remaining displacement finishes on next tick', () => {
  const f = fixture(); f.motion.add(12, -6)
  assert.deepEqual(f.calls, [[6, -3]]); assert.equal(f.timers.size, 1)
  f.tick(); assert.deepEqual(f.calls, [[6, -3], [6, -3]]); assert.equal(f.timers.size, 0)
})
test('bursts merge without dropping distance; flush preserves ordering before a click', () => {
  const f = fixture(); f.motion.add(10, 4); f.motion.add(8, -2); f.motion.add(-3, 6)
  assert.equal(f.timers.size, 1); f.tick(); f.motion.flush(); f.calls.push(['click'])
  const moves = f.calls.slice(0, -1)
  assert.equal(moves.reduce((sum, item) => sum + item[0], 0), 15)
  assert.equal(moves.reduce((sum, item) => sum + item[1], 0), 8)
  assert.equal(f.timers.size, 0); assert.deepEqual(f.calls.at(-1), ['click'])
})
test('disconnect cancels pending motion and input errors do not escape timer callbacks', () => {
  const f = fixture(); f.motion.add(10, 0); f.motion.clear(); f.tick()
  assert.deepEqual(f.calls, [[5, 0]]); assert.equal(f.timers.size, 0)
  let count = 0
  const failed = fixture(() => { if (++count === 2) throw new Error('input failed') })
  failed.motion.add(10, 0); assert.doesNotThrow(() => failed.tick())
  assert.equal(failed.errors.length, 1); assert.equal(failed.timers.size, 0)
})
