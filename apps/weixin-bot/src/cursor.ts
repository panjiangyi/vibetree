/*
 * cursor.ts — get_updates_buf persistence. The empty-string rule: the server
 * returns "" to mean "no change", so we never overwrite with empty.
 */
import fs from "node:fs"
import path from "node:path"
import type { Logger } from "./logger.js"

export class CursorStore {
  private buf = ""
  constructor(private file: string, private log: Logger) {}

  load(): void {
    try {
      if (!fs.existsSync(this.file)) return
      const parsed = JSON.parse(fs.readFileSync(this.file, "utf-8")) as { buf?: string }
      if (typeof parsed.buf === "string") this.buf = parsed.buf
      this.log.debug(`cursor: loaded (${this.buf.length} bytes)`)
    } catch (e) {
      this.log.warn("cursor: load failed:", (e as Error).message)
    }
  }

  get(): string {
    return this.buf
  }

  /** Only call with a non-empty buf. */
  set(next: string): void {
    if (!next) return
    this.buf = next
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true })
      fs.writeFileSync(this.file, JSON.stringify({ buf: this.buf }, null, 2), { mode: 0o600 })
      try {
        fs.chmodSync(this.file, 0o600)
      } catch {
        /* best effort */
      }
    } catch (e) {
      this.log.warn("cursor: persist failed:", (e as Error).message)
    }
  }
}
