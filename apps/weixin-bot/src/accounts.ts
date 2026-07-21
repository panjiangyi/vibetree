/*
 * accounts.ts — registry of WeChat accounts served by this one instance. Each
 * account owns its own poller, sync cursor, context-token cache and SQLite
 * conversation history; the media store is shared (ids are globally unique).
 * Accounts can be added at runtime (e.g. after a QR login) without a restart.
 */
import fs from "node:fs"
import { ContextTokenStore } from "./context-tokens.js"
import { CursorStore } from "./cursor.js"
import { ConversationStore } from "./conversations.js"
import { WebhookDispatcher } from "./webhook.js"
import { Poller } from "./poller.js"
import { notifyStop } from "./ilink-client.js"
import type { MediaStore } from "./media/store.js"
import type { Config } from "./config.js"
import type { Logger } from "./logger.js"
import {
  accountSessionPath,
  messagesDbPath,
  saveAccountSession,
  statePath,
  type Session,
} from "./state.js"

function rmSafe(p: string): void {
  try {
    fs.rmSync(p, { force: true })
  } catch {
    /* best effort */
  }
}

export interface Account {
  id: string
  session: Session
  cursor: CursorStore
  contextTokens: ContextTokenStore
  conversations: ConversationStore
  webhook: WebhookDispatcher
  poller: Poller
}

export interface AccountSummary {
  id: string
  label: string | null
  ilink_user_id: string
  baseurl: string
  poller: ReturnType<Poller["snapshot"]>
  contacts_count: number
  conversations_count: number
  messages_total: number
  webhook: { url: string; has_secret: boolean } | null
}

export class AccountRegistry {
  private map = new Map<string, Account>()

  constructor(
    private config: Config,
    private mediaStore: MediaStore,
    private log: Logger
  ) {}

  /** Build an account's stores + poller (not started) from a session. */
  private build(session: Session): Account {
    const id = session.ilink_bot_id
    const cursor = new CursorStore(statePath(this.config.stateDir, id, "sync"), this.log)
    const contextTokens = new ContextTokenStore(
      statePath(this.config.stateDir, id, "context-tokens"),
      this.log
    )
    const conversations = new ConversationStore(
      messagesDbPath(this.config.stateDir, id),
      this.log
    )
    const webhook = new WebhookDispatcher(id, this.config.webhookMaxAttempts, this.log)
    if (this.config.webhookUrl) webhook.set(this.config.webhookUrl, this.config.webhookSecret)
    cursor.load()
    contextTokens.load()

    const poller = new Poller({
      base: session.baseurl,
      token: session.bot_token,
      botAgent: this.config.botAgent,
      pollTimeoutMs: this.config.pollTimeoutMs,
      cdnBaseUrl: this.config.cdnBaseUrl,
      mediaMaxBytes: this.config.mediaMaxBytes,
      accountId: id,
      cursor,
      contextTokens,
      conversations,
      webhook,
      mediaStore: this.mediaStore,
      log: this.log,
    })

    return { id, session, cursor, contextTokens, conversations, webhook, poller }
  }

  /**
   * Register + start an account. Persists its session. If the account id already
   * exists (e.g. re-scanned), the old one is stopped and replaced.
   */
  async add(session: Session, opts: { persist?: boolean } = {}): Promise<Account> {
    const id = session.ilink_bot_id
    const existing = this.map.get(id)
    if (existing) {
      this.log.info(`accounts: replacing existing account ${id}`)
      await existing.poller.stop()
      existing.conversations.close()
      this.map.delete(id)
    }
    if (opts.persist !== false) saveAccountSession(this.config.stateDir, session)
    const account = this.build(session)
    this.map.set(id, account)
    await account.poller.start()
    this.log.info(`accounts: started ${id} (user=${session.ilink_user_id})`)
    return account
  }

  /**
   * Stop and remove an account. Its session file is always deleted so it won't
   * auto-reload. With `wipe`, its history DB + state files are deleted too
   * (logout keeps history; delete wipes it).
   */
  async remove(id: string, opts: { wipe?: boolean } = {}): Promise<boolean> {
    const a = this.map.get(id)
    if (!a) return false
    await a.poller.stop()
    try {
      await Promise.race([
        notifyStop({
          base: a.session.baseurl,
          token: a.session.bot_token,
          botAgent: this.config.botAgent,
        }),
        new Promise((r) => setTimeout(r, 8000)),
      ])
    } catch (e) {
      this.log.warn(`accounts: notifyStop ${id} failed: ${(e as Error).message}`)
    }
    a.conversations.close()
    this.map.delete(id)

    rmSafe(accountSessionPath(this.config.stateDir, id))
    if (opts.wipe) {
      const db = messagesDbPath(this.config.stateDir, id)
      for (const f of [db, `${db}-wal`, `${db}-shm`]) rmSafe(f)
      rmSafe(statePath(this.config.stateDir, id, "sync"))
      rmSafe(statePath(this.config.stateDir, id, "context-tokens"))
    }
    this.log.info(`accounts: ${opts.wipe ? "deleted" : "logged out"} ${id}`)
    return true
  }

  get(id: string): Account | undefined {
    return this.map.get(id)
  }

  has(id: string): boolean {
    return this.map.has(id)
  }

  list(): Account[] {
    return [...this.map.values()]
  }

  size(): number {
    return this.map.size
  }

  /** The sole account when exactly one is registered (used as the default). */
  soleAccount(): Account | undefined {
    return this.map.size === 1 ? this.map.values().next().value : undefined
  }

  /** Set (or update) an account's friendly name and persist it. */
  setLabel(id: string, label: string): Account | undefined {
    const a = this.map.get(id)
    if (!a) return undefined
    a.session = { ...a.session, label }
    saveAccountSession(this.config.stateDir, a.session)
    this.log.info(`accounts: labelled ${id} = ${JSON.stringify(label)}`)
    return a
  }

  summary(a: Account): AccountSummary {
    const wh = a.webhook.current()
    return {
      id: a.id,
      label: a.session.label ?? null,
      ilink_user_id: a.session.ilink_user_id,
      baseurl: a.session.baseurl,
      poller: a.poller.snapshot(),
      contacts_count: a.contextTokens.size(),
      conversations_count: a.conversations.peerCount(),
      messages_total: a.conversations.totalSize(),
      webhook: wh ? { url: wh.url, has_secret: Boolean(wh.secret) } : null,
    }
  }

  async stopAll(): Promise<void> {
    await Promise.all(this.list().map((a) => a.poller.stop()))
    for (const a of this.list()) a.conversations.close()
  }
}
