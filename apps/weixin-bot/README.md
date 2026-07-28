# weixin-bot-service

A long-running HTTP service that wraps the Tencent iLink WeChat **bot** protocol
and exposes it as a small REST API. Point any program at it to **send and receive
WeChat text + media** without touching the underlying iLink long-poll, context
tokens, or media CDN encryption.

The connection model is **bot subscription, not account hijack**: a user scans a
QR once to subscribe to the bot, and from then on they can exchange messages with
it. Your programs talk to this service; this service talks to WeChat.

- Base URL (default): `http://localhost:47890`
- Content type: `application/json` (except media upload, which is `multipart/form-data`)
- One shared API key guards every endpoint (see [Authentication](#authentication)).
- **One instance can serve many WeChat accounts** at once (see [Accounts](#accounts)).

---

## Quick start

Requires **Node ≥ 23.4** (uses the built-in `node:sqlite`; no native deps).

```bash
cp .env.example .env          # then set API_KEY to a long random string
npm install
npm run dev                   # or: npm run build && npm start
```

It reuses an existing `~/.openclaw-poc/session.json` if present (migrated into the
new `sessions/` layout on first boot). With **no** account yet, the service still
starts — open the web UI at `GET /`, click 📷, and scan a QR to add one (no
restart needed). You can add more accounts the same way at any time.

A browser chat UI is served at `GET /` (see [Web UI](#web-ui)). Everything below
is for calling the service **from code**.

---

## Authentication

Every endpoint except `GET /` (the web UI) and `GET /health` requires the API key,
supplied either way:

```
X-API-Key: <API_KEY>          # header (preferred)
?api_key=<API_KEY>            # query param (for <img>/<video> or quick tests)
```

A missing/incorrect key returns `401 {"error":"Unauthorized"}`. If the server has
no `API_KEY` configured at all it returns `500`.

---

## Accounts

Each WeChat account this instance serves has its **own** poller, contact list, and
message history (its own SQLite DB); they are fully isolated. The protocol does not
expose a nickname, so each account carries a user-assigned **label** (friendly
name) — set it with `POST /accounts/:id/label {"label": "…"}`. `GET /accounts`
lists them:

```
GET /accounts
→ { "accounts": [
     { "id": "f1b4…@im.bot", "label": "工作号", "ilink_user_id": "o9cq…@im.wechat",
       "poller": { "state": "RUNNING", … }, "contacts_count": 1,
       "conversations_count": 3, "messages_total": 128, "webhook": null } ] }
```

Every account-scoped endpoint (`/send`, `/messages`, `/contacts`, `/conversations`,
`/webhook`) can be addressed three ways:

```
/accounts/<accountId>/send          # explicit path (recommended)
/send?account=<accountId>           # query param
/send   + header  X-Account-Id: <accountId>
```

If you omit the account **and exactly one is registered**, it is used by default
(so single-account setups need no account id). With several registered, an
un-scoped call returns **`400 account_required`** listing the account ids; an
unknown id returns **`404 unknown_account`**.

Add an account by scanning a QR — see [Re-authenticating](#re-authenticating-loginqr);
it goes live immediately, no restart. Sessions are stored one file per account at
`<state>/sessions/<accountId>.json`.

Remove an account two ways:

```
POST   /accounts/:id/logout   # stop + delete its session (won't reload); KEEP history
DELETE /accounts/:id          # logout + WIPE its history DB and state files
```

Both stop the poller and `notifyStop` upstream. **Logout** forgets the credentials
but leaves the SQLite history on disk (re-scan the same account later and its
history is still there); **delete** also wipes the history and state. `/logout` is
account-scoped (defaults to the sole account); delete always needs an explicit id.

---

## Web UI

`GET /` serves a self-contained chat page (no build step, no external assets) for
manual use and testing. Enter the API key once (kept in `localStorage`), then:

- **Switch accounts** from the top dropdown (shows each account's label); the
  status dot reflects that account's poller state.
- **Chat** with a contact per-account: live-polls history, sends text (Enter) and
  images/files (＋), renders inbound/outbound bubbles by direction.
- **📷 add an account** — shows a scannable QR, handles the pairing code, and
  prompts for a friendly name; the account goes live with no restart.
- **✎ rename**, **⏻ log out** (keep history), **🗑 delete** (wipe history) the
  current account.
- With **no accounts**, a welcome screen invites you to scan the first one.

---

## The one rule you must know: context tokens

WeChat's bot protocol will **not** let the bot message a user out of the blue. A
user must send the bot a message **first**; the service caches the `context_token`
from that inbound message, and only then can you send to that user.

- Before any inbound message from user `U`, `POST /send {to: U}` returns
  **`409 no_context_token`**.
- `GET /contacts` lists exactly the users you can currently send to.
- If you omit `to`, the service targets that account's own WeChat (its
  `ilink_user_id`, shown in the account summary) — useful for a personal
  notification bot, but that user must still have messaged the bot at least once.

Tokens can also go stale server-side; see [Recovery & failure modes](#recovery--failure-modes).

---

## Receiving messages

Two independent mechanisms — use either or both.

### Option A — Poll `GET /messages`

Message history is stored **per user in SQLite** (`node:sqlite`, at
`<state>/<accountId>.messages.db`) and **survives restarts**. Both inbound and
outbound messages are recorded, each tagged with a `direction` and the `user`
(peer) it belongs to. Poll with a monotonic cursor, optionally scoped to one user:

```
GET /messages?user=<userId>&since=<cursor>&limit=<1..1000>
# user  optional — omit for the merged global feed across all users
# since default 0, limit default 100
```

```jsonc
{
  "messages": [
    {
      "seq": 42,                       // global monotonic cursor (never reused)
      "user": "o9cq…@im.wechat",       // the peer this message belongs to
      "direction": "in",               // "in" = user->bot, "out" = bot->user
      "message_id": "…",              // may be null (getupdates omits it sometimes)
      "text": "hello",                 // "" if the message was media-only
      "media": null,                    // or a media object, see below
      "timestamp": 1784441851363,       // event time (ms)
      "received_at": 1784450025224      // when this service recorded it (ms)
    }
  ],
  "next_cursor": 42,
  "has_more": false
}
```

**Per-user isolation:** pass `?user=<id>` to get exactly one conversation — one
user's messages are never mixed into or evicted by another's. `GET /conversations`
lists every user with a history (message count, last message, last activity):

```
GET /conversations
→ { "conversations": [
     { "user": "o9cq…@im.wechat", "message_count": 12, "last_at": 1784…,
       "last_direction": "out", "last_text": "…" } ] }
```

Loop: start at `since=0`, then pass the returned `next_cursor` as the next
`since`. Keep polling while `has_more` is true to catch up quickly, otherwise poll
on an interval. Inbound messages are de-duplicated, so a given `seq` is delivered
once. Because history is persisted, `since=0` replays a user's full stored thread.

### Option B — Webhook push

Register a URL and the service POSTs each inbound message to it, at-least-once,
with bounded exponential backoff (up to `WEBHOOK_MAX_ATTEMPTS`, default 5; 4xx
responses are treated as permanent and not retried).

```
POST /webhook     {"url": "https://you.example.com/hook", "secret": "optional"}
DELETE /webhook                                   # stop delivery
```

You can also pre-register at boot via `WEBHOOK_URL` / `WEBHOOK_SECRET`.

Each delivery is an HTTP POST with headers:

```
Content-Type: application/json
X-Weixin-Event: message
X-Weixin-Signature: t=<unix_ts>,v1=<hex>          # or "none" when no secret set
```

and body:

```json
{ "type": "message",
  "account": "f1b4…@im.bot",
  "data": { /* same message object as GET /messages */ } }
```

`account` is the bot account the message belongs to (so one webhook endpoint can
serve several accounts); `data.user` is the peer.

**Verify the signature** (Stripe-style HMAC): `v1 = HMAC_SHA256(secret, "<t>.<raw_body>")`.

```js
import crypto from "node:crypto";
function verify(rawBody, header, secret) {
  const { t, v1 } = Object.fromEntries(header.split(",").map(kv => kv.split("=")));
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected));
}
```

Return a `2xx` quickly to acknowledge. Anything else (or a timeout at 15s) is
retried. Because delivery is at-least-once, make your handler idempotent on
`data.seq` (or `data.message_id` when present).

---

## Sending messages

### Text — `POST /send`

```jsonc
// request
{ "to": "o9cq…@im.wechat",   // optional; defaults to the account owner
  "text": "hello world" }     // required, non-empty
```

```jsonc
// 200
{ "ok": true, "account": "f1b4…@im.bot", "to": "o9cq…@im.wechat",
  "client_id": "wbs-…", "message_id": 7484… }
```

### Media — `POST /send/media` (multipart/form-data)

Fields: `file` (required), `to` (optional), `caption` (optional text sent as a
separate message before the media). The MIME type is sniffed from the bytes (then
the filename) and mapped to image / video / file automatically.

```bash
curl -X POST http://localhost:47890/send/media \
  -H "X-API-Key: $API_KEY" \
  -F "to=o9cq…@im.wechat" \
  -F "caption=here you go" \
  -F "file=@/path/to/photo.jpg"
```

```jsonc
// 200
{ "ok": true, "account": "f1b4…@im.bot", "to": "o9cq…@im.wechat",
  "media_type": "image", "message_ids": ["…","…"] }
```

---

## Media objects & downloading inbound media

When an inbound message carries media, its `media` field looks like:

```jsonc
{
  "id": "…",                 // opaque id
  "type": "image",            // "image" | "video" | "file"
  "mime": "image/jpeg",
  "size": 20480,              // decrypted bytes
  "filename": "photo.jpg",    // best-effort
  "url": "/media/…"           // fetch this to get the bytes
}
```

The service has already downloaded and decrypted the file. Fetch the raw bytes:

```
GET /media/:id                # returns the binary with the correct Content-Type
```

This endpoint needs the API key too. For `<img>`/`<video>` tags that can't send a
header, append `?api_key=<API_KEY>` to `media.url`.

---

## Introspection

```
GET /health      → { "status": "ok", "uptime_seconds": 123 }   // no auth
GET /status      → { "uptime_seconds", "accounts_count", "accounts": [ … ] }
GET /accounts    → { "accounts": [ … ] }   // one summary per account (see Accounts)
GET /accounts/:id → a single account summary
GET /contacts    → { "contacts": [ { "user_id": "…", "last_seen_at": "ISO" } ] }
```

Each account summary carries its live poller state:

```jsonc
{
  "id": "f1b4…@im.bot",
  "label": "工作号",                     // user-assigned name, or null
  "ilink_user_id": "o9cq…@im.wechat",   // the account owner ("you")
  "baseurl": "https://ilinkai.weixin.qq.com",
  "poller": {
    "state": "RUNNING",                  // IDLE|RUNNING|BACKOFF|PAUSED_14|STOPPED
    "paused_remaining_ms": 0,
    "consecutive_failures": 0,
    "last_inbound_at": "2026-07-19T08:33:45.224Z",
    "last_outbound_at": null
  },
  "contacts_count": 1,                  // users you can send to (have a context token)
  "conversations_count": 3,             // users with stored history
  "messages_total": 128,                // total messages stored
  "webhook": { "url": "…", "has_secret": true }   // or null
}
```

---

## Recovery & failure modes

- **`409 no_context_token`** on send — the target user hasn't messaged the bot
  yet (or their token was evicted). Wait for an inbound message from them.
- **`503 session_paused`** on send — that account's token went stale
  (upstream `ret=-14`); its poller pauses ~1h and blocks outbound (other accounts
  are unaffected). Re-scan its QR (📷 / `POST /login/qr`) to recover — it goes live
  without a restart. The account summary shows `poller.state = "PAUSED_14"`.
- **`502 upstream_error`** on send — WeChat rejected the call; the body includes
  `ret` / `errmsg`. `ret=-2` means a missing/stale context token specifically.

### Re-authenticating (`/login/qr`)

Bootstraps or refreshes a WeChat session without leaving the service.
**Easiest: open the web UI at `/` and click the 📷 button** — it shows a scannable
QR, handles the pairing-code step, prompts for a name, and brings the account
online (no restart).

Programmatically, since scanning happens out of band, it's two calls:

```
POST /login/qr    → { "ok": true, "qr_svg": "<svg>", "qrcode_img_content": "<url>", ... }
GET  /login/qr    → poll status; pass ?verify_code=<n> when asked
```

Render `qr_svg` directly (or encode `qrcode_img_content` yourself), scan it in
WeChat, then poll `GET /login/qr` until `status` is `confirmed`. Statuses:
`wait` → `scaned` → possibly `need_verifycode` (poll again with `?verify_code=`)
→ `expired` (a fresh `qr_svg` is returned; re-render) → `confirmed`. On `confirmed`
the account **goes live immediately — no restart** (its session is persisted and a
poller starts). Scanning a **new** account adds it alongside the others; scanning
an **existing** account id refreshes that account in place.

---

## Endpoint reference

Account-scoped rows (marked ✳) are also available under `/accounts/:accountId/…`
and accept `?account=` / `X-Account-Id`; unscoped, they default to the sole account.

| Method | Path | Auth | Scope | Purpose |
|---|---|---|---|---|
| GET | `/` | no | — | Chat web UI (manual testing) |
| GET | `/health` | no | — | Liveness probe |
| GET | `/status` | yes | global | Uptime + all account summaries |
| GET | `/accounts` | yes | global | List accounts |
| GET | `/accounts/:id` | yes | one | Single account summary |
| DELETE | `/accounts/:id` | yes | one | Delete account (stop + wipe history) |
| POST | `/label` | yes | ✳ | Set a friendly name `{label}` |
| POST | `/logout` | yes | ✳ | Log out account (stop + keep history) |
| GET | `/contacts` | yes | ✳ | Users you can currently send to |
| GET | `/conversations` | yes | ✳ | Per-user history summary |
| POST | `/send` | yes | ✳ | Send text |
| POST | `/send/media` | yes | ✳ | Send image/video/file (multipart) |
| GET | `/messages` | yes | ✳ | Poll history; `?user=` isolates one conversation |
| GET | `/media/:id` | yes | global | Download a decrypted media file |
| POST | `/webhook` | yes | ✳ | Register inbound push target |
| DELETE | `/webhook` | yes | ✳ | Clear push target |
| POST | `/login/qr` | yes | global | Start a QR login (adds/refreshes an account) |
| GET | `/login/qr` | yes | global | Poll login status |

### Error shape

Errors are JSON with an `error` field and an appropriate status code:

| Status | `error` | When |
|---|---|---|
| 400 | `invalid_request` | Body failed validation (`issues` included) |
| 401 | `Unauthorized` | Missing/incorrect API key |
| 400 | `account_required` | Several accounts registered; specify which (`accounts` listed) |
| 404 | `unknown_account` | No account with that id (`accounts` listed) |
| 409 | `no_accounts` | No account registered yet — scan a QR at `/login/qr` |
| 409 | `no_context_token` | Target user hasn't messaged the bot yet |
| 502 | `upstream_error` | WeChat rejected the call (`ret`/`errmsg` included) |
| 502 | `media_upload_failed` | Media CDN upload failed |
| 503 | `session_paused` | Bot session token stale; outbound blocked |
| 500 | `send_failed` | Unexpected send error (`detail` included) |

---

## End-to-end example (Node.js)

A minimal echo bot: receive via webhook, reply via `/send`.

```js
import express from "express";
import crypto from "node:crypto";

const BASE = "http://localhost:47890";
const API_KEY = process.env.API_KEY;
const HOOK_SECRET = process.env.HOOK_SECRET;

// 1) Register our webhook with the service.
await fetch(`${BASE}/webhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-API-Key": API_KEY },
  body: JSON.stringify({ url: "http://localhost:4000/hook", secret: HOOK_SECRET }),
});

// 2) Receive inbound and echo it back.
const app = express();
app.use(express.text({ type: "*/*" })); // need the raw body to verify the signature
app.post("/hook", async (req, res) => {
  const [t, v1] = req.get("X-Weixin-Signature").split(",").map(kv => kv.split("=")[1]);
  const expected = crypto.createHmac("sha256", HOOK_SECRET).update(`${t}.${req.body}`).digest("hex");
  if (v1 !== expected) return res.sendStatus(401);

  const { account, data } = JSON.parse(req.body); // data.user is the peer
  res.sendStatus(200); // ack fast

  if (data.text) {
    await fetch(`${BASE}/accounts/${account}/send`, {   // reply on the same account
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": API_KEY },
      body: JSON.stringify({ to: data.user, text: `echo: ${data.text}` }),
    });
  }
});
app.listen(4000);
```

Or, without a public URL, just poll:

```js
let cursor = 0;
for (;;) {
  const r = await fetch(`${BASE}/messages?since=${cursor}`, { headers: { "X-API-Key": API_KEY } });
  const { messages, next_cursor } = await r.json();
  for (const m of messages) console.log(m.direction, m.user, m.text, m.media?.url ?? "");
  cursor = next_cursor;
  await new Promise(r => setTimeout(r, 2000));
}
```

> These snippets omit the account id, so they target the sole account. With more
> than one account, scope the calls: `/accounts/<id>/send`, `/accounts/<id>/messages`,
> `/accounts/<id>/webhook`. One webhook endpoint can serve several accounts — each
> delivery carries `account` (the bot) and `data.user` (the peer).

---

## Configuration

All via environment (see `.env.example`):

| Var | Default | Meaning |
|---|---|---|
| `PORT` | `47890` | HTTP port |
| `API_KEY` | — | **Required.** Shared key for all endpoints |
| `WEIXIN_STATE_DIR` | `~/.openclaw-poc` | State dir (`sessions/`, tokens, SQLite history, media) |
| `WEIXIN_SESSION_FILE` | `<state>/session.json` | Legacy single-session file, migrated into `sessions/` on first boot |
| `BOT_AGENT` | `weixin-bot-service` | `bot_agent` sent on every protocol call |
| `WEBHOOK_URL` / `WEBHOOK_SECRET` | — | Pre-register a webhook on every account at boot |
| `WEBHOOK_MAX_ATTEMPTS` | `5` | Webhook delivery attempts before giving up |
| `POLL_TIMEOUT_MS` | `35000` | Long-poll timeout (server may override) |
| `WEIXIN_MEDIA_MAX_BYTES` | `104857600` | Max inbound media size to download |
| `LOG_LEVEL` | `info` | `debug`\|`info`\|`warn`\|`error` |
