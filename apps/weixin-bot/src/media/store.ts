/*
 * media/store.ts — persists inbound decrypted media to disk under <stateDir>/media
 * and serves it back via GET /media/:id. Files are stored as <id><ext> so the
 * MIME is recoverable from the extension even after a restart.
 */
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { getExtensionFromMime, getMimeFromFilename } from "./mime.js"

export interface SavedMedia {
  id: string
  path: string
  mime: string
  size: number
  filename: string
}

export class MediaStore {
  constructor(private dir: string) {
    fs.mkdirSync(dir, { recursive: true })
  }

  save(opts: { buffer: Buffer; mime: string; filename?: string }): SavedMedia {
    const id = crypto.randomBytes(8).toString("hex")
    const ext = opts.filename
      ? path.extname(opts.filename) || getExtensionFromMime(opts.mime)
      : getExtensionFromMime(opts.mime)
    const stored = `${id}${ext}`
    const fp = path.join(this.dir, stored)
    fs.writeFileSync(fp, opts.buffer)
    return {
      id,
      path: fp,
      mime: opts.mime,
      size: opts.buffer.length,
      filename: opts.filename || stored,
    }
  }

  get(id: string): SavedMedia | undefined {
    const safeId = id.replace(/[^a-f0-9]/g, "")
    if (!safeId) return undefined
    let found: string | undefined
    try {
      found = fs.readdirSync(this.dir).find((f) => f.startsWith(`${safeId}.`))
    } catch {
      return undefined
    }
    if (!found) return undefined
    const fp = path.join(this.dir, found)
    const stat = fs.statSync(fp)
    return {
      id: safeId,
      path: fp,
      mime: getMimeFromFilename(found),
      size: stat.size,
      filename: found,
    }
  }
}
