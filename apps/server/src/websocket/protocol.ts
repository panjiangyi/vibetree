import type WebSocket from 'ws'
import type { TerminalClientMessage, TerminalServerMessage } from '@vibetree/shared'

export function sendWs(ws: WebSocket, message: TerminalServerMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message))
  }
}

export function parseWsMessage(raw: string): TerminalClientMessage {
  return JSON.parse(raw) as TerminalClientMessage
}
