import crypto from 'node:crypto'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type WebSocket from 'ws'
import type { AppConfig } from '../../config.js'
import {
  AppError,
  AUTH_REQUIRED,
  INVALID_CREDENTIALS,
  INVALID_ORIGIN,
  TOO_MANY_LOGIN_ATTEMPTS,
} from '../../utils/app-error.js'

const JSON_CONTENT_TYPE = 'application/json'

export type AuthSession = {
  sessionId: string
  username: string
  createdAt: string
  expiresAt: string
}

type SessionRecord = AuthSession & {
  expiresAtMs: number
  sockets: Set<WebSocket>
}

type FailureState = {
  timestamps: number[]
}

function trimExpired(timestamps: number[], windowStart: number): number[] {
  return timestamps.filter((timestamp) => timestamp >= windowStart)
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = crypto.createHash('sha256').update(left).digest()
  const rightBuffer = crypto.createHash('sha256').update(right).digest()
  return crypto.timingSafeEqual(leftBuffer, rightBuffer)
}

export type AuthService = ReturnType<typeof createAuthService>

export function createAuthService(config: AppConfig) {
  const sessions = new Map<string, SessionRecord>()
  const failuresByIp = new Map<string, FailureState>()
  let globalFailureTimestamps: number[] = []
  let globalCooldownUntil = 0

  const getExpectedOrigin = (request: Pick<FastifyRequest, 'protocol' | 'host'>) => {
    return `${request.protocol}://${request.host}`
  }

  const cleanupExpiredSessions = (now = Date.now()) => {
    for (const [sessionId, session] of sessions.entries()) {
      if (session.expiresAtMs <= now) {
        for (const socket of session.sockets) {
          socket.close(4401, 'Session expired')
        }
        sessions.delete(sessionId)
      }
    }
  }

  const getValidSession = (sessionId: string | undefined, now = Date.now()): AuthSession | null => {
    if (!sessionId) {
      return null
    }
    cleanupExpiredSessions(now)
    const session = sessions.get(sessionId)
    if (!session) {
      return null
    }
    return {
      sessionId: session.sessionId,
      username: session.username,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    }
  }

  const getClientIp = (request: Pick<FastifyRequest, 'ip'>) => request.ip || 'unknown'

  return {
    getExpectedOrigin,

    enforceJsonRequest(request: FastifyRequest): void {
      const contentType = request.headers['content-type'] ?? ''
      if (!contentType.toLowerCase().includes(JSON_CONTENT_TYPE)) {
        throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json', 415)
      }
    },

    enforceSameOrigin(request: FastifyRequest): void {
      const origin = request.headers.origin
      if (!origin) {
        return
      }
      const expected = getExpectedOrigin(request)
      if (origin !== expected) {
        throw new AppError(INVALID_ORIGIN, 'Invalid request origin', 403)
      }
    },

    getSessionFromRequest(request: FastifyRequest): AuthSession | null {
      return getValidSession(request.cookies[config.auth.cookieName])
    },

    requireSession(request: FastifyRequest): AuthSession {
      const session = this.getSessionFromRequest(request)
      if (!session) {
        throw new AppError(AUTH_REQUIRED, 'Authentication required', 401)
      }
      return session
    },

    getSessionResponse(request: FastifyRequest) {
      const session = this.getSessionFromRequest(request)
      if (!session) {
        return { authenticated: false } as const
      }
      return {
        authenticated: true as const,
        username: session.username,
        expiresAt: session.expiresAt,
      }
    },

    createSession(reply: FastifyReply): AuthSession {
      cleanupExpiredSessions()
      const now = Date.now()
      const expiresAtMs = now + config.auth.sessionTtlMs
      const sessionId = crypto.randomBytes(32).toString('hex')
      const session: SessionRecord = {
        sessionId,
        username: config.auth.username,
        createdAt: new Date(now).toISOString(),
        expiresAt: new Date(expiresAtMs).toISOString(),
        expiresAtMs,
        sockets: new Set(),
      }
      sessions.set(sessionId, session)
      reply.setCookie(config.auth.cookieName, sessionId, {
        httpOnly: true,
        sameSite: 'strict',
        path: '/',
        secure: reply.request.protocol === 'https',
      })
      return session
    },

    clearSessionCookie(reply: FastifyReply): void {
      reply.clearCookie(config.auth.cookieName, {
        path: '/',
        sameSite: 'strict',
        httpOnly: true,
        secure: reply.request.protocol === 'https',
      })
    },

    destroySession(sessionId: string | undefined): void {
      if (!sessionId) {
        return
      }
      const session = sessions.get(sessionId)
      if (!session) {
        return
      }
      for (const socket of session.sockets) {
        socket.close(4401, 'Logged out')
      }
      sessions.delete(sessionId)
    },

    verifyCredentials(username: string, password: string): void {
      const usernameMatches = safeEqual(username, config.auth.username)
      const passwordMatches = safeEqual(password, config.auth.password)
      if (!usernameMatches || !passwordMatches) {
        throw new AppError(INVALID_CREDENTIALS, 'Invalid credentials', 401)
      }
    },

    enforceLoginRateLimit(request: FastifyRequest): void {
      const now = Date.now()
      cleanupExpiredSessions(now)

      if (globalCooldownUntil > now) {
        throw new AppError(TOO_MANY_LOGIN_ATTEMPTS, 'Too many login attempts', 429)
      }

      const ip = getClientIp(request)
      const failureState = failuresByIp.get(ip)
      if (!failureState) {
        return
      }

      failureState.timestamps = trimExpired(failureState.timestamps, now - config.auth.ipWindowMs)
      if (failureState.timestamps.length >= config.auth.ipFailureLimit) {
        throw new AppError(TOO_MANY_LOGIN_ATTEMPTS, 'Too many login attempts', 429)
      }
    },

    recordFailedLogin(request: FastifyRequest): void {
      const now = Date.now()
      const ip = getClientIp(request)
      const failureState = failuresByIp.get(ip) ?? { timestamps: [] }
      failureState.timestamps = trimExpired(
        [...failureState.timestamps, now],
        now - config.auth.ipWindowMs
      )
      failuresByIp.set(ip, failureState)

      globalFailureTimestamps = trimExpired(
        [...globalFailureTimestamps, now],
        now - config.auth.ipWindowMs
      )

      if (globalFailureTimestamps.length >= config.auth.globalFailureLimit) {
        globalCooldownUntil = now + config.auth.globalCooldownMs
        globalFailureTimestamps = []
      }
    },

    clearLoginFailures(request: FastifyRequest): void {
      failuresByIp.delete(getClientIp(request))
    },

    attachSocket(sessionId: string, socket: WebSocket): void {
      const session = sessions.get(sessionId)
      if (!session) {
        socket.close(4401, 'Authentication required')
        return
      }
      session.sockets.add(socket)
    },

    detachSocket(socket: WebSocket): void {
      for (const session of sessions.values()) {
        session.sockets.delete(socket)
      }
    },
  }
}
