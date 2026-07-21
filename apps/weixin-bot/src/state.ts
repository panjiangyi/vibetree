/*
 * state.ts — sessions + per-account state-file path helpers. Each WeChat account
 * has its own session file under <stateDir>/sessions/<accountId>.json so one
 * instance can serve many accounts; the legacy single <stateDir>/session.json is
 * migrated in on first boot.
 */
import fs from "node:fs"
import path from "node:path"
import type { Logger } from "./logger.js"

export interface Session {
  bot_token: string
  baseurl: string
  ilink_bot_id: string
  ilink_user_id: string
  label?: string // user-assigned friendly name (no nickname from the protocol)
  savedAt?: string
}

export function isValidSession(s: unknown): s is Session {
  const v = s as Session
  return Boolean(v && v.bot_token && v.baseurl && v.ilink_bot_id && v.ilink_user_id)
}

function safeAccountId(accountId: string): string {
  return accountId.replace(/[^a-zA-Z0-9_.@-]/g, "_")
}

export function sessionsDir(stateDir: string): string {
  return path.join(stateDir, "sessions")
}

export function accountSessionPath(stateDir: string, accountId: string): string {
  return path.join(sessionsDir(stateDir), `${safeAccountId(accountId)}.json`)
}

/** Persist an account's session with 0600 perms. */
export function saveAccountSession(stateDir: string, session: Session): void {
  const dir = sessionsDir(stateDir)
  fs.mkdirSync(dir, { recursive: true })
  const file = accountSessionPath(stateDir, session.ilink_bot_id)
  const withStamp: Session = { ...session, savedAt: new Date().toISOString() }
  fs.writeFileSync(file, JSON.stringify(withStamp, null, 2), { mode: 0o600 })
  try {
    fs.chmodSync(file, 0o600)
  } catch {
    /* best-effort */
  }
}

/**
 * Load every account session. Migrates a legacy single session.json into the
 * sessions/ directory (once), then reads all sessions/*.json.
 */
export function loadAllSessions(
  stateDir: string,
  legacySessionFile: string,
  log: Logger
): Session[] {
  const dir = sessionsDir(stateDir)
  fs.mkdirSync(dir, { recursive: true })

  // one-time migration of the old single-session file
  if (fs.existsSync(legacySessionFile)) {
    try {
      const s = JSON.parse(fs.readFileSync(legacySessionFile, "utf-8"))
      if (isValidSession(s)) {
        const dest = accountSessionPath(stateDir, s.ilink_bot_id)
        if (!fs.existsSync(dest)) {
          saveAccountSession(stateDir, s)
          log.info(`sessions: migrated legacy session.json -> ${dest}`)
        }
      }
    } catch (e) {
      log.warn(`sessions: could not migrate legacy session.json: ${(e as Error).message}`)
    }
  }

  // dedup by account id; normalize each file to the canonical <accountId>.json
  const byId = new Map<string, Session>()
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".json")) continue
    const full = path.join(dir, f)
    try {
      const s = JSON.parse(fs.readFileSync(full, "utf-8"))
      if (!isValidSession(s)) {
        log.warn(`sessions: skipping incomplete ${f}`)
        continue
      }
      const canonical = accountSessionPath(stateDir, s.ilink_bot_id)
      if (path.resolve(full) !== path.resolve(canonical)) {
        saveAccountSession(stateDir, s) // write canonical name
        try {
          fs.rmSync(full)
        } catch {
          /* ignore */
        }
        log.info(`sessions: normalized ${f} -> ${path.basename(canonical)}`)
      }
      byId.set(s.ilink_bot_id, s)
    } catch (e) {
      log.warn(`sessions: skipping unreadable ${f}: ${(e as Error).message}`)
    }
  }
  return [...byId.values()]
}

/** <stateDir>/<accountId>.<suffix>.json (accountId is sanitized for the filesystem). */
export function statePath(stateDir: string, accountId: string, suffix: string): string {
  return path.join(stateDir, `${safeAccountId(accountId)}.${suffix}.json`)
}

/** <stateDir>/<accountId>.messages.db — the SQLite conversation history. */
export function messagesDbPath(stateDir: string, accountId: string): string {
  return path.join(stateDir, `${safeAccountId(accountId)}.messages.db`)
}
