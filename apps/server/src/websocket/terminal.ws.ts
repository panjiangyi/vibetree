import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type WebSocket from 'ws'
import { sendWs, parseWsMessage } from './protocol.js'
import type { TerminalService } from '../modules/terminals/terminal.service.js'
import type { PtyManager } from '../modules/pty/pty.manager.js'
import type { AuthService } from '../modules/auth/auth.service.js'

const MAX_CLIPBOARD_IMAGE_BYTES = 20 * 1024 * 1024
const CLIPBOARD_IMAGE_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}
const MIN_TERMINAL_COLS = 20
const MIN_TERMINAL_ROWS = 5
const MAX_TERMINAL_COLS = 500
const MAX_TERMINAL_ROWS = 200

function normalizeTerminalSize(cols: number, rows: number): { cols: number; rows: number } {
  return {
    cols: Math.min(MAX_TERMINAL_COLS, Math.max(MIN_TERMINAL_COLS, Math.floor(cols))),
    rows: Math.min(MAX_TERMINAL_ROWS, Math.max(MIN_TERMINAL_ROWS, Math.floor(rows))),
  }
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'terminal'
}

function decodeClipboardImage(mimeType: string, dataBase64: string): { buffer: Buffer; extension: string } {
  const extension = CLIPBOARD_IMAGE_EXTENSIONS[mimeType]
  if (!extension) {
    throw new Error('Unsupported clipboard image type: ' + mimeType)
  }

  if (dataBase64.length > Math.ceil((MAX_CLIPBOARD_IMAGE_BYTES * 4) / 3) + 4) {
    throw new Error('Clipboard image is too large')
  }

  const buffer = Buffer.from(dataBase64, 'base64')
  if (buffer.length === 0) {
    throw new Error('Clipboard image is empty')
  }
  if (buffer.length > MAX_CLIPBOARD_IMAGE_BYTES) {
    throw new Error('Clipboard image is too large')
  }

  return { buffer, extension }
}

async function saveClipboardImage(input: { terminalId: string; mimeType: string; dataBase64: string }): Promise<string> {
  const decoded = decodeClipboardImage(input.mimeType, input.dataBase64)
  const dir = path.join(os.tmpdir(), 'worktreehub-clipboard-images', sanitizePathSegment(input.terminalId))
  await fs.mkdir(dir, { recursive: true, mode: 0o700 })

  const filePath = path.join(dir, 'clipboard-' + Date.now() + '-' + randomUUID() + '.' + decoded.extension)
  await fs.writeFile(filePath, decoded.buffer, { mode: 0o600 })
  return filePath
}
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
            terminalService.getTerminal(message.terminalId)

            let runtime = ptyManager.get(message.terminalId) ?? null
            if (!runtime) {
              try {
                terminalService.ensureTerminalRuntime(message.terminalId)
                runtime = ptyManager.get(message.terminalId) ?? null
              } catch {
                runtime = null
              }
            }

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
            const normalizedSize = normalizeTerminalSize(message.cols, message.rows)
            ptyManager.resize(message.terminalId, normalizedSize.cols, normalizedSize.rows)

            sendWs(ws, {
              type: 'attached',
              terminalId: message.terminalId,
            })

            const replayOutput = runtime.outputBuffer.toString()
            if (replayOutput) {
              sendWs(ws, {
                type: 'output',
                terminalId: message.terminalId,
                data: replayOutput,
              })
            }
            break
          }

          case 'input': {
            ptyManager.write(message.terminalId, message.data)
            break
          }

          case 'paste-image': {
            terminalService.getTerminal(message.terminalId)
            const runtime = ptyManager.get(message.terminalId)
            if (!runtime) {
              sendWs(ws, {
                type: 'error',
                terminalId: message.terminalId,
                code: 'PTY_NOT_FOUND',
                message: 'PTY process not found',
              })
              return
            }

            const filePath = await saveClipboardImage(message)
            ptyManager.write(message.terminalId, filePath)
            break
          }

          case 'resize': {
            const normalizedSize = normalizeTerminalSize(message.cols, message.rows)
            ptyManager.resize(message.terminalId, normalizedSize.cols, normalizedSize.rows)
            break
          }

          case 'close': {
            terminalService.deleteTerminal(message.terminalId)
            break
          }

          case 'ping': {
            sendWs(ws, { type: 'pong' })
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
