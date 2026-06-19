import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

const inputEventSchema = z.object({
  seq: z.number(),
  terminalId: z.string(),
  source: z.string(),
  type: z.string(),
  phase: z.string().optional(),
  target: z.string().optional(),
  activeElement: z.string().optional(),
  timeStamp: z.number().optional(),
  value: z.string().optional(),
  valueLength: z.number().optional(),
  selectionStart: z.number().nullable().optional(),
  selectionEnd: z.number().nullable().optional(),
  data: z.string().nullable().optional(),
  dataCodePoints: z.array(z.string()).optional(),
  inputType: z.string().optional(),
  isComposing: z.boolean().optional(),
  key: z.string().optional(),
  code: z.string().optional(),
  keyCode: z.number().optional(),
  which: z.number().optional(),
  charCode: z.number().optional(),
  repeat: z.boolean().optional(),
  ctrlKey: z.boolean().optional(),
  altKey: z.boolean().optional(),
  shiftKey: z.boolean().optional(),
  metaKey: z.boolean().optional(),
  bubbles: z.boolean().optional(),
  cancelable: z.boolean().optional(),
  composed: z.boolean().optional(),
  defaultPrevented: z.boolean().optional(),
  appState: z.record(z.unknown()).optional(),
}).passthrough()

const inputEventBatchSchema = z.object({
  userAgent: z.string().optional(),
  page: z.string().optional(),
  events: z.array(inputEventSchema).max(200),
})

// Ring buffer so GET /api/debug/input-events can return recent events
// without needing to tail the process log — useful when debugging from mobile.
const MAX_RECENT = 500
const recentEvents: Array<{
  receivedAt: string
  userAgent?: string
  page?: string
  event: Record<string, unknown>
}> = []

function pushRecent(userAgent: string | undefined, page: string | undefined, event: Record<string, unknown>) {
  recentEvents.push({ receivedAt: new Date().toISOString(), userAgent, page, event })
  if (recentEvents.length > MAX_RECENT) recentEvents.splice(0, recentEvents.length - MAX_RECENT)
}

export async function registerDebugRoutes(app: FastifyInstance) {
  app.post('/api/debug/input-events', async (request) => {
    const batch = inputEventBatchSchema.parse(request.body)
    for (const event of batch.events) {
      pushRecent(batch.userAgent, batch.page, event)
      request.log.info(
        {
          debugType: 'terminal-input-event',
          userAgent: batch.userAgent,
          page: batch.page,
          event,
        },
        `terminal input event ${event.seq} ${event.source}:${event.type}`
      )
    }
    return { success: true, count: batch.events.length }
  })

  // GET endpoint: return the last N events as JSON — open from phone browser to inspect
  app.get('/api/debug/input-events', async (request) => {
    const query = (request.query as Record<string, string>) ?? {}
    const limit = Math.min(Number(query.limit ?? 100), MAX_RECENT)
    const filterSource = query.source ?? ''
    const filterType = query.type ?? ''

    let events = recentEvents.slice(-limit)
    if (filterSource) events = events.filter(e => String(e.event.source ?? '').includes(filterSource))
    if (filterType) events = events.filter(e => String(e.event.type ?? '').includes(filterType))

    return {
      total: recentEvents.length,
      returned: events.length,
      events: events.slice().reverse(), // newest first
    }
  })

  // DELETE to clear the buffer
  app.delete('/api/debug/input-events', async () => {
    recentEvents.splice(0, recentEvents.length)
    return { success: true }
  })
}
