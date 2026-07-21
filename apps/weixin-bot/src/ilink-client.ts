/*
 * ilink-client.ts — Tencent iLink WeChat bot protocol primitives.
 * Lifted from ../openclaw-weixin-poc/poc.mjs (reverse-engineered from
 * @tencent-weixin/openclaw-weixin@2.4.6). Talks only to the control plane
 * https://ilinkai.weixin.qq.com. Media CDN lives in media/.
 */
import crypto from "node:crypto"

export const DEFAULT_BASE = "https://ilinkai.weixin.qq.com"
export const ILINK_APP_ID = "bot"
export const PLUGIN_VERSION = "2.4.6"
export const CLIENT_VERSION =
  ((Number(PLUGIN_VERSION.split(".")[0]) & 0xff) << 16) |
  ((Number(PLUGIN_VERSION.split(".")[1]) & 0xff) << 8) |
  (Number(PLUGIN_VERSION.split(".")[2]) & 0xff)

export const MESSAGE_TYPE_BOT = 2
export const MESSAGE_STATE_FINISH = 2

export const ITEM_TYPE_TEXT = 1
export const ITEM_TYPE_IMAGE = 2
export const ITEM_TYPE_VOICE = 3
export const ITEM_TYPE_FILE = 4
export const ITEM_TYPE_VIDEO = 5

export const UploadMediaType = { IMAGE: 1, VIDEO: 2, FILE: 3, VOICE: 4 } as const

// ---- wire types (subset used by this service) ----
export interface CdnMedia {
  encrypt_query_param?: string
  aes_key?: string
  encrypt_type?: number
  full_url?: string
}
export interface IlinkItem {
  type: number
  text_item?: { text: string }
  image_item?: { media: CdnMedia; mid_size?: number }
  video_item?: { media: CdnMedia; video_size?: number }
  file_item?: { media: CdnMedia; file_name: string; len: string }
}
export interface InboundItem {
  type: number
  text_item?: { text: string }
  image_item?: { media: CdnMedia; aeskey?: string }
  video_item?: { media: CdnMedia }
  file_item?: { media: CdnMedia; file_name?: string }
  voice_item?: { media: CdnMedia; text?: string }
}
export interface IlinkMessage {
  from_user_id?: string
  to_user_id?: string
  context_token?: string
  item_list?: InboundItem[]
  create_time_ms?: number
  message_type?: number
}
export interface GetUpdatesResponse {
  ret?: number
  errcode?: number
  errmsg?: string
  msgs?: IlinkMessage[]
  get_updates_buf?: string
  longpolling_timeout_ms?: number
}
export interface SendMessageResponse {
  ret?: number
  errmsg?: string
  message_id?: string
}
export interface GetUploadUrlResponse {
  ret?: number
  errmsg?: string
  upload_param?: string
  thumb_upload_param?: string
  upload_full_url?: string
}

// ---- headers ----
function commonHeaders(): Record<string, string> {
  return {
    "iLink-App-Id": ILINK_APP_ID,
    "iLink-App-ClientVersion": String(CLIENT_VERSION),
  }
}
function authHeaders(token?: string): Record<string, string> {
  const u32 = crypto.randomBytes(4).readUInt32BE(0)
  const xWechatUin = Buffer.from(String(u32), "utf-8").toString("base64")
  return {
    "Content-Type": "application/json",
    AuthorizationType: "ilink_bot_token",
    "X-WECHAT-UIN": xWechatUin,
    ...commonHeaders(),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}
function buildUrl(base: string, endpoint: string): string {
  const b = base.endsWith("/") ? base : base + "/"
  return new URL(endpoint, b).toString()
}

function combineSignals(signals: AbortSignal[]): AbortSignal | undefined {
  if (signals.length === 0) return undefined
  if (signals.length === 1) return signals[0]
  const anyFn = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any
  if (typeof anyFn === "function") return anyFn.call(AbortSignal, signals)
  // fallback (should not be reached on Node >= 20)
  const c = new AbortController()
  for (const s of signals) {
    if (s.aborted) {
      c.abort()
      break
    }
    s.addEventListener("abort", () => c.abort(), { once: true })
  }
  return c.signal
}

// ---- HTTP ----
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function postJson(
  base: string,
  endpoint: string,
  body: unknown,
  opts: { token?: string; timeoutMs?: number; signal?: AbortSignal } = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const signals: AbortSignal[] = []
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  if (opts.timeoutMs && opts.timeoutMs > 0) {
    const c = new AbortController()
    timeoutHandle = setTimeout(() => c.abort(), opts.timeoutMs)
    signals.push(c.signal)
  }
  if (opts.signal) signals.push(opts.signal)
  const signal = combineSignals(signals)
  try {
    const res = await fetch(buildUrl(base, endpoint), {
      method: "POST",
      headers: authHeaders(opts.token),
      body: JSON.stringify(body),
      signal,
    })
    const text = await res.text()
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`)
    return JSON.parse(text)
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle)
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getJson(
  base: string,
  endpoint: string,
  opts: { timeoutMs?: number } = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const controller = opts.timeoutMs ? new AbortController() : undefined
  const t = controller ? setTimeout(() => controller.abort(), opts.timeoutMs) : undefined
  try {
    const res = await fetch(buildUrl(base, endpoint), {
      method: "GET",
      headers: commonHeaders(),
      signal: controller?.signal,
    })
    const text = await res.text()
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`)
    return JSON.parse(text)
  } catch (e) {
    if ((e as Error).name === "AbortError") return { status: "wait" }
    throw e
  } finally {
    if (t) clearTimeout(t)
  }
}

// ---- helpers ----
export function newClientId(prefix = "wbs"): string {
  return `${prefix}-${crypto.randomBytes(8).toString("hex")}`
}

export function textItem(text: string): IlinkItem {
  return { type: ITEM_TYPE_TEXT, text_item: { text } }
}

// ---- protocol calls ----
export async function sendMessage(opts: {
  base: string
  token: string
  toUserId: string
  itemList: IlinkItem[]
  contextToken?: string
  clientId?: string
  botAgent: string
  timeoutMs?: number
}): Promise<SendMessageResponse> {
  return postJson(
    opts.base,
    "ilink/bot/sendmessage",
    {
      msg: {
        from_user_id: "",
        to_user_id: opts.toUserId,
        client_id: opts.clientId || newClientId(),
        message_type: MESSAGE_TYPE_BOT,
        message_state: MESSAGE_STATE_FINISH,
        item_list: opts.itemList,
        ...(opts.contextToken ? { context_token: opts.contextToken } : {}),
      },
      base_info: { channel_version: PLUGIN_VERSION, bot_agent: opts.botAgent },
    },
    { token: opts.token, timeoutMs: opts.timeoutMs ?? 15000 }
  )
}

export async function getUpdates(opts: {
  base: string
  token: string
  getUpdatesBuf: string
  botAgent: string
  timeoutMs?: number
  signal?: AbortSignal
}): Promise<GetUpdatesResponse> {
  return postJson(
    opts.base,
    "ilink/bot/getupdates",
    {
      get_updates_buf: opts.getUpdatesBuf,
      base_info: { channel_version: PLUGIN_VERSION, bot_agent: opts.botAgent },
    },
    { token: opts.token, timeoutMs: opts.timeoutMs, signal: opts.signal }
  )
}

export async function notifyStart(opts: { base: string; token: string; botAgent: string }) {
  return postJson(
    opts.base,
    "ilink/bot/msg/notifystart",
    { base_info: { channel_version: PLUGIN_VERSION, bot_agent: opts.botAgent } },
    { token: opts.token, timeoutMs: 10000 }
  )
}

export async function notifyStop(opts: { base: string; token: string; botAgent: string }) {
  return postJson(
    opts.base,
    "ilink/bot/msg/notifystop",
    { base_info: { channel_version: PLUGIN_VERSION, bot_agent: opts.botAgent } },
    { token: opts.token, timeoutMs: 10000 }
  )
}

export async function getUploadUrl(opts: {
  base: string
  token: string
  filekey: string
  mediaType: number
  toUserId: string
  rawsize: number
  rawfilemd5: string
  filesize: number
  aeskeyHex: string
  botAgent: string
}): Promise<GetUploadUrlResponse> {
  return postJson(
    opts.base,
    "ilink/bot/getuploadurl",
    {
      filekey: opts.filekey,
      media_type: opts.mediaType,
      to_user_id: opts.toUserId,
      rawsize: opts.rawsize,
      rawfilemd5: opts.rawfilemd5,
      filesize: opts.filesize,
      no_need_thumb: true,
      aeskey: opts.aeskeyHex,
      base_info: { channel_version: PLUGIN_VERSION, bot_agent: opts.botAgent },
    },
    { token: opts.token, timeoutMs: 15000 }
  )
}

// ---- QR login (used only if /login/qr is implemented) ----
export async function getBotQrcode(base: string) {
  return postJson(base, `ilink/bot/get_bot_qrcode?bot_type=3`, { local_token_list: [] })
}
export async function getQrcodeStatus(base: string, qrcode: string, verifyCode?: string) {
  let ep = `ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`
  if (verifyCode) ep += `&verify_code=${encodeURIComponent(verifyCode)}`
  return getJson(base, ep, { timeoutMs: 35000 })
}
