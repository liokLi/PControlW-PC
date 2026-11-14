const { spawn } = require('node:child_process')
const http = require('node:http')
const path = require('node:path')

const vite = spawn(process.execPath, [path.join(__dirname, '../node_modules/vite/bin/vite.js')], { stdio: 'inherit' })
let desktop
let stopped = false
function stop() {
  if (stopped) return
  stopped = true
  vite.kill()
  desktop?.kill()
}
function launch(attempt = 0) {
  const request = http.get('http://127.0.0.1:5173', response => {
    response.resume()
    desktop = spawn(require('electron'), ['.'], { stdio: 'inherit', env: { ...process.env, PCONTROL_DEV_URL: 'http://127.0.0.1:5173' } })
    desktop.on('exit', stop)
  })
  request.on('error', () => {
    if (attempt < 100 && !stopped) setTimeout(() => launch(attempt + 1), 200)
    else stop()
  })
}
vite.on('exit', stop)
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
launch()
