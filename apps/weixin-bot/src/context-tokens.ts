/*
 * context-tokens.ts — per-(accountId, userId) context_token cache with disk
 * persistence. context_token is issued on inbound messages and must be echoed
 * on outbound sends (else "prepare failed"). Most-recent wins; no TTL; whole
 * file rewritten on each set (mirrors the plugin).
 */
import fs from "node:fs"
import path from "node:path"
import type { Logger } from "./logger.js"

export interface ContextTokenEntry {
  token: string
  last_seen_at: string
}

interface Persisted {
  [userId: string]: ContextTokenEntry
}

export class ContextTokenStore {
  private map = new Map<string, ContextTokenEntry>()
  constructor(private file: string, private log: Logger) {}

  load(): void {
    try {
      if (!fs.existsSync(this.file)) return
      const parsed = JSON.parse(fs.readFileSync(this.file, "utf-8")) as Persisted
      for (const [k, v] of Object.entries(parsed || {})) {
        if (v && typeof v.token === "string") this.map.set(k, v)
      }
      this.log.debug(`context-tokens: loaded ${this.map.size} token(s)`)
    } catch (e) {
      this.log.warn("context-tokens: load failed:", (e as Error).message)
    }
  }

  get(userId: string): ContextTokenEntry | undefined {
    return this.map.get(userId)
  }

  set(_accountId: string, userId: string, token: string): void {
    this.map.set(userId, { token, last_seen_at: new Date().toISOString() })
    this.persist()
    this.log.debug(`context-tokens: cached token for ${userId}`)
  }

  list(): Array<{ user_id: string; last_seen_at: string }> {
    return [...this.map.entries()].map(([user_id, v]) => ({ user_id, last_seen_at: v.last_seen_at }))
  }

  size(): number {
    return this.map.size
  }

  private persist(): void {
    try {
      const obj: Persisted = {}
      for (const [k, v] of this.map) obj[k] = v
      fs.mkdirSync(path.dirname(this.file), { recursive: true })
      fs.writeFileSync(this.file, JSON.stringify(obj, null, 2), { mode: 0o600 })
      try {
        fs.chmodSync(this.file, 0o600)
      } catch {
        /* best effort */
      }
    } catch (e) {
      this.log.warn("context-tokens: persist failed:", (e as Error).message)
    }
  }
}
