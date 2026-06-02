import type { FastifyInstance } from 'fastify'
import type WebSocket from 'ws'
import { sendWs, parseWsMessage } from './protocol.js'
import type { ReturnType<typeof createTerminalService> } from '../modules/terminals/terminal.service.js'
import type { ReturnType<typeof createPtyManager> } from '../modules/pty/pty.manager.js'

export function registerTerminalWebSocket(
  app: FastifyInstance,
  terminalService: ReturnType<typeof createTerminalService>,
  ptyManager: ReturnType<typeof createPtyManager>
) {
  app.get('/ws/terminal', { websocket: true }, (connection) => {
    const ws = connection.socket as WebSocket

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
      ptyManager.detachClientFromAll(ws)
    })
  })
}
