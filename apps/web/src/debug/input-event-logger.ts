import { getApiBase } from '../api/client.js'

type InputEventLog = Record<string, unknown>

let seq = 0
let flushTimer: ReturnType<typeof setTimeout> | null = null
const queue: InputEventLog[] = []

export function logInputEvent(event: InputEventLog) {
  queue.push({
    seq: ++seq,
    ...event,
  })

  if (!flushTimer) {
    flushTimer = setTimeout(flushInputEvents, 60)
  }
}

function flushInputEvents() {
  flushTimer = null
  const events = queue.splice(0, queue.length)
  if (!events.length) return

  void fetch(`${getApiBase()}/api/debug/input-events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      page: window.location.href,
      userAgent: navigator.userAgent,
      events,
    }),
  }).catch(() => {
    // Debug logging must never interfere with terminal input.
  })
}

