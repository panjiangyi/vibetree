import type { TerminalClientMessage, TerminalServerMessage } from '@vibetree/shared'
import { getApiBase } from '../api/client.js'

type Listener = (message: TerminalServerMessage) => void

class TerminalSocket {
  private ws: WebSocket | null = null
  private listeners = new Set<Listener>()
  private reconnectListeners = new Set<() => void>()
  private queue: TerminalClientMessage[] = []
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null
  private connecting = false
  private manualDisconnect = false

  connect() {
    if (this.connecting) return
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return

    this.manualDisconnect = false
    this.connecting = true
    const wsBase = getApiBase().replace(/^http/, 'ws')
    const url = `${wsBase || window.location.origin.replace(/^http/, 'ws')}/ws/terminal`

    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      this.connecting = false
      for (const message of this.queue) {
        this.send(message)
      }
      this.queue = []
      for (const listener of this.reconnectListeners) {
        listener()
      }
    }

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data) as TerminalServerMessage
      for (const listener of this.listeners) {
        listener(message)
      }
    }

    this.ws.onclose = () => {
      this.ws = null
      this.connecting = false
      if (!this.manualDisconnect) {
        this.reconnectTimeout = setTimeout(() => this.connect(), 1000)
      }
    }

    this.ws.onerror = () => {
      this.connecting = false
      this.ws?.close()
    }
  }

  send(message: TerminalClientMessage) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.queue.push(message)
      this.connect()
      return
    }

    this.ws.send(JSON.stringify(message))
  }

  attach(input: { terminalId: string; cols: number; rows: number }) {
    this.send({ type: 'attach', ...input })
  }

  input(input: { terminalId: string; data: string }) {
    this.send({ type: 'input', ...input })
  }

  resize(input: { terminalId: string; cols: number; rows: number }) {
    this.send({ type: 'resize', ...input })
  }

  close(terminalId: string) {
    this.send({ type: 'close', terminalId })
  }

  onMessage(listener: Listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  onReconnect(listener: () => void) {
    this.reconnectListeners.add(listener)
    return () => this.reconnectListeners.delete(listener)
  }

  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
    }
    this.manualDisconnect = true
    this.connecting = false
    this.ws?.close()
    this.ws = null
  }
}

export const terminalSocket = new TerminalSocket()
