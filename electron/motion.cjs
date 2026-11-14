function createMotion({ move, onError = () => {}, schedule = setTimeout, cancel = clearTimeout }) {
  let dx = 0, dy = 0, ticks = 0, timer = null
  function clear() {
    if (timer !== null) cancel(timer)
    timer = null; dx = dy = ticks = 0
  }
  function deliver(x, y) {
    try { if (x || y) move(x, y) }
    catch (error) { clear(); onError(error) }
  }
  function step() {
    timer = null
    const x = dx / ticks, y = dy / ticks
    dx -= x; dy -= y; ticks--
    deliver(x, y)
    if (ticks > 0) timer = schedule(step, 8)
  }
  return {
    add(x, y) {
      if (!x && !y) return
      dx += x; dy += y; ticks = 2
      if (timer === null) step()
    },
    flush() { const x = dx, y = dy; clear(); deliver(x, y) },
    clear
  }
}
module.exports = { createMotion }
