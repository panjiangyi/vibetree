/*
 * webhook.ts — register an inbound webhook target and deliver each inbound
 * message at-least-once with a Stripe-style HMAC signature and bounded backoff.
 * Delivery is fire-and-forget (never blocks the poller); drain() on shutdown.
 */
import crypto from "node:crypto"
import type { Logger } from "./logger.js"
import type { ConversationMessage } from "./conversations.js"

export interface WebhookConfig {
  url: string
  secret: string | null
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export class WebhookDispatcher {
  private cfg: WebhookConfig | null = null
  private inFlight = new Set<Promise<void>>()
  constructor(
    private accountId: string,
    private maxAttempts: number,
    private log: Logger
  ) {}

  set(url: string, secret: string | null): void {
    this.cfg = { url, secret }
    this.log.info(`webhook: registered ${url} (secret: ${secret ? "yes" : "no"})`)
  }

  clear(): void {
    this.cfg = null
    this.log.info("webhook: cleared")
  }

  current(): WebhookConfig | null {
    return this.cfg
  }

  deliver(msg: ConversationMessage): void {
    if (!this.cfg) return
    const cfg = this.cfg
    const body = JSON.stringify({ type: "message", account: this.accountId, data: msg })
    const p = this.deliverWithRetry(cfg, body).catch((e) => {
      this.log.warn(`webhook: gave up delivering msg seq=${msg.seq}: ${(e as Error).message}`)
    })
    this.inFlight.add(p)
    p.finally(() => this.inFlight.delete(p))
  }

  async drain(timeoutMs: number): Promise<void> {
    const all = [...this.inFlight]
    if (all.length === 0) return
    await Promise.race([Promise.allSettled(all), sleep(timeoutMs)])
  }

  private async deliverWithRetry(cfg: WebhookConfig, body: string): Promise<void> {
    let attempt = 0
    let lastErr: unknown = null
    while (attempt < this.maxAttempts) {
      attempt += 1
      try {
        const ts = Math.floor(Date.now() / 1000)
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "X-Weixin-Event": "message",
        }
        if (cfg.secret) {
          const sig = crypto.createHmac("sha256", cfg.secret).update(`${ts}.${body}`).digest("hex")
          headers["X-Weixin-Signature"] = `t=${ts},v1=${sig}`
        } else {
          headers["X-Weixin-Signature"] = "none"
        }
        const res = await fetch(cfg.url, {
          method: "POST",
          headers,
          body,
          signal: AbortSignal.timeout(15000),
        })
        if (res.status >= 200 && res.status < 300) {
          this.log.debug(`webhook: delivered (attempt ${attempt}, ${res.status})`)
          return
        }
        lastErr = new Error(`HTTP ${res.status}`)
        if (res.status >= 400 && res.status < 500) {
          this.log.warn(`webhook: client error ${res.status}, not retrying`)
          return
        }
      } catch (e) {
        lastErr = e
      }
      if (attempt < this.maxAttempts) {
        const backoff = Math.min(1000 * 2 ** (attempt - 1), 16000)
        await sleep(backoff)
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("webhook delivery failed")
  }
}
