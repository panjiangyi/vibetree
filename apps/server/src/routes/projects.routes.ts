import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { AppError } from '../utils/app-error.js'
import type { ProjectService } from '../modules/projects/project.service.js'

const createProjectSchema = z.object({
  repoPath: z.string().min(1),
  worktreeBasePath: z.string().optional(),
  name: z.string().optional(),
  mainBranch: z.string().optional(),
  setupScript: z.string().optional(),
})

const updateProjectSchema = z.object({
  name: z.string().optional(),
  mainBranch: z.string().optional(),
  setupScript: z.string().nullable().optional(),
})

export async function registerProjectRoutes(
  app: FastifyInstance,
  projectService: ProjectService
) {
  app.get('/api/projects', async () => {
    return projectService.listProjects()
  })

  app.post('/api/projects', async (request, reply) => {
    const input = createProjectSchema.parse(request.body)
    const project = await projectService.createProject(input)
    reply.status(201)
    return project
  })

  app.patch('/api/projects/:projectId', async (request) => {
    const { projectId } = request.params as { projectId: string }
    const input = updateProjectSchema.parse(request.body)
    return projectService.updateProject(projectId, input)
  })

  app.get('/api/projects/:projectId/branches', async (request) => {
    const { projectId } = request.params as { projectId: string }
    return projectService.listBranches(projectId)
  })

  app.delete('/api/projects/:projectId', async (request) => {
    const { projectId } = request.params as { projectId: string }
    await projectService.deleteProject(projectId)
    return { success: true }
  })

  app.post('/api/projects/:projectId/refresh', async (request) => {
    const { projectId } = request.params as { projectId: string }
    return projectService.refreshProject(projectId)
  })
}
