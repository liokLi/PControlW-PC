const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, Notification } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const QRCode = require('qrcode')
const { createInput } = require('./input.cjs')
const { createServer } = require('./server.cjs')

let window, tray, host, input, config, configPath
let quitting = false, saving = false, serviceError = ''
const defaults = { port: 19780, sensitivity: 1.8, scrollSpeed: 1, reverseScroll: false, keyboardLayout: 'qwerty', notifyDisconnect: true }
function persist() { fs.writeFileSync(configPath, JSON.stringify(config, null, 2), { mode: 0o600 }) }
function addresses() {
  return Object.values(os.networkInterfaces()).flat().filter(item => item.family === 'IPv4' && !item.internal).map(item => item.address)
}
function snapshot() {
  return { ...host?.state(), addresses: addresses(), port: config.settings.port, settings: config.settings,
    devices: config.devices.map(({ id, name, createdAt }) => ({ id, name, createdAt })), hostname: os.hostname(), error: serviceError }
}
function publish() {
  if (window && !window.isDestroyed()) window.webContents.send('state', snapshot())
  if (tray) {
    tray.setToolTip(`手机控制电脑 · ${host?.state().connected ? '已连接' : '等待连接'}`)
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: host?.state().connected ? `已连接：${host.state().clientName}` : '等待手机连接', enabled: false },
      { type: 'separator' }, { label: '打开设置', click: () => window.show() },
      { label: '退出', click: () => app.quit() }
    ]))
  }
}
async function startServer() {
  const candidate = createServer({
    port: config.settings.port, input, getSettings: () => config.settings,
    getDevices: () => config.devices,
    saveDevices: devices => { config.devices = devices; persist() },
    onChange: publish,
    onDisconnect: () => {
      if (!quitting && config.settings.notifyDisconnect && Notification.isSupported()) new Notification({ title: '手机控制电脑', body: '手机已断开连接' }).show()
    }
  })
  try {
    await new Promise((resolve, reject) => { candidate.server.once('listening', resolve); candidate.server.once('error', reject) })
    host = candidate; serviceError = ''
    candidate.server.on('error', error => { serviceError = error.message; publish() })
  } catch (error) { await candidate.close(); throw error }
  publish()
}
function registerHandlers() {
  function handle(channel, callback) {
    ipcMain.handle(channel, (event, ...args) => {
      if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('无效来源')
      return callback(...args)
    })
  }
  handle('get-state', snapshot)
  handle('get-qr', async address => {
    if (!addresses().includes(address) || !host) return ''
    return QRCode.toDataURL(`http://${address}:${config.settings.port}/#/?app=PControlW&version=1&host=${address}&port=${config.settings.port}&code=${host.state().code}`, { width: 256, margin: 2 })
  })
  handle('rotate-code', () => { host?.rotateCode(); return snapshot() })
  handle('revoke-device', id => { host?.revoke(id); return snapshot() })
  handle('save-settings', async values => {
    if (saving) throw new Error('设置正在保存')
    const port = Number(values.port), sensitivity = Number(values.sensitivity), scrollSpeed = Number(values.scrollSpeed)
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('端口范围为 1024–65535')
    if (![sensitivity, scrollSpeed].every(value => Number.isFinite(value) && value >= 0.2 && value <= 4)) throw new Error('速度范围为 0.2–4')
    saving = true
    const previous = config.settings
    try {
      config.settings = { port, sensitivity, scrollSpeed, reverseScroll: !!values.reverseScroll, keyboardLayout: 'qwerty', notifyDisconnect: !!values.notifyDisconnect }
      if (!host || port !== previous.port) {
        await host?.close(); host = null
        try { await startServer() } catch (error) {
          config.settings = previous
          try { await startServer() } catch (rollback) { serviceError = rollback.message }
          throw new Error(`端口无法启用：${error.message}`)
        }
      }
      persist(); publish(); return snapshot()
    } finally { saving = false }
  })
  handle('hide-window', () => window.hide())
}

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => { window?.show(); window?.focus() })
  app.whenReady().then(async () => {
    app.setAppUserModelId('com.pcontrolw.desktop')
    configPath = path.join(app.getPath('userData'), 'config.json')
    try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')) } catch { config = {} }
    config = { settings: { ...defaults, ...config.settings }, devices: Array.isArray(config.devices) ? config.devices : [] }
    persist()
    window = new BrowserWindow({ width: 1080, height: 760, minWidth: 900, minHeight: 680, icon: path.join(__dirname, 'app.ico'), backgroundColor: '#10151e', autoHideMenuBar: true,
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } })
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', event => event.preventDefault())
    window.on('close', event => { if (!quitting) { event.preventDefault(); window.hide() } })
    const icon = nativeImage.createFromPath(path.join(__dirname, 'tray.png'))
    tray = new Tray(icon)
    tray.on('double-click', () => window.show())
    registerHandlers()
    try { input = createInput(); await startServer() } catch (error) { serviceError = error.message; publish() }
    if (process.env.PCONTROL_DEV_URL) await window.loadURL(process.env.PCONTROL_DEV_URL)
    else await window.loadFile(path.join(__dirname, '../dist/index.html'))
    publish()
  })
  app.on('window-all-closed', () => {})
  app.on('before-quit', () => { quitting = true; input?.releaseAll(); host?.close(); tray?.destroy() })
}
