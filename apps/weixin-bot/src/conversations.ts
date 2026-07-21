/*
 * conversations.ts — per-user message history backed by SQLite (node:sqlite,
 * built in since Node 22.5 / unflagged since 23.4). Replaces the in-memory ring
 * buffer: every inbound and outbound message is stored in one table, partitioned
 * by `peer` (the WeChat user) so each user's history is isolated and durable
 * across restarts.
 *
 *   seq         global monotonic cursor (AUTOINCREMENT — never reused)
 *   peer        the WeChat user this conversation is with (isolation key)
 *   direction   'in'  = user -> bot, 'out' = bot -> user
 *
 * Reads: history(user, since, limit) filters by peer; history(undefined, ...)
 * is the merged global feed. Inbound is de-duplicated on (message_id, or
 * timestamp:from when absent); outbound is always inserted.
 */
import { DatabaseSync } from "node:sqlite"
import fs from "node:fs"
import path from "node:path"
import type { Logger } from "./logger.js"

export type Direction = "in" | "out"

export interface StoredMedia {
  id: string
  type: string // "image" | "video" | "file"
  mime: string
  size: number
  filename: string
  url: string
}

export interface ConversationMessage {
  seq: number
  user: string
  direction: Direction
  message_id: string | null
  text: string
  media: StoredMedia | null
  timestamp: number
  received_at: number
}

export interface InboundPayload {
  message_id: string | null
  from: string
  to: string
  text: string
  media: StoredMedia | null
  timestamp: number
}

export interface OutboundPayload {
  to: string
  text: string
  media: StoredMedia | null
  message_id?: string | null
  timestamp?: number
}

export interface HistoryPage {
  messages: ConversationMessage[]
  next_cursor: number
  has_more: boolean
}

export interface ConversationSummary {
  user: string
  message_count: number
  last_at: number
  last_direction: Direction
  last_text: string
}

interface Row {
  seq: number
  peer: string
  direction: string
  message_id: string | null
  text: string
  media_json: string | null
  timestamp: number
  received_at: number
}

export class ConversationStore {
  private db: DatabaseSync
  private insert!: ReturnType<DatabaseSync["prepare"]>
  private byDedup!: ReturnType<DatabaseSync["prepare"]>
  private selPeer!: ReturnType<DatabaseSync["prepare"]>
  private selAll!: ReturnType<DatabaseSync["prepare"]>
  private maxSeq!: ReturnType<DatabaseSync["prepare"]>

  constructor(dbPath: string, private log: Logger) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    this.db = new DatabaseSync(dbPath)
    this.db.exec("PRAGMA journal_mode = WAL")
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        seq         INTEGER PRIMARY KEY AUTOINCREMENT,
        peer        TEXT NOT NULL,
        direction   TEXT NOT NULL,
        message_id  TEXT,
        text        TEXT NOT NULL DEFAULT '',
        media_json  TEXT,
        timestamp   INTEGER NOT NULL,
        received_at INTEGER NOT NULL,
        dedup_key   TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_peer_seq ON messages(peer, seq);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_dedup ON messages(dedup_key) WHERE dedup_key IS NOT NULL;
    `)
    this.prepareStatements()
    this.log.info(`conversations: sqlite at ${dbPath} (${this.totalSize()} message(s))`)
  }

  private prepareStatements(): void {
    this.insert = this.db.prepare(
      `INSERT OR IGNORE INTO messages
         (peer, direction, message_id, text, media_json, timestamp, received_at, dedup_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    this.byDedup = this.db.prepare(`SELECT * FROM messages WHERE dedup_key = ?`)
    this.selPeer = this.db.prepare(
      `SELECT * FROM messages WHERE peer = ? AND seq > ? ORDER BY seq LIMIT ?`
    )
    this.selAll = this.db.prepare(`SELECT * FROM messages WHERE seq > ? ORDER BY seq LIMIT ?`)
    this.maxSeq = this.db.prepare(`SELECT COALESCE(MAX(seq), 0) AS m FROM messages`)
  }

  recordInbound(p: InboundPayload): ConversationMessage {
    const now = Date.now()
    const dedup = p.message_id || `${p.timestamp}:${p.from}`
    const media = p.media ? JSON.stringify(p.media) : null
    const info = this.insert.run(
      p.from,
      "in",
      p.message_id ?? null,
      p.text ?? "",
      media,
      p.timestamp,
      now,
      dedup
    )
    if (info.changes === 0) {
      // duplicate inbound — return the row we already have
      const existing = this.byDedup.get(dedup) as unknown as Row | undefined
      if (existing) return rowToMsg(existing)
    }
    return {
      seq: Number(info.lastInsertRowid),
      user: p.from,
      direction: "in",
      message_id: p.message_id ?? null,
      text: p.text ?? "",
      media: p.media ?? null,
      timestamp: p.timestamp,
      received_at: now,
    }
  }

  recordOutbound(p: OutboundPayload): ConversationMessage {
    const now = Date.now()
    const ts = p.timestamp ?? now
    const media = p.media ? JSON.stringify(p.media) : null
    const info = this.insert.run(
      p.to,
      "out",
      p.message_id ?? null,
      p.text ?? "",
      media,
      ts,
      now,
      null // outbound is never de-duplicated
    )
    return {
      seq: Number(info.lastInsertRowid),
      user: p.to,
      direction: "out",
      message_id: p.message_id ?? null,
      text: p.text ?? "",
      media: p.media ?? null,
      timestamp: ts,
      received_at: now,
    }
  }

  /** Page a user's history (or the merged global feed when user is undefined). */
  history(user: string | undefined, since: number, limit: number): HistoryPage {
    const rows = (
      user ? this.selPeer.all(user, since, limit) : this.selAll.all(since, limit)
    ) as unknown as Row[]
    const messages = rows.map(rowToMsg)
    const head = Number((this.maxSeq.get() as unknown as { m: number }).m)
    const next_cursor = messages.length ? messages[messages.length - 1].seq : Math.max(since, head)
    return { messages, next_cursor, has_more: messages.length === limit }
  }

  conversations(): ConversationSummary[] {
    const rows = this.db
      .prepare(
        `SELECT peer AS user,
                COUNT(*) AS message_count,
                MAX(received_at) AS last_at,
                (SELECT direction FROM messages x WHERE x.peer = m.peer ORDER BY seq DESC LIMIT 1) AS last_direction,
                (SELECT text      FROM messages x WHERE x.peer = m.peer ORDER BY seq DESC LIMIT 1) AS last_text
         FROM messages m
         GROUP BY peer
         ORDER BY last_at DESC`
      )
      .all() as unknown as Array<{
      user: string
      message_count: number
      last_at: number
      last_direction: string
      last_text: string
    }>
    return rows.map((r) => ({
      user: r.user,
      message_count: Number(r.message_count),
      last_at: Number(r.last_at),
      last_direction: r.last_direction === "out" ? "out" : "in",
      last_text: r.last_text ?? "",
    }))
  }

  totalSize(): number {
    return Number(
      (this.db.prepare(`SELECT COUNT(*) AS c FROM messages`).get() as unknown as { c: number }).c
    )
  }

  peerCount(): number {
    return Number(
      (
        this.db.prepare(`SELECT COUNT(DISTINCT peer) AS c FROM messages`).get() as unknown as {
          c: number
        }
      ).c
    )
  }

  close(): void {
    try {
      this.db.close()
    } catch {
      /* best effort */
    }
  }
}

function rowToMsg(r: Row): ConversationMessage {
  return {
    seq: Number(r.seq),
    user: r.peer,
    direction: r.direction === "out" ? "out" : "in",
    message_id: r.message_id ?? null,
    text: r.text ?? "",
    media: r.media_json ? (JSON.parse(r.media_json) as StoredMedia) : null,
    timestamp: Number(r.timestamp),
    received_at: Number(r.received_at),
  }
}
