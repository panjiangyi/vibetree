import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { CreateDirectoryTerminalInput } from '@vibetree/shared'
import type { TerminalService } from '../modules/terminals/terminal.service.js'

const createTerminalSchema = z.object({
  shell: z.string().optional(),
  title: z.string().optional(),
  cols: z.number().optional(),
  rows: z.number().optional(),
  initialCommand: z.string().optional(),
})

const openDirectoryTerminalSchema = createTerminalSchema.extend({
  cwd: z.string().min(1),
})

const createDirectoryTerminalSchema = z.union([
  createTerminalSchema.extend({
    cwd: z.string().min(1),
  }),
  createTerminalSchema.extend({
    scopeId: z.string().min(1),
  }),
])

const updateTerminalSchema = z.object({
  title: z.string().optional(),
})

export async function registerTerminalRoutes(
  app: FastifyInstance,
  terminalService: TerminalService
) {
  app.get('/api/terminals', async () => {
    return terminalService.listTerminals()
  })

  app.post('/api/worktrees/:worktreeId/terminals', async (request, reply) => {
    const { worktreeId } = request.params as { worktreeId: string }
    const input = createTerminalSchema.parse(request.body)
    const terminal = terminalService.createTerminal(worktreeId, input)
    reply.status(201)
    return terminal
  })

  app.post('/api/terminals/directory/open', async (request, reply) => {
    const input = openDirectoryTerminalSchema.parse(request.body)
    const result = terminalService.openDirectoryTerminal(input)
    reply.status(result.reused ? 200 : 201)
    return result
  })

  app.post('/api/terminals/directory', async (request, reply) => {
    const input = createDirectoryTerminalSchema.parse(request.body) as CreateDirectoryTerminalInput
    const terminal = terminalService.createDirectoryTerminal(input)
    reply.status(201)
    return terminal
  })

  app.patch('/api/terminals/:terminalId', async (request) => {
    const { terminalId } = request.params as { terminalId: string }
    const input = updateTerminalSchema.parse(request.body)
    return terminalService.renameTerminal(terminalId, input)
  })

  app.delete('/api/terminals/:terminalId', async (request) => {
    const { terminalId } = request.params as { terminalId: string }
    terminalService.deleteTerminal(terminalId)
    return { success: true }
  })

  app.post('/api/terminals/:terminalId/restart', async (request) => {
    const { terminalId } = request.params as { terminalId: string }
    return terminalService.restartTerminal(terminalId)
  })
}
