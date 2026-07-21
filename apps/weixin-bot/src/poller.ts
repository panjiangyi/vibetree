/*
 * poller.ts — the permanent getupdates long-poll loop. Keeps the bot session
 * warm, caches per-user context_tokens on inbound, and fans each inbound
 * message out to the ring buffer (GET /messages) + webhook. Downloads + decrypts
 * inbound media. State machine: IDLE -> RUNNING ⇄ BACKOFF ⇄ PAUSED_14 -> STOPPED.
 */
import {
  getUpdates,
  notifyStart,
  ITEM_TYPE_TEXT,
  ITEM_TYPE_IMAGE,
  ITEM_TYPE_VIDEO,
  ITEM_TYPE_FILE,
  MESSAGE_TYPE_BOT,
  type IlinkMessage,
  type InboundItem,
} from "./ilink-client.js"
import type { CursorStore } from "./cursor.js"
import type { ContextTokenStore } from "./context-tokens.js"
import type { ConversationStore, InboundPayload, StoredMedia } from "./conversations.js"
import type { WebhookDispatcher } from "./webhook.js"
import type { MediaStore } from "./media/store.js"
import { downloadAndDecrypt } from "./media/cdn.js"
import { getMimeFromFilename, sniffMime } from "./media/mime.js"
import type { Logger } from "./logger.js"

const STALE_TOKEN_ERRCODE = -14
const PAUSE_MS = 60 * 60 * 1000
const MAX_CONSECUTIVE_FAILURES = 3
const BACKOFF_MS = 30_000
const RETRY_MS = 2_000

export type PollerState = "IDLE" | "RUNNING" | "BACKOFF" | "PAUSED_14" | "STOPPED"

export interface PollerSnapshot {
  state: PollerState
  paused_remaining_ms: number
  consecutive_failures: number
  last_inbound_at: string | null
  last_outbound_at: string | null
}

export interface PollerDeps {
  base: string
  token: string
  botAgent: string
  pollTimeoutMs: number
  cdnBaseUrl: string
  mediaMaxBytes: number
  accountId: string
  cursor: CursorStore
  contextTokens: ContextTokenStore
  conversations: ConversationStore
  webhook: WebhookDispatcher
  mediaStore: MediaStore
  log: Logger
}

function hasMedia(i: InboundItem): boolean {
  const m = i.image_item?.media || i.video_item?.media || i.file_item?.media
  return Boolean(m && (m.encrypt_query_param || m.full_url))
}

export class Poller {
  private state: PollerState = "IDLE"
  private aborted = false
  private currentAbort: AbortController | null = null
  private consecutiveFailures = 0
  private longpollMs: number
  private pausedUntil = 0
  private lastInboundAt: string | null = null
  private lastOutboundAt: string | null = null
  private loopDone: (() => void) | null = null

  constructor(private deps: PollerDeps) {
    this.longpollMs = deps.pollTimeoutMs
  }

  snapshot(): PollerSnapshot {
    return {
      state: this.state,
      paused_remaining_ms:
        this.state === "PAUSED_14" ? Math.max(0, this.pausedUntil - Date.now()) : 0,
      consecutive_failures: this.consecutiveFailures,
      last_inbound_at: this.lastInboundAt,
      last_outbound_at: this.lastOutboundAt,
    }
  }

  isPausedFor14(): boolean {
    return this.state === "PAUSED_14" && Date.now() < this.pausedUntil
  }

  setLastOutbound(): void {
    this.lastOutboundAt = new Date().toISOString()
  }

  async start(): Promise<void> {
    const { log } = this.deps
    log.info("poller: notifyStart")
    try {
      await notifyStart({
        base: this.deps.base,
        token: this.deps.token,
        botAgent: this.deps.botAgent,
      })
    } catch (e) {
      log.warn("poller: notifyStart failed (continuing):", (e as Error).message)
    }
    this.state = "RUNNING"
    void this.run().catch((e) => log.error("poller crashed:", e))
  }

  private async run(): Promise<void> {
    const { log, base, token, botAgent, cursor } = this.deps
    while (!this.aborted) {
      if (this.pausedUntil && Date.now() < this.pausedUntil) {
        this.state = "PAUSED_14"
        await this.sleepInterruptible(1000)
        continue
      }
      this.state = "RUNNING"
      this.currentAbort = new AbortController()

      let resp
      try {
        resp = await getUpdates({
          base,
          token,
          botAgent,
          getUpdatesBuf: cursor.get(),
          timeoutMs: this.longpollMs + 5000,
          signal: this.currentAbort.signal,
        })
      } catch (e) {
        if (this.aborted) break
        if ((e as Error).name === "AbortError") {
          // synthetic no-op success — don't touch cursor, don't count failure
          continue
        }
        log.warn("poller: getUpdates error:", (e as Error).message)
        await this.backoff()
        if (this.aborted) break
        continue
      }
      if (this.aborted) break

      // stale token -> pause 1h
      if (resp.ret === STALE_TOKEN_ERRCODE || resp.errcode === STALE_TOKEN_ERRCODE) {
        log.error(
          `poller: stale token (ret=${resp.ret} errcode=${resp.errcode}). Pausing 1h; outbound blocked. Recover via \`poc.mjs login\` + restart.`
        )
        this.pausedUntil = Date.now() + PAUSE_MS
        this.consecutiveFailures = 0
        continue
      }

      const apiErr =
        (resp.ret !== undefined && resp.ret !== 0) ||
        (resp.errcode !== undefined && resp.errcode !== 0)
      if (apiErr) {
        log.warn(
          `poller: getUpdates ret=${resp.ret} errcode=${resp.errcode} errmsg=${resp.errmsg ?? ""}`
        )
        await this.backoff()
        if (this.aborted) break
        continue
      }

      // success
      this.consecutiveFailures = 0
      if (resp.longpolling_timeout_ms && resp.longpolling_timeout_ms > 0) {
        this.longpollMs = resp.longpolling_timeout_ms
      }
      if (resp.get_updates_buf && resp.get_updates_buf.length > 0) {
        cursor.set(resp.get_updates_buf)
      }
      for (const msg of resp.msgs || []) {
        if (this.aborted) break
        await this.processMessage(msg)
      }
    }
    this.state = "STOPPED"
    log.info("poller: exited")
    if (this.loopDone) this.loopDone()
  }

  private async processMessage(msg: IlinkMessage): Promise<void> {
    const { log, accountId, contextTokens, conversations, webhook } = this.deps
    const from = msg.from_user_id || ""
    if (!from) return
    if (msg.message_type === MESSAGE_TYPE_BOT) return // skip bot-originated echoes

    // Dump the raw inbound so any sender nickname/profile fields (not in our typed
    // subset) are visible under LOG_LEVEL=debug.
    log.debug(`poller: raw inbound = ${JSON.stringify(msg)}`)

    if (msg.context_token) contextTokens.set(accountId, from, msg.context_token)
    this.lastInboundAt = new Date().toISOString()

    let text = ""
    for (const item of msg.item_list || []) {
      if (item.type === ITEM_TYPE_TEXT && item.text_item?.text) {
        text = item.text_item.text
        break
      }
    }

    let media: StoredMedia | null = null
    try {
      media = await this.downloadInboundMedia(msg)
    } catch (e) {
      log.warn(`poller: inbound media download failed from ${from}:`, (e as Error).message)
    }

    if (!text && !media) {
      log.debug(`poller: inbound from ${from} had no text/media; skipping`)
      return
    }

    const payload: InboundPayload = {
      message_id: null,
      from,
      to: msg.to_user_id || accountId,
      text,
      media,
      timestamp: msg.create_time_ms || Date.now(),
    }
    const recorded = conversations.recordInbound(payload)
    log.info(
      `poller: inbound from ${from} text=${
        text ? JSON.stringify(text.slice(0, 40)) : "(none)"
      } media=${media ? media.type : "none"} seq=${recorded.seq}`
    )
    webhook.deliver(recorded)
  }

  private async downloadInboundMedia(msg: IlinkMessage): Promise<StoredMedia | null> {
    const { cdnBaseUrl, mediaMaxBytes, mediaStore } = this.deps
    const items = msg.item_list || []
    const pick =
      items.find((i) => i.type === ITEM_TYPE_IMAGE && hasMedia(i)) ||
      items.find((i) => i.type === ITEM_TYPE_VIDEO && hasMedia(i)) ||
      items.find((i) => i.type === ITEM_TYPE_FILE && hasMedia(i))
    if (!pick) return null

    const kind: "image" | "video" | "file" =
      pick.type === ITEM_TYPE_IMAGE ? "image" : pick.type === ITEM_TYPE_VIDEO ? "video" : "file"

    const container = pick.image_item || pick.video_item || pick.file_item
    if (!container) return null
    const media = container.media
    const plaintext = await downloadAndDecrypt({
      cdnBaseUrl,
      fullUrl: media?.full_url,
      encryptedQueryParam: media?.encrypt_query_param,
      aesKeyBase64: media?.aes_key,
      aesKeyHex: pick.image_item?.aeskey,
      maxBytes: mediaMaxBytes,
    })

    let mime: string
    let filename: string | undefined
    if (kind === "image") {
      mime = sniffMime(plaintext) || "image/png"
    } else if (kind === "video") {
      mime = "video/mp4"
    } else {
      filename = pick.file_item?.file_name || undefined
      mime = filename ? getMimeFromFilename(filename) : "application/octet-stream"
    }

    const saved = mediaStore.save({ buffer: plaintext, mime, filename })
    return {
      id: saved.id,
      type: kind,
      mime: saved.mime,
      size: saved.size,
      filename: saved.filename,
      url: `/media/${saved.id}`,
    }
  }

  private async backoff(): Promise<void> {
    this.consecutiveFailures += 1
    this.state = "BACKOFF"
    const reachedMax = this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES
    const ms = reachedMax ? BACKOFF_MS : RETRY_MS
    if (reachedMax) {
      this.deps.log.warn(`poller: ${MAX_CONSECUTIVE_FAILURES} consecutive failures; sleeping ${ms}ms`)
      this.consecutiveFailures = 0
    }
    await this.sleepInterruptible(ms)
  }

  private async sleepInterruptible(ms: number): Promise<void> {
    const deadline = Date.now() + ms
    while (Date.now() < deadline) {
      if (this.aborted) return
      const step = Math.min(500, Math.max(0, deadline - Date.now()))
      await new Promise((r) => setTimeout(r, step))
    }
  }

  async stop(): Promise<void> {
    if (this.state === "STOPPED") return
    this.aborted = true
    this.currentAbort?.abort()
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, 5000)
      this.loopDone = () => {
        clearTimeout(t)
        resolve()
      }
    })
  }
}
