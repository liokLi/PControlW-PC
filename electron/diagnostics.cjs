function gaps() { return { count: 0, first: 0, last: 0, maxGap: 0, longGaps: 0 } }
function record(stats, time) {
  const gap = stats.count ? time - stats.last : 0
  if (!stats.count) stats.first = time
  stats.count++; stats.last = time
  stats.maxGap = Math.max(stats.maxGap, gap)
  if (gap > 50) stats.longGaps++
  return gap
}
function summary(stats) { return { ...stats, averageGap: stats.count > 1 ? (stats.last - stats.first) / (stats.count - 1) : 0 } }
function createDiagnostics() {
  let state
  function reset() {
    state = { received: gaps(), sent: gaps(), executed: gaps(), gesture: null, seq: null, sequenceErrors: 0, transitGrowthMax: 0, stalls: [], loopMax: 0 }
  }
  reset()
  return {
    reset,
    receive(trace, time) {
      const receiveGap = record(state.received, time)
      if (!trace || !Number.isSafeInteger(trace.gesture) || !Number.isSafeInteger(trace.seq) || !Number.isFinite(trace.sentAt)) return
      const same = state.gesture === trace.gesture
      if (state.seq !== null && (!same || trace.seq !== state.seq + 1)) state.sequenceErrors++
      const sendGap = same ? record(state.sent, trace.sentAt) : (state.sent = gaps(), record(state.sent, trace.sentAt))
      if (same) state.transitGrowthMax = Math.max(state.transitGrowthMax, receiveGap - sendGap)
      if (same && (receiveGap > 50 || sendGap > 50)) {
        state.stalls.push({ seq: trace.seq, sendGap, receiveGap })
        if (state.stalls.length > 5) state.stalls.shift()
      }
      state.gesture = trace.gesture; state.seq = trace.seq
    },
    execute(time) { record(state.executed, time) },
    loop(delay) { state.loopMax = Math.max(state.loopMax, delay) },
    snapshot() { return { ...state, received: summary(state.received), sent: summary(state.sent), executed: summary(state.executed), stalls: state.stalls.slice() } }
  }
}
module.exports = { createDiagnostics }
