const KEY_CODES = {
  Backspace: 8, Tab: 9, Enter: 13, Shift: 16, Control: 17, Alt: 18, Pause: 19,
  CapsLock: 20, Escape: 27, Space: 32, PageUp: 33, PageDown: 34, End: 35, Home: 36,
  ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Insert: 45, Delete: 46,
  Meta: 91, ContextMenu: 93, NumLock: 144, ScrollLock: 145,
  VolumeMute: 173, VolumeDown: 174, VolumeUp: 175, MediaNextTrack: 176,
  MediaPreviousTrack: 177, MediaStop: 178, MediaPlayPause: 179,
  Semicolon: 186, Equal: 187, Comma: 188, Minus: 189, Period: 190, Slash: 191,
  Backquote: 192, BracketLeft: 219, Backslash: 220, BracketRight: 221, Quote: 222
}
for (let i = 0; i < 26; i++) KEY_CODES[`Key${String.fromCharCode(65 + i)}`] = 65 + i
for (let i = 0; i < 10; i++) { KEY_CODES[`Digit${i}`] = 48 + i; KEY_CODES[`Numpad${i}`] = 96 + i }
for (let i = 1; i <= 12; i++) KEY_CODES[`F${i}`] = 111 + i
Object.assign(KEY_CODES, { NumpadMultiply: 106, NumpadAdd: 107, NumpadSubtract: 109, NumpadDecimal: 110, NumpadDivide: 111 })
const EXTENDED = new Set(['Meta', 'ContextMenu', 'Insert', 'Delete', 'Home', 'End', 'PageUp', 'PageDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'NumLock', 'NumpadDivide', 'VolumeMute', 'VolumeDown', 'VolumeUp', 'MediaNextTrack', 'MediaPreviousTrack', 'MediaStop', 'MediaPlayPause'])
const BUTTONS = { left: [2, 4], right: [8, 16], middle: [32, 64] }

function createInput() {
  const koffi = require('koffi')
  const user32 = koffi.load('user32.dll')
  const sendInput = user32.func('uint32_t __stdcall SendInput(uint32_t count, const void *inputs, int size)')
  const size = process.arch === 'ia32' ? 28 : 40
  const offset = process.arch === 'ia32' ? 4 : 8
  const heldKeys = new Set()
  const heldButtons = new Set()
  let fractionX = 0, fractionY = 0, fractionWheel = 0
  function send(type, fill) {
    const buffer = Buffer.alloc(size)
    buffer.writeUInt32LE(type, 0)
    fill(buffer, offset)
    if (sendInput(1, buffer, size) !== 1) throw new Error('Windows 拒绝输入，请检查目标窗口权限')
  }
  function mouse(flags, dx = 0, dy = 0, data = 0) {
    send(0, (buffer, o) => {
      buffer.writeInt32LE(dx, o); buffer.writeInt32LE(dy, o + 4)
      buffer.writeInt32LE(data, o + 8); buffer.writeUInt32LE(flags, o + 12)
    })
  }
  function key(code, down) {
    if (!Object.hasOwn(KEY_CODES, code)) throw new Error('不支持的按键')
    if (down) heldKeys.add(code)
    send(1, (buffer, o) => {
      buffer.writeUInt16LE(KEY_CODES[code], o)
      buffer.writeUInt32LE((down ? 0 : 2) | (EXTENDED.has(code) ? 1 : 0), o + 4)
    })
    if (!down) heldKeys.delete(code)
  }
  function button(name, down) {
    if (down) heldButtons.add(name)
    mouse(BUTTONS[name][down ? 0 : 1])
    if (!down) heldButtons.delete(name)
  }
  return {
    move(dx, dy) {
      fractionX += dx; fractionY += dy
      const x = Math.trunc(fractionX), y = Math.trunc(fractionY)
      fractionX -= x; fractionY -= y
      if (x || y) mouse(1, x, y)
    },
    button,
    scroll(delta) {
      fractionWheel += delta
      const amount = Math.trunc(fractionWheel)
      fractionWheel -= amount
      if (amount) mouse(0x0800, 0, 0, amount)
    },
    key,
    text(value) {
      for (let i = 0; i < value.length; i++) {
        for (const flags of [4, 6]) send(1, (buffer, o) => {
          buffer.writeUInt16LE(value.charCodeAt(i), o + 2); buffer.writeUInt32LE(flags, o + 4)
        })
      }
    },
    releaseAll() {
      for (const code of [...heldKeys]) { try { key(code, false) } catch {} }
      for (const name of [...heldButtons]) { try { button(name, false) } catch {} }
      fractionX = fractionY = fractionWheel = 0
    }
  }
}

module.exports = { createInput, KEY_CODES, BUTTONS }
