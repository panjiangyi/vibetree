import Fastify from 'fastify'
import cors from '@fastify/cors'
import websocket from '@fastify/websocket'
import path from 'node:path'
import fs from 'node:fs'
import type { AppConfig } from './config.js'
import { createDatabase } from './db/database.js'
import { createProjectRepository } from './db/repositories/project.repository.js'
import { createWorktreeRepository } from './db/repositories/worktree.repository.js'
import { createTerminalRepository } from './db/repositories/terminal.repository.js'
import { createProjectService } from './modules/projects/project.service.js'
import { createWorktreeService } from './modules/worktrees/worktree.service.js'
import { createTerminalService } from './modules/terminals/terminal.service.js'
import { createPtyManager } from './modules/pty/pty.manager.js'
import { registerHealthRoutes } from './routes/health.routes.js'
import { registerProjectRoutes } from './routes/projects.routes.js'
import { registerWorktreeRoutes } from './routes/worktrees.routes.js'
import { registerTerminalRoutes } from './routes/terminals.routes.js'
import { registerTerminalWebSocket } from './websocket/terminal.ws.js'
import { AppError } from './utils/app-error.js'

export async function buildApp(config: AppConfig) {
  const app = Fastify({
    logger: true,
  })

  // Initialize database
  const db = createDatabase(config.databasePath)

  // Initialize repositories
  const projectRepo = createProjectRepository(db)
  const worktreeRepo = createWorktreeRepository(db)
  const terminalRepo = createTerminalRepository(db)

  // Initialize PTY manager
  const ptyManager = createPtyManager()

  // Initialize services
  const worktreeService = createWorktreeService(projectRepo, worktreeRepo, terminalRepo)
  const projectService = createProjectService(
    projectRepo,
    worktreeRepo,
    terminalRepo,
    worktreeService.syncProjectWorktrees.bind(worktreeService)
  )
  const terminalService = createTerminalService(
    projectRepo,
    worktreeRepo,
    terminalRepo,
    ptyManager,
    config
  )

  // Mark all running terminals as disconnected on startup
  terminalRepo.markRunningAsDisconnected()

  // Register plugins
  await app.register(cors, { origin: true })
  await app.register(websocket)

  // Error handler
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
        },
      })
      return
    }

    const err = error as { validation?: unknown; message?: string }
    if (err.validation) {
      reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: err.message ?? 'Validation error',
        },
      })
      return
    }

    request.log.error(error)

    reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      },
    })
  })

  // Register routes
  await registerHealthRoutes(app)
  await registerProjectRoutes(app, projectService)
  await registerWorktreeRoutes(app, worktreeService)
  await registerTerminalRoutes(app, terminalService)
  registerTerminalWebSocket(app, terminalService, ptyManager)

  // Serve static files in production
  const webDistPath = path.resolve(import.meta.dirname, '../../web/dist')
  if (fs.existsSync(webDistPath)) {
    const fastifyStatic = await import('@fastify/static')
    await app.register(fastifyStatic.default, {
      root: webDistPath,
      prefix: '/',
    })

    // SPA fallback
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api') || request.url.startsWith('/ws')) {
        reply.status(404).send({
          error: {
            code: 'NOT_FOUND',
            message: 'Route not found',
          },
        })
        return
      }
      return reply.sendFile('index.html')
    })
  }

  return app
}
