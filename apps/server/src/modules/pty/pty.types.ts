import type { IPty } from 'node-pty'
import type WebSocket from 'ws'
import type { RingBuffer } from './ring-buffer.js'

export type PtyRuntimeSession = {
  terminalId: string
  pty: IPty
  outputBuffer: RingBuffer<string>
  clients: Set<WebSocket>
  createdAt: string
}

export type CreatePtyInput = {
  terminalId: string
  shell: string
  cwd: string
  cols: number
  rows: number
  env: Record<string, string>
}
