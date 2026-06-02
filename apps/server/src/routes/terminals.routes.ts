import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { TerminalService } from '../modules/terminals/terminal.service.js'

const createTerminalSchema = z.object({
  shell: z.string().optional(),
  title: z.string().optional(),
  cols: z.number().optional(),
  rows: z.number().optional(),
})

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
