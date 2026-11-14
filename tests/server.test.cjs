const { test } = require('node:test')
const assert = require('node:assert/strict')
const { once } = require('node:events')
const { WebSocket } = require('ws')
const { createServer } = require('../electron/server.cjs')

async function fixture(t) {
  const calls = []
  const input = Object.fromEntries(['move', 'button', 'scroll', 'key', 'text', 'releaseAll'].map(name => [name, (...args) => calls.push([name, ...args])]))
  let devices = []
  const settings = { sensitivity: 1, scrollSpeed: 1, reverseScroll: false }
  const host = createServer({ port: 0, input, getSettings: () => settings, getDevices: () => devices, saveDevices: value => { devices = value } })
  await once(host.server, 'listening')
  t.after(() => host.close())
  const connect = async () => {
    const socket = new WebSocket(`ws://127.0.0.1:${host.server.address().port}`)
    await once(socket, 'open')
    const queue = [], waiting = []
    socket.on('message', raw => { const value = JSON.parse(raw); if (waiting.length) waiting.shift()(value); else queue.push(value) })
    return {
      socket,
      send: value => socket.send(JSON.stringify(value)),
      receive: () => queue.length ? Promise.resolve(queue.shift()) : new Promise(resolve => waiting.push(resolve))
    }
  }
  const sync = async client => { client.send({ type: 'ping' }); assert.equal((await client.receive()).type, 'pong') }
  const auth = async client => { client.send({ type: 'auth', code: host.state().code, name: 'Test phone' }); const response = await client.receive(); assert.equal(response.type, 'auth_ok'); return response }
  return { host, calls, connect, sync, auth, settings, devices: () => devices }
}
test('unauthenticated input is ignored and invalid pairing fails', { timeout: 5000 }, async t => {
  const f = await fixture(t), client = await f.connect()
  client.send({ type: 'mouse_move', dx: 30, dy: 40 }); await f.sync(client)
  assert.deepEqual(f.calls, [])
  client.send({ type: 'auth', code: 'invalid' }); assert.equal((await client.receive()).type, 'auth_fail')
})

test('heartbeat echoes client timestamp for round-trip diagnostics', { timeout: 5000 }, async t => {
  const f = await fixture(t), client = await f.connect(); await f.auth(client)
  client.send({ type: 'ping', sentAt: 123456 })
  const response = await client.receive()
  assert.equal(response.type, 'pong'); assert.equal(response.sentAt, 123456); assert.equal(response.motion.count, 0)
  client.send({ type: 'ping' })
  assert.deepEqual(await client.receive(), { type: 'pong' })
})
test('movement diagnostics follow gesture sequence and retain the finished gesture', { timeout: 5000 }, async t => {
  const f = await fixture(t), client = await f.connect(); await f.auth(client)
  client.send({ type: 'mouse_move', dx: 4, dy: 2, trace: { gesture: 7, seq: 1, sentAt: 1000 } })
  client.send({ type: 'mouse_move', dx: 6, dy: 3, trace: { gesture: 7, seq: 2, sentAt: 1017 } })
  client.send({ type: 'mouse_flush' })
  client.send({ type: 'release_all' })
  client.send({ type: 'ping', sentAt: 2000 })
  const { motion } = await client.receive()
  assert.equal(motion.trace.gesture, 7)
  assert.equal(motion.trace.received.count, 2)
  assert.equal(motion.trace.sent.maxGap, 17)
  assert.equal(motion.trace.sequenceErrors, 0)
  assert.ok(motion.trace.executed.count >= 2)
  assert.equal(f.calls.filter(call => call[0] === 'move').reduce((sum, call) => sum + call[1], 0), 10)
  client.send({ type: 'mouse_move', dx: 1, dy: 0, trace: { gesture: 8, seq: 1, sentAt: 5000 } })
  client.send({ type: 'mouse_flush' })
  client.send({ type: 'ping', sentAt: 6000 })
  const next = (await client.receive()).motion.trace
  assert.equal(next.gesture, 8)
  assert.equal(next.received.count, 1)
  assert.equal(next.received.maxGap, 0)
})

test('pairing creates a token, supports reconnect and releases held input', { timeout: 5000 }, async t => {
  const f = await fixture(t), first = await f.connect(), response = await f.auth(first)
  assert.equal(response.token.length, 64); assert.equal(f.devices().length, 1)
  first.send({ type: 'key', code: 'Control', action: 'down' }); await f.sync(first)
  const closed = once([...f.host.server.clients][0], 'close')
  first.socket.close(); await closed
  const next = await f.connect()
  next.send({ type: 'auth', token: response.token }); assert.equal((await next.receive()).type, 'auth_ok')
  assert.ok(f.calls.some(call => call[0] === 'releaseAll'))
  f.host.revoke(response.deviceId)
  await once(next.socket, 'close')
  assert.equal(f.devices().length, 0)
  const revoked = await f.connect(); revoked.send({ type: 'auth', token: response.token }); assert.equal((await revoked.receive()).type, 'auth_fail')
})
test('input routing validates keys, handles text, modifiers and sensitivity', { timeout: 5000 }, async t => {
  const f = await fixture(t), client = await f.connect(); await f.auth(client)
  f.settings.sensitivity = 2
  client.send({ type: 'mouse_move', dx: 5, dy: -3, sensitivity: 0.5 })
  client.send({ type: 'mouse_scroll', delta: 120, reverse: true })
  client.send({ type: 'mouse_button', button: 'left', action: 'click' })
  client.send({ type: 'combo', keys: ['Control', 'KeyC'] })
  client.send({ type: 'text', text: '你好👋' })
  client.send({ type: 'key', code: 'constructor', action: 'down' })
  client.send({ type: 'key', code: '__proto__', action: 'down' })
  client.send({ type: 'mouse_move', dx: 'bad', dy: 1 })
  await f.sync(client)
  assert.deepEqual(f.calls, [['move', 5, -3], ['move', 5, -3], ['scroll', 120], ['button', 'left', true], ['button', 'left', false], ['key', 'Control', true], ['key', 'KeyC', true], ['key', 'KeyC', false], ['key', 'Control', false], ['text', '你好👋']])
})
test('only the paired device can switch transports and its finished diagnostics survive the switch', { timeout: 5000 }, async t => {
  const f = await fixture(t), first = await f.connect(), auth = await f.auth(first)
  first.send({ type: 'mouse_move', dx: 10, dy: 0, trace: { gesture: 42, seq: 1, sentAt: 100 } })
  first.send({ type: 'mouse_flush' }); await f.sync(first)
  const denied = await f.connect()
  denied.send({ type: 'auth', code: f.host.state().code, takeover: true })
  assert.equal((await denied.receive()).type, 'auth_fail')
  const next = await f.connect()
  const closed = once(first.socket, 'close')
  next.send({ type: 'auth', token: auth.token, takeover: true })
  assert.equal((await next.receive()).type, 'auth_ok')
  assert.equal((await closed)[0], 4000)
  assert.equal(f.host.state().connected, true)
  next.send({ type: 'ping', sentAt: 200 })
  assert.equal((await next.receive()).motion.trace.gesture, 42)
  next.send({ type: 'mouse_button', button: 'left', action: 'down' })
  next.send({ type: 'mouse_move', dx: 3, dy: 0, trace: { gesture: 43, seq: 1, sentAt: 300 } })
  next.send({ type: 'mouse_flush' })
  next.send({ type: 'mouse_button', button: 'left', action: 'up' })
  await f.sync(next)
  const down = f.calls.findIndex(call => call[0] === 'button' && call[2] === true)
  const up = f.calls.findIndex(call => call[0] === 'button' && call[2] === false)
  assert.ok(f.calls.slice(down + 1, up).some(call => call[0] === 'move'))
  assert.ok(f.calls.some(call => call[0] === 'releaseAll'))
})

test('second phone is rejected and failed auth attempts are limited', { timeout: 5000 }, async t => {
  const f = await fixture(t), first = await f.connect(); await f.auth(first)
  const second = await f.connect(); second.send({ type: 'auth', code: f.host.state().code }); assert.match((await second.receive()).message, /已有手机/)
  const closed = once([...f.host.server.clients][0], 'close')
  first.socket.close(); await closed
  for (let i = 0; i < 6; i++) {
    second.send({ type: 'auth', code: 'bad' })
    const response = await second.receive()
    assert.equal(response.type, 'auth_fail')
    if (i === 5) assert.match(response.message, /尝试过多/)
  }
})
test('HTTP rejects malformed paths without exposing files outside phone resources', { timeout: 5000 }, async t => {
  const f = await fixture(t)
  const base = `http://127.0.0.1:${f.host.server.address().port}`
  assert.equal((await fetch(base + '/%00')).status, 400)
  assert.equal((await fetch(base + '/%2e%2e%5cpackage.json')).status, 403)
  assert.equal((await fetch(base, { method: 'POST' })).status, 405)
  const client = await f.connect(); await f.auth(client)
})
