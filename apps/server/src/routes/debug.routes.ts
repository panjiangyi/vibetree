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
})

const inputEventBatchSchema = z.object({
  userAgent: z.string().optional(),
  page: z.string().optional(),
  events: z.array(inputEventSchema).max(200),
})

export async function registerDebugRoutes(app: FastifyInstance) {
  app.post('/api/debug/input-events', async (request) => {
    const batch = inputEventBatchSchema.parse(request.body)
    for (const event of batch.events) {
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
}
