/*
 * login.ts — QR-scan re-authentication, exposed over HTTP so the service is
 * self-contained (no need to fall back to ../openclaw-weixin-poc/poc.mjs when a
 * session goes stale). Drives the same get_bot_qrcode -> get_qrcode_status flow
 * as poc.mjs, but split across two calls since scanning happens out of band:
 *
 *   POST /login/qr        -> start: fetch a QR, return its image content
 *   GET  /login/qr[?code] -> poll status once; may need a verify code; on
 *                            "confirmed" writes session.json (restart to use it)
 *
 * A single login attempt is tracked in-process. The QR endpoints are unauthed
 * and always hit DEFAULT_BASE; the confirmed session may point elsewhere.
 */
import QRCode from "qrcode"
import { DEFAULT_BASE, getBotQrcode, getQrcodeStatus } from "./ilink-client.js"
import type { Session } from "./state.js"
import type { Logger } from "./logger.js"

/** Render a QR-code URL to an inline SVG the browser can display and the phone can scan. */
function renderQr(url: string): Promise<string> {
  return QRCode.toString(url, { type: "svg", margin: 1, width: 240 })
}

export interface LoginStart {
  qrcode_img_content: string
  qr_svg: string
  message: string
}

export type LoginPoll =
  | { status: "no_attempt"; message: string }
  | { status: "wait" | "scaned" | "redirecting"; message: string }
  | { status: "need_verifycode"; message: string }
  | { status: "expired"; qrcode_img_content: string; qr_svg: string; message: string }
  | { status: "confirmed"; session: SessionSummary; message: string }
  | { status: "error"; message: string }

export interface SessionSummary {
  ilink_bot_id: string
  ilink_user_id: string
  baseurl: string
}

interface Attempt {
  qrcode: string
  base: string
}

const MAX_REFRESH = 90

export class LoginManager {
  private attempt: Attempt | null = null
  private refreshCount = 0

  constructor(
    private onConfirmed: (session: Session) => Promise<void>,
    private log: Logger
  ) {}

  /** Fetch a fresh QR and begin (or restart) a login attempt. */
  async start(): Promise<LoginStart> {
    this.refreshCount = 0
    const img = await this.fetchQr(DEFAULT_BASE)
    return {
      qrcode_img_content: img,
      qr_svg: await renderQr(img),
      message:
        "Open WeChat -> + -> Scan and scan this QR, then poll GET /login/qr until status=confirmed.",
    }
  }

  /** Poll the current attempt once. verifyCode is submitted when status was need_verifycode. */
  async poll(verifyCode?: string): Promise<LoginPoll> {
    if (!this.attempt) {
      return { status: "no_attempt", message: "no login in progress — POST /login/qr first" }
    }
    const st = await getQrcodeStatus(this.attempt.base, this.attempt.qrcode, verifyCode)
    // Dump the raw payload so any nickname/avatar fields the protocol returns are
    // visible under LOG_LEVEL=debug (we currently only keep the ids + token).
    this.log.debug(`login: raw qrcode status = ${JSON.stringify(st)}`)

    switch (st.status) {
      case "wait":
        return { status: "wait", message: "waiting for scan" }
      case "scaned":
        return { status: "scaned", message: "scanned — verifying" }
      case "need_verifycode":
        return {
          status: "need_verifycode",
          message:
            "WeChat is showing a pairing number — poll again with ?verify_code=<number>",
        }
      case "scaned_but_redirect": {
        if (st.redirect_host) {
          this.attempt.base = `https://${st.redirect_host}`
          this.log.info(`login: IDC redirect -> ${this.attempt.base}`)
        }
        return { status: "redirecting", message: "server redirected — keep polling" }
      }
      case "expired":
      case "verify_code_blocked": {
        this.refreshCount += 1
        if (this.refreshCount > MAX_REFRESH) {
          this.attempt = null
          return { status: "error", message: "QR expired too many times — POST /login/qr again" }
        }
        const img = await this.fetchQr(DEFAULT_BASE)
        this.log.info(`login: ${st.status} — refreshed QR (${this.refreshCount}/${MAX_REFRESH})`)
        return {
          status: "expired",
          qrcode_img_content: img,
          qr_svg: await renderQr(img),
          message: "QR expired — re-render this new QR and keep polling",
        }
      }
      case "confirmed": {
        if (!st.ilink_bot_id) return { status: "error", message: "confirmed but no ilink_bot_id" }
        const session: Session = {
          bot_token: st.bot_token,
          baseurl: st.baseurl || DEFAULT_BASE,
          ilink_bot_id: st.ilink_bot_id,
          ilink_user_id: st.ilink_user_id,
        }
        this.attempt = null
        await this.onConfirmed(session) // persist + start the account live
        this.log.info(`login: confirmed — account ${session.ilink_bot_id} added`)
        return {
          status: "confirmed",
          session: {
            ilink_bot_id: session.ilink_bot_id,
            ilink_user_id: session.ilink_user_id,
            baseurl: session.baseurl,
          },
          message: "account added and started — no restart needed",
        }
      }
      case "binded_redirect":
        this.attempt = null
        return { status: "error", message: "this bot is already connected to a WeChat account" }
      default:
        return { status: "wait", message: `unhandled status: ${st.status}` }
    }
  }

  private async fetchQr(base: string): Promise<string> {
    const qr = await getBotQrcode(base)
    if (qr.ret !== undefined && qr.ret !== 0) {
      throw new Error(`get_bot_qrcode failed: ${JSON.stringify(qr)}`)
    }
    if (!qr.qrcode || !qr.qrcode_img_content) {
      throw new Error("get_bot_qrcode returned no qrcode")
    }
    this.attempt = { qrcode: qr.qrcode, base }
    return qr.qrcode_img_content
  }
}
