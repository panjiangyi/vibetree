import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { WorktreeService } from '../modules/worktrees/worktree.service.js'

const createWorktreeSchema = z.object({
  branch: z.string().min(1),
  baseRef: z.string().min(1),
  path: z.string().min(1),
  name: z.string().optional(),
})

export async function registerWorktreeRoutes(
  app: FastifyInstance,
  worktreeService: WorktreeService
) {
  app.get('/api/projects/:projectId/worktrees', async (request) => {
    const { projectId } = request.params as { projectId: string }
    return worktreeService.listWorktrees(projectId)
  })

  app.post('/api/projects/:projectId/worktrees', async (request, reply) => {
    const { projectId } = request.params as { projectId: string }
    const input = createWorktreeSchema.parse(request.body)
    const worktree = await worktreeService.createWorktree(projectId, input)
    reply.status(201)
    return worktree
  })

  app.delete('/api/worktrees/:worktreeId', async (request) => {
    const { worktreeId } = request.params as { worktreeId: string }
    await worktreeService.removeWorktree(worktreeId)
    return { success: true }
  })

  app.post('/api/worktrees/:worktreeId/refresh', async (request) => {
    const { worktreeId } = request.params as { worktreeId: string }
    return worktreeService.refreshWorktreeDirty(worktreeId)
  })
}
