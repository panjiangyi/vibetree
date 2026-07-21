/*
 * logger.ts — tiny leveled logger (no dep). ISO timestamps; warn/error to stderr.
 */
import type { LogLevel } from "./config.js"

export interface Logger {
  debug: (...a: unknown[]) => void
  info: (...a: unknown[]) => void
  warn: (...a: unknown[]) => void
  error: (...a: unknown[]) => void
}

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

export function createLogger(level: LogLevel): Logger {
  const min = ORDER[level] ?? ORDER.info
  const emit = (lvl: LogLevel, args: unknown[]): void => {
    if (ORDER[lvl] < min) return
    const ts = new Date().toISOString()
    const msg = args.map((a) => (typeof a === "string" ? a : safe(a))).join(" ")
    const line = `[${ts}] ${lvl.toUpperCase()} ${msg}`
    if (lvl === "error" || lvl === "warn") process.stderr.write(line + "\n")
    else process.stdout.write(line + "\n")
  }
  return {
    debug: (...a) => emit("debug", a),
    info: (...a) => emit("info", a),
    warn: (...a) => emit("warn", a),
    error: (...a) => emit("error", a),
  }
}

function safe(a: unknown): string {
  if (a instanceof Error) return a.stack || a.message
  try {
    return JSON.stringify(a)
  } catch {
    return String(a)
  }
}
