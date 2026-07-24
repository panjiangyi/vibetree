/*
 * config.ts — typed configuration loaded once from the monorepo root .env.
 * Falls back to legacy variable names so an existing standalone setup still works.
 */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { config as loadDotEnv } from "dotenv"

export type LogLevel = "debug" | "info" | "warn" | "error"

export interface Config {
  port: number
  apiKey: string
  stateDir: string
  sessionFile: string
  botAgent: string
  cdnBaseUrl: string
  webhookUrl: string | null
  webhookSecret: string | null
  webhookMaxAttempts: number
  pollTimeoutMs: number
  mediaMaxBytes: number
  logLevel: LogLevel
}

const repoRoot = path.resolve(import.meta.dirname, "../../../")
loadDotEnv({ path: path.join(repoRoot, ".env") })

export function loadConfig(): Config {
  const apiKey = process.env.WORKTREEHUB_WEIXIN_API_KEY?.trim() || process.env.API_KEY?.trim()
  if (!apiKey) throw new Error("WORKTREEHUB_WEIXIN_API_KEY (or legacy API_KEY) env var is required")

  const stateDir = process.env.WEIXIN_STATE_DIR?.trim()
    || process.env.WORKTREEHUB_WEIXIN_STATE_DIR?.trim()
    || path.join(os.homedir(), ".openclaw-poc")
  const sessionFile = process.env.WEIXIN_SESSION_FILE?.trim()
    || process.env.WORKTREEHUB_WEIXIN_SESSION_FILE?.trim()
    || path.join(stateDir, "session.json")

  return {
    port: parseIntEnv(process.env.WORKTREEHUB_WEIXIN_PORT ?? process.env.PORT, 3000),
    apiKey,
    stateDir,
    sessionFile,
    botAgent: process.env.WORKTREEHUB_WEIXIN_BOT_AGENT?.trim() || process.env.BOT_AGENT?.trim() || "weixin-bot-service",
    cdnBaseUrl: process.env.WORKTREEHUB_WEIXIN_CDN_BASE_URL?.trim()
      || process.env.WEIXIN_CDN_BASE_URL?.trim()
      || "https://novac2c.cdn.weixin.qq.com/c2c",
    webhookUrl: process.env.WORKTREEHUB_WEIXIN_WEBHOOK_URL?.trim() || process.env.WEBHOOK_URL?.trim() || null,
    webhookSecret: process.env.WORKTREEHUB_WEIXIN_WEBHOOK_SECRET?.trim() || process.env.WEBHOOK_SECRET?.trim() || null,
    webhookMaxAttempts: parseIntEnv(process.env.WORKTREEHUB_WEIXIN_WEBHOOK_MAX_ATTEMPTS ?? process.env.WEBHOOK_MAX_ATTEMPTS, 5),
    pollTimeoutMs: parseIntEnv(process.env.WORKTREEHUB_WEIXIN_POLL_TIMEOUT_MS ?? process.env.POLL_TIMEOUT_MS, 35000),
    mediaMaxBytes: parseIntEnv(process.env.WORKTREEHUB_WEIXIN_MEDIA_MAX_BYTES ?? process.env.WEIXIN_MEDIA_MAX_BYTES, 100 * 1024 * 1024),
    logLevel: parseLogLevel(process.env.WORKTREEHUB_WEIXIN_LOG_LEVEL ?? process.env.LOG_LEVEL),
  }
}

export function ensureStateDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
  fs.mkdirSync(path.join(dir, "media"), { recursive: true })
}

function parseIntEnv(v: string | undefined, def: number): number {
  if (!v) return def
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : def
}

function parseLogLevel(v: string | undefined): LogLevel {
  const lvl = (v || "info").toLowerCase()
  return lvl === "debug" || lvl === "warn" || lvl === "error" ? lvl : "info"
}
