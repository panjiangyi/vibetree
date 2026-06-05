import type { LoginInput } from '@vibetree/shared'
import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import type { AuthService } from '../modules/auth/auth.service.js'

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
})

export async function registerAuthRoutes(app: FastifyInstance, authService: AuthService) {
  app.get('/api/auth/session', async (request) => {
    return authService.getSessionResponse(request)
  })

  app.post('/api/auth/login', async (request, reply) => {
    authService.enforceSameOrigin(request)
    authService.enforceJsonRequest(request)
    authService.enforceLoginRateLimit(request)

    const input = loginSchema.parse(request.body) as LoginInput

    try {
      authService.verifyCredentials(input.username, input.password)
    } catch (error) {
      authService.recordFailedLogin(request)
      throw error
    }

    authService.clearLoginFailures(request)
    authService.createSession(reply)
    reply.status(204)
    return reply.send()
  })

  app.post('/api/auth/logout', async (request, reply) => {
    authService.enforceSameOrigin(request)
    authService.enforceJsonRequest(request)
    const session = authService.getSessionFromRequest(request)
    authService.destroySession(session?.sessionId)
    authService.clearSessionCookie(reply)
    reply.status(204)
    return reply.send()
  })
}
