/*
 * routes.ts — the HTTP API. Hono app with a single API_KEY (X-API-Key header or
 * ?api_key=). One instance can serve many WeChat accounts; account-scoped
 * endpoints are mounted at BOTH the top level and under /accounts/:accountId/.
 * When exactly one account is registered, the top-level paths default to it;
 * with several, specify /accounts/:id/… or ?account=<id> (or X-Account-Id).
 *
 *   GET    /                       chat web UI (unauthed page; asks for key)
 *   GET    /health
 *   GET    /status                 global overview (all accounts)
 *   GET    /accounts               list accounts
 *   GET    /accounts/:id           one account summary
 *   DELETE /accounts/:id           delete an account (stop + wipe history)
 *   POST   /login/qr               start a QR login; adds the account live
 *   GET    /login/qr?verify_code=  poll login status
 *   GET    /media/:id              serve a media file (shared across accounts)
 *
 *   account-scoped (also under /accounts/:accountId/…):
 *   GET    /contacts
 *   GET    /conversations
 *   POST   /send                   {to?, text}
 *   POST   /send/media             multipart: to?, caption?, file
 *   POST   /webhook  |  DELETE /webhook
 *   POST   /label                  {label} — set a friendly name
 *   POST   /logout                 stop + forget credentials, keep history
 *   GET    /messages?user=&since=&limit=
 */
import fs from "node:fs"
import { Hono, type Context, type Handler } from "hono"
import {
  newClientId,
  sendMessage,
  textItem,
  type IlinkItem,
  type SendMessageResponse,
} from "./ilink-client.js"
import { mediaItemForSend, uploadMedia } from "./media/cdn.js"
import { getMimeFromFilename, mediaTypeForMime, sniffMime } from "./media/mime.js"
import type { Config } from "./config.js"
import type { StoredMedia } from "./conversations.js"
import type { MediaStore } from "./media/store.js"
import type { LoginManager } from "./login.js"
import type { Account, AccountRegistry } from "./accounts.js"
import { CHAT_HTML } from "./ui.js"
import { LabelBody, MessagesQuery, SendBody, WebhookBody } from "./schemas.js"

export interface AppDeps {
  config: Config
  registry: AccountRegistry
  mediaStore: MediaStore
  login: LoginManager
}

const startedAt = Date.now()

export function buildApp(deps: AppDeps): Hono {
  const app = new Hono()

  // ---------- API Key Auth ----------
  const publicPaths = new Set(["/health", "/"])
  app.use("/*", async (c, next) => {
    if (publicPaths.has(c.req.path)) return next()
    const key = c.req.header("X-API-Key") || c.req.query("api_key")
    if (!deps.config.apiKey) return c.json({ error: "API_KEY not configured" }, 500)
    if (key !== deps.config.apiKey) return c.json({ error: "Unauthorized" }, 401)
    await next()
  })

  app.onError((err, c) => {
    console.error(err)
    return c.json({ error: err.message }, 500)
  })

  /** Mount an account-scoped handler at both /<path> and /accounts/:accountId/<path>. */
  const scoped = (method: "GET" | "POST" | "DELETE", path: string, h: Handler) => {
    app.on(method, path, h)
    app.on(method, `/accounts/:accountId${path}`, h)
  }

  // ---------- chat web UI ----------
  app.get("/", (c) => c.html(CHAT_HTML))

  // ---------- health ----------
  app.get("/health", (c) =>
    c.json({ status: "ok", uptime_seconds: Math.floor((Date.now() - startedAt) / 1000) })
  )

  // ---------- accounts ----------
  app.get("/accounts", (c) =>
    c.json({ accounts: deps.registry.list().map((a) => deps.registry.summary(a)) })
  )

  app.get("/status", (c) =>
    c.json({
      uptime_seconds: Math.floor((Date.now() - startedAt) / 1000),
      accounts_count: deps.registry.size(),
      accounts: deps.registry.list().map((a) => deps.registry.summary(a)),
    })
  )

  app.get("/accounts/:accountId", (c) => {
    const acc = resolveAccount(c, deps)
    if (!acc.ok) return acc.response
    return c.json(deps.registry.summary(acc.account))
  })

  // ---------- contacts (users you can currently send to) ----------
  scoped("GET", "/contacts", (c) => {
    const acc = resolveAccount(c, deps)
    if (!acc.ok) return acc.response
    return c.json({ contacts: acc.account.contextTokens.list() })
  })

  // ---------- conversations (per-user history summary) ----------
  scoped("GET", "/conversations", (c) => {
    const acc = resolveAccount(c, deps)
    if (!acc.ok) return acc.response
    return c.json({ conversations: acc.account.conversations.conversations() })
  })

  // ---------- send text ----------
  scoped("POST", "/send", async (c) => {
    const acc = resolveAccount(c, deps)
    if (!acc.ok) return acc.response
    const account = acc.account
    const parsed = SendBody.safeParse(await c.req.json().catch(() => ({})))
    if (!parsed.success) {
      return c.json({ error: "invalid_request", issues: parsed.error.issues }, 400)
    }
    const to = parsed.data.to ?? account.session.ilink_user_id
    const r = resolveSend(c, account, to)
    if (!r.ok) return r.response
    const clientId = newClientId()
    try {
      const resp = await sendMessage({
        base: account.session.baseurl,
        token: account.session.bot_token,
        toUserId: to,
        itemList: [textItem(parsed.data.text)],
        contextToken: r.contextToken,
        clientId,
        botAgent: deps.config.botAgent,
      })
      if (resp.ret !== undefined && resp.ret !== 0) return upstreamError(c, resp, to)
      account.poller.setLastOutbound()
      account.conversations.recordOutbound({
        to,
        text: parsed.data.text,
        media: null,
        message_id: resp.message_id != null ? String(resp.message_id) : null,
      })
      return c.json({ ok: true, account: account.id, to, client_id: clientId, message_id: resp.message_id ?? null })
    } catch (e) {
      return c.json({ error: "send_failed", detail: (e as Error).message }, 500)
    }
  })

  // ---------- send media ----------
  scoped("POST", "/send/media", async (c) => {
    const acc = resolveAccount(c, deps)
    if (!acc.ok) return acc.response
    const account = acc.account
    const body = await c.req.parseBody()
    const file = body["file"]
    if (!file || !(file instanceof File)) {
      return c.json({ error: "file (multipart field 'file') is required" }, 400)
    }
    const to = (body["to"] as string) || account.session.ilink_user_id
    const caption = (body["caption"] as string) || ""

    const r = resolveSend(c, account, to)
    if (!r.ok) return r.response

    const buf = Buffer.from(await file.arrayBuffer())
    const mime = sniffMime(buf) || getMimeFromFilename(file.name)
    const mediaType = mediaTypeForMime(mime)

    let uploaded
    try {
      uploaded = await uploadMedia({
        base: account.session.baseurl,
        token: account.session.bot_token,
        botAgent: deps.config.botAgent,
        cdnBaseUrl: deps.config.cdnBaseUrl,
        plaintext: buf,
        toUserId: to,
        mediaType,
      })
    } catch (e) {
      return c.json({ error: "media_upload_failed", detail: (e as Error).message }, 502)
    }
    const item = mediaItemForSend(mediaType, uploaded, file.name)

    const sendCommon = {
      base: account.session.baseurl,
      token: account.session.bot_token,
      toUserId: to,
      contextToken: r.contextToken,
      botAgent: deps.config.botAgent,
    }
    const kind = (["image", "video", "file"] as const)[mediaType - 1]
    const message_ids: string[] = []
    try {
      if (caption) {
        const cap = await sendMessage({ ...sendCommon, itemList: [textItem(caption)], clientId: newClientId() })
        if (cap.ret !== undefined && cap.ret !== 0) return upstreamError(c, cap, to)
        if (cap.message_id) message_ids.push(cap.message_id)
        account.conversations.recordOutbound({
          to,
          text: caption,
          media: null,
          message_id: cap.message_id != null ? String(cap.message_id) : null,
        })
      }
      const media = await sendMessage({ ...sendCommon, itemList: [item], clientId: newClientId() })
      if (media.ret !== undefined && media.ret !== 0) return upstreamError(c, media, to)
      if (media.message_id) message_ids.push(media.message_id)
      account.poller.setLastOutbound()

      // Persist the sent file too so it shows up in history (mirrors inbound media).
      const saved = deps.mediaStore.save({ buffer: buf, mime, filename: file.name })
      const outMedia: StoredMedia = {
        id: saved.id,
        type: kind,
        mime: saved.mime,
        size: saved.size,
        filename: saved.filename,
        url: `/media/${saved.id}`,
      }
      account.conversations.recordOutbound({
        to,
        text: "",
        media: outMedia,
        message_id: media.message_id != null ? String(media.message_id) : null,
      })

      return c.json({ ok: true, account: account.id, to, media_type: kind, message_ids })
    } catch (e) {
      return c.json({ error: "send_failed", detail: (e as Error).message }, 500)
    }
  })

  // ---------- webhook register / clear ----------
  scoped("POST", "/webhook", async (c) => {
    const acc = resolveAccount(c, deps)
    if (!acc.ok) return acc.response
    const parsed = WebhookBody.safeParse(await c.req.json().catch(() => ({})))
    if (!parsed.success) {
      return c.json({ error: "invalid_request", issues: parsed.error.issues }, 400)
    }
    acc.account.webhook.set(parsed.data.url, parsed.data.secret ?? null)
    const wh = acc.account.webhook.current()
    return c.json({ ok: true, webhook: { url: wh?.url, has_secret: Boolean(wh?.secret) } })
  })

  scoped("DELETE", "/webhook", (c) => {
    const acc = resolveAccount(c, deps)
    if (!acc.ok) return acc.response
    acc.account.webhook.clear()
    return c.json({ ok: true, webhook: null })
  })

  // ---------- set a friendly name for the account ----------
  scoped("POST", "/label", async (c) => {
    const acc = resolveAccount(c, deps)
    if (!acc.ok) return acc.response
    const parsed = LabelBody.safeParse(await c.req.json().catch(() => ({})))
    if (!parsed.success) {
      return c.json({ error: "invalid_request", issues: parsed.error.issues }, 400)
    }
    deps.registry.setLabel(acc.account.id, parsed.data.label)
    return c.json({ ok: true, account: acc.account.id, label: parsed.data.label })
  })

  // ---------- logout (stop + forget credentials, keep history) ----------
  scoped("POST", "/logout", async (c) => {
    const acc = resolveAccount(c, deps)
    if (!acc.ok) return acc.response
    const id = acc.account.id
    await deps.registry.remove(id, { wipe: false })
    return c.json({ ok: true, account: id, action: "logout" })
  })

  // ---------- delete (logout + wipe history + state) ----------
  app.delete("/accounts/:accountId", async (c) => {
    const acc = resolveAccount(c, deps)
    if (!acc.ok) return acc.response
    const id = acc.account.id
    await deps.registry.remove(id, { wipe: true })
    return c.json({ ok: true, account: id, action: "deleted" })
  })

  // ---------- QR login (adds/replaces an account live — no restart) ----------
  app.post("/login/qr", async (c) => {
    try {
      return c.json({ ok: true, ...(await deps.login.start()) })
    } catch (e) {
      return c.json({ error: "login_start_failed", detail: (e as Error).message }, 502)
    }
  })

  app.get("/login/qr", async (c) => {
    try {
      const verify = c.req.query("verify_code") || undefined
      return c.json(await deps.login.poll(verify))
    } catch (e) {
      return c.json({ error: "login_poll_failed", detail: (e as Error).message }, 502)
    }
  })

  // ---------- poll message history ----------
  // ?user=<id> isolates one conversation; omit it for the merged global feed.
  scoped("GET", "/messages", (c) => {
    const acc = resolveAccount(c, deps)
    if (!acc.ok) return acc.response
    const q = MessagesQuery.safeParse({
      user: c.req.query("user"),
      since: c.req.query("since"),
      limit: c.req.query("limit"),
    })
    if (!q.success) return c.json({ error: "invalid_request", issues: q.error.issues }, 400)
    return c.json(acc.account.conversations.history(q.data.user, q.data.since, q.data.limit))
  })

  // ---------- serve media (shared across accounts; ids are globally unique) ----------
  app.get("/media/:id", (c) => {
    const m = deps.mediaStore.get(c.req.param("id"))
    if (!m) return c.json({ error: "not found" }, 404)
    const data = fs.readFileSync(m.path)
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": m.mime,
        "Content-Length": String(m.size),
        "Cache-Control": "private, max-age=3600",
      },
    })
  })

  return app
}

// ---------- helpers ----------

type AccountResult = { ok: true; account: Account } | { ok: false; response: Response }

/** Pick the target account: path param > ?account= > X-Account-Id > sole account. */
function resolveAccount(c: Context, deps: AppDeps): AccountResult {
  const id = c.req.param("accountId") || c.req.query("account") || c.req.header("X-Account-Id")
  if (id) {
    const a = deps.registry.get(id)
    if (!a) {
      return {
        ok: false,
        response: c.json(
          { error: "unknown_account", account: id, accounts: deps.registry.list().map((x) => x.id) },
          404
        ),
      }
    }
    return { ok: true, account: a }
  }
  const sole = deps.registry.soleAccount()
  if (sole) return { ok: true, account: sole }
  if (deps.registry.size() === 0) {
    return {
      ok: false,
      response: c.json(
        { error: "no_accounts", message: "no account yet — scan a QR at POST /login/qr" },
        409
      ),
    }
  }
  return {
    ok: false,
    response: c.json(
      {
        error: "account_required",
        message: "multiple accounts registered — use /accounts/:id/… or ?account=<id>",
        accounts: deps.registry.list().map((x) => x.id),
      },
      400
    ),
  }
}

type ResolveResult = { ok: true; contextToken: string } | { ok: false; response: Response }

function resolveSend(c: Context, account: Account, to: string): ResolveResult {
  if (account.poller.isPausedFor14()) {
    return { ok: false, response: c.json({ error: "session_paused" }, 503) }
  }
  const entry = account.contextTokens.get(to)
  if (!entry) {
    return {
      ok: false,
      response: c.json(
        {
          error: "no_context_token",
          to,
          message: "user must message the bot first so a context_token can be cached",
        },
        409
      ),
    }
  }
  return { ok: true, contextToken: entry.token }
}

function upstreamError(c: Context, resp: SendMessageResponse, to: string): Response {
  const body: Record<string, unknown> = {
    error: "upstream_error",
    to,
    ret: resp.ret,
    errmsg: resp.errmsg,
  }
  if (resp.ret === -2) body["meaning"] = "missing_or_stale_context_token"
  return c.json(body, 502)
}

// satisfy the unused-import linter for item types referenced only in signatures
export type { IlinkItem }
