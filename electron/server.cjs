const { WebSocketServer, WebSocket } = require('ws')
const { randomInt, randomBytes, timingSafeEqual } = require('node:crypto')
const { createMotion } = require('./motion.cjs')
const { createDiagnostics } = require('./diagnostics.cjs')
const { KEY_CODES, BUTTONS } = require('./input.cjs')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

function equal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const left = Buffer.from(a), right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}
function createServer({ port, input, getSettings, getDevices, saveDevices, onChange = () => {}, onConnect = () => {}, onDisconnect = () => {}, webRoot = path.join(__dirname, '../phone-web') }) {
  let code, codeExpires, active = null, mouseEnded = true
  const failures = new Map()
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' }
  const httpServer = http.createServer((request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return }
    let pathname
    try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname) } catch { response.writeHead(400); response.end(); return }
    if (pathname.includes('\0')) { response.writeHead(400); response.end(); return }
    const file = path.resolve(webRoot, '.' + (pathname === '/' ? '/index.html' : pathname))
    if (!file.startsWith(path.resolve(webRoot) + path.sep)) { response.writeHead(403); response.end(); return }
    fs.readFile(file, (error, data) => {
      response.writeHead(error ? 404 : 200, { 'Content-Type': error ? 'text/plain; charset=utf-8' : mime[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' })
      response.end(request.method === 'HEAD' ? undefined : error ? '网页资源未找到，请使用手机 App 或先构建手机网页。' : data)
    })
  })
  const server = new WebSocketServer({ server: httpServer, maxPayload: 16384, perMessageDeflate: false })
  const send = (socket, message) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)) }
  let mouseStats = { count: 0, first: 0, last: 0, maxGap: 0, inputMax: 0 }, statsDevice = null
  const diagnostic = createDiagnostics()
  let loopLast = performance.now()
  const loopTimer = setInterval(() => {
    const now = performance.now()
    if (!mouseEnded) diagnostic.loop(Math.max(0, now - loopLast - 20))
    loopLast = now
  }, 20)
  loopTimer.unref()
  const motion = createMotion({
    move: (dx, dy) => {
      const started = performance.now()
      diagnostic.execute(started)
      input.move(dx, dy)
      mouseStats.inputMax = Math.max(mouseStats.inputMax, performance.now() - started)
    },
    onError: error => { input.releaseAll(); if (active) send(active, { type: 'error', message: error.message }) }
  })
  function rotateCode() { code = String(randomInt(100000, 1000000)); codeExpires = Date.now() + 5 * 60_000; onChange() }
  function disconnect(socket) {
    if (active === socket) { motion.clear(); input.releaseAll(); mouseEnded = true; active = null; onChange(); onDisconnect() }
  }
  function revoke(id) {
    saveDevices(getDevices().filter(device => device.id !== id))
    if (active?.deviceId === id) { const socket = active; disconnect(socket); socket.close(4003, 'Device revoked') }
    onChange()
  }
  server.on('connection', (socket, request) => {
    const address = request.socket.remoteAddress
    socket.isAlive = true
    socket.authenticated = false
    socket.lastInput = Date.now()
    let count = 0, windowStart = Date.now()
    const authTimeout = setTimeout(() => socket.close(4001, 'Authentication timeout'), 15_000)
    socket.on('pong', () => { socket.isAlive = true })
    socket.on('error', () => disconnect(socket))
    socket.on('close', () => { clearTimeout(authTimeout); disconnect(socket) })
    socket.on('message', raw => {
      if (Date.now() - windowStart >= 1000) { count = 0; windowStart = Date.now() }
      if (++count > 500) { disconnect(socket); socket.close(4008, 'Too many messages'); return }
      let message
      try { message = JSON.parse(raw.toString()) } catch { send(socket, { type: 'error', message: '消息格式错误' }); return }
      if (!message || typeof message !== 'object') return
      if (message.type === 'ping') {
        socket.isAlive = true
        if (active === socket) motion.flush()
        send(socket, { type: 'pong', ...(typeof message.sentAt === 'number' && Number.isFinite(message.sentAt) ? { sentAt: message.sentAt, ...(active === socket ? { motion: { count: mouseStats.count, maxGap: mouseStats.maxGap, averageGap: mouseStats.count > 1 ? (mouseStats.last - mouseStats.first) / (mouseStats.count - 1) : 0, inputMax: mouseStats.inputMax, trace: diagnostic.snapshot() } } : {}) } : {}) }); return
      }
      if (!socket.authenticated) {
        if (message.type !== 'auth') return
        const now = Date.now()
        const failure = failures.get(address)
        if (failure?.until > now && failure.count >= 5) { send(socket, { type: 'auth_fail', message: '尝试过多，请一分钟后重试' }); return }
        let device = getDevices().find(item => equal(item.token, message.token))
        if (active && !(message.takeover === true && device && device.id === active.deviceId)) { send(socket, { type: 'auth_fail', message: '电脑已有手机连接' }); return }
        if (!device && now < codeExpires && equal(code, message.code)) {
          device = { id: randomBytes(12).toString('hex'), token: randomBytes(32).toString('hex'), name: String(message.name || '手机').slice(0, 40), createdAt: now }
          saveDevices([...getDevices(), device].slice(-20))
        }
        if (!device) {
          const count = failure?.until > now ? failure.count + 1 : 1
          if (failures.size > 256) failures.clear()
          failures.set(address, { count, until: now + 60_000 })
          send(socket, { type: 'auth_fail', message: '配对码已过期或凭证无效，请重新配对' }); return
        }
        clearTimeout(authTimeout)
        failures.delete(address)
        socket.authenticated = true; socket.deviceId = device.id; socket.deviceName = device.name
        const previous = active
        active = socket; mouseEnded = true
        if (previous) { motion.clear(); input.releaseAll(); previous.close(4000, 'Transport switched') }
        if (statsDevice !== device.id) {
          diagnostic.reset()
          mouseStats = { count: 0, first: 0, last: 0, maxGap: 0, inputMax: 0 }
        }
        statsDevice = device.id
        send(socket, { type: 'auth_ok', token: device.token, deviceId: device.id, name: require('node:os').hostname(), protocol: 1 })
        rotateCode(); onConnect(); onChange()
        return
      }
      if (active !== socket) return
      const settings = getSettings()
      const finite = value => typeof value === 'number' && Number.isFinite(value)
      const bound = (value, max) => Math.max(-max, Math.min(max, value))
      try {
        socket.lastInput = Date.now()
        if (message.type !== 'mouse_move') motion.flush()
        switch (message.type) {
          case 'mouse_move':
            if (finite(message.dx) && finite(message.dy)) {
              const now = performance.now()
              if (mouseEnded || !mouseStats.count) {
                mouseStats = { count: 0, first: now, last: now, maxGap: 0, inputMax: 0 }
                diagnostic.reset(); loopLast = now
              }
              diagnostic.receive(message.trace, now)
              if (mouseStats.count) mouseStats.maxGap = Math.max(mouseStats.maxGap, now - mouseStats.last)
              mouseStats.count++; mouseStats.last = now; mouseEnded = false
              motion.add(bound(message.dx, 2000) * settings.sensitivity, bound(message.dy, 2000) * settings.sensitivity)
            }
            break
          case 'mouse_flush': diagnostic.loop(Math.max(0, performance.now() - loopLast - 20)); mouseEnded = true; break
          case 'mouse_button':
            if (Object.hasOwn(BUTTONS, message.button) && ['down', 'up', 'click'].includes(message.action)) {
              if (message.action !== 'up') input.button(message.button, true)
              if (message.action !== 'down') input.button(message.button, false)
            }
            break
          case 'mouse_scroll':
            if (finite(message.delta)) input.scroll(bound(message.delta, 1200) * settings.scrollSpeed * (settings.reverseScroll ? -1 : 1))
            break
          case 'key':
            if (Object.hasOwn(KEY_CODES, message.code) && ['down', 'up', 'press'].includes(message.action)) {
              if (message.action !== 'up') input.key(message.code, true)
              if (message.action !== 'down') input.key(message.code, false)
            }
            break
          case 'combo':
            if (Array.isArray(message.keys) && message.keys.length > 0 && message.keys.length <= 8 && message.keys.every(key => Object.hasOwn(KEY_CODES, key))) {
              try { for (const key of message.keys) input.key(key, true) }
              finally { for (const key of [...message.keys].reverse()) input.key(key, false) }
            }
            break
          case 'text': if (typeof message.text === 'string' && message.text.length <= 1000) input.text(message.text); break
          case 'release_all': if (!mouseEnded) diagnostic.loop(Math.max(0, performance.now() - loopLast - 20)); mouseEnded = true; input.releaseAll(); break
        }
      } catch (error) { input.releaseAll(); send(socket, { type: 'error', message: error.message }) }
    })
  })
  const timer = setInterval(() => {
    if (Date.now() >= codeExpires) rotateCode()
    for (const socket of server.clients) {
      if (!socket.isAlive) { disconnect(socket); socket.terminate(); continue }
      socket.isAlive = false; socket.ping()
      if (socket === active && Date.now() - socket.lastInput > 10_000) input.releaseAll()
    }
  }, 5000)
  rotateCode()
  httpServer.listen(port, '0.0.0.0')
  return {
    server, rotateCode, revoke,
    state: () => ({ code, codeExpires, connected: !!active, clientName: active?.deviceName || '' }),
    close: () => new Promise(resolve => {
      clearInterval(timer); clearInterval(loopTimer); motion.clear(); input.releaseAll()
      for (const socket of server.clients) socket.terminate()
      server.close(() => httpServer.close(resolve))
    })
  }
}
module.exports = { createServer }
