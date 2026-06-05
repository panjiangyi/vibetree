import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { CheckMergeInput } from '@vibetree/shared'
import type { WorktreeService } from '../modules/worktrees/worktree.service.js'

const createWorktreeSchema = z.object({
  branch: z.string().min(1),
  baseRef: z.string().min(1),
  path: z.string().optional(),
  name: z.string().optional(),
})

const updateWorktreeSchema = z.object({
  displayName: z.string().nullable().optional(),
})

const checkMergeSchema = z.object({
  branch: z.string().min(1).optional(),
  worktreeId: z.string().min(1).optional(),
  targetRef: z.string().min(1).optional(),
}).refine(
  (input) => Number(Boolean(input.branch)) + Number(Boolean(input.worktreeId)) === 1,
  { message: 'Provide exactly one of branch or worktreeId' }
)

export async function registerWorktreeRoutes(
  app: FastifyInstance,
  worktreeService: WorktreeService
) {
  app.get('/api/projects/:projectId/worktrees', async (request) => {
    const { projectId } = request.params as { projectId: string }
    await worktreeService.syncProjectWorktrees(projectId)
    return worktreeService.listWorktrees(projectId)
  })

  app.post('/api/projects/:projectId/merge-check', async (request) => {
    const { projectId } = request.params as { projectId: string }
    const input = checkMergeSchema.parse(request.body) as CheckMergeInput
    return worktreeService.checkProjectMerge(projectId, input)
  })

  app.post('/api/projects/:projectId/worktrees', async (request, reply) => {
    const { projectId } = request.params as { projectId: string }
    const input = createWorktreeSchema.parse(request.body)
    const worktree = await worktreeService.createWorktree(projectId, input)
    reply.status(201)
    return worktree
  })

  app.patch('/api/worktrees/:worktreeId', async (request) => {
    const { worktreeId } = request.params as { worktreeId: string }
    const input = updateWorktreeSchema.parse(request.body)
    return worktreeService.updateWorktree(worktreeId, input)
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
