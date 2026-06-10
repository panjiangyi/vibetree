import { getApiBase } from '../api/client.js'

type InputEventLog = Record<string, unknown>

const LOCAL_STORAGE_KEY = 'vibetree.debugInputEvents'
const QUERY_PARAM = 'debugInputEvents'
const FLUSH_INTERVAL_MS = 250
const MAX_QUEUE_LENGTH = 500
const MAX_BATCH_LENGTH = 100

let seq = 0
let flushTimer: ReturnType<typeof setTimeout> | null = null
const queue: InputEventLog[] = []
let enabledCache: boolean | null = null

export function isInputEventLoggingEnabled() {
  if (enabledCache != null) {
    return enabledCache
  }

  let localStorageEnabled = false
  try {
    localStorageEnabled = localStorage.getItem(LOCAL_STORAGE_KEY) === '1'
  } catch {
    localStorageEnabled = false
  }

  enabledCache =
    import.meta.env.VITE_VIBETREE_DEBUG_INPUT_EVENTS === '1' ||
    new URLSearchParams(window.location.search).get(QUERY_PARAM) === '1' ||
    localStorageEnabled

  return enabledCache
}

export function logInputEvent(event: InputEventLog) {
  if (!isInputEventLoggingEnabled()) {
    return
  }

  if (queue.length >= MAX_QUEUE_LENGTH) {
    queue.splice(0, queue.length - MAX_QUEUE_LENGTH + 1)
  }

  queue.push({
    seq: ++seq,
    ...event,
  })

  if (!flushTimer) {
    flushTimer = setTimeout(flushInputEvents, FLUSH_INTERVAL_MS)
  }
}

function flushInputEvents() {
  flushTimer = null
  const events = queue.splice(0, MAX_BATCH_LENGTH)
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

  if (queue.length > 0) {
    flushTimer = setTimeout(flushInputEvents, FLUSH_INTERVAL_MS)
  }
}
