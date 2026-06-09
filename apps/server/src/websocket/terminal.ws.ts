import type { FastifyInstance } from 'fastify'
import type WebSocket from 'ws'
import { sendWs, parseWsMessage } from './protocol.js'
import type { TerminalService } from '../modules/terminals/terminal.service.js'
import type { PtyManager } from '../modules/pty/pty.manager.js'
import type { AuthService } from '../modules/auth/auth.service.js'

export function registerTerminalWebSocket(
  app: FastifyInstance,
  terminalService: TerminalService,
  ptyManager: PtyManager,
  authService: AuthService
) {
  terminalService.onBroadcast = (event) => {
    const sockets = authService.getAllSockets()
    for (const socket of sockets) {
      sendWs(socket, event)
    }
  }
  app.get('/ws/terminal', { websocket: true }, (ws: WebSocket, request) => {
    const session = authService.requireSession(request)
    authService.attachSocket(session.sessionId, ws)

    ws.on('message', async (raw) => {
      try {
        const message = parseWsMessage(raw.toString())

        switch (message.type) {
          case 'attach': {
            const terminal = terminalService.getTerminal(message.terminalId)
            const runtime = ptyManager.get(message.terminalId)

            if (!runtime) {
              terminalService.reconcileTerminalStatuses()
              sendWs(ws, {
                type: 'error',
                terminalId: message.terminalId,
                code: 'PTY_NOT_FOUND',
                message: 'PTY process not found',
              })
              return
            }

            ptyManager.attachClient(message.terminalId, ws)
            ptyManager.resize(message.terminalId, message.cols, message.rows)

            sendWs(ws, {
              type: 'attached',
              terminalId: message.terminalId,
            })

            // Replay buffer
            for (const chunk of runtime.outputBuffer.toArray()) {
              sendWs(ws, {
                type: 'output',
                terminalId: message.terminalId,
                data: chunk,
              })
            }
            break
          }

          case 'input': {
            ptyManager.write(message.terminalId, message.data)
            break
          }

          case 'resize': {
            ptyManager.resize(message.terminalId, message.cols, message.rows)
            break
          }

          case 'close': {
            terminalService.deleteTerminal(message.terminalId)
            break
          }

          default:
            sendWs(ws, {
              type: 'error',
              message: 'Unknown message type',
            })
        }
      } catch (error) {
        sendWs(ws, {
          type: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    })

    ws.on('close', () => {
      authService.detachSocket(ws)
      ptyManager.detachClientFromAll(ws)
    })
  })
}
