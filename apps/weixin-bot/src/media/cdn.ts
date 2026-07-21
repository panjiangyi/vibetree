/*
 * media/cdn.ts — iLink media CDN upload + download.
 *
 * SEND:  getuploadurl -> POST raw AES-128-ECB ciphertext (header: octet-stream
 *        only) to the presigned CDN URL -> read x-encrypted-param.
 * RECV:  GET the presigned download URL (no headers) -> AES-decrypt.
 *
 * The CDN (https://novac2c.cdn.weixin.qq.com/c2c) authenticates solely via the
 * presigned URL — no Bearer token, no iLink headers on upload/download.
 */
import crypto from "node:crypto"
import {
  getUploadUrl,
  ITEM_TYPE_FILE,
  ITEM_TYPE_IMAGE,
  ITEM_TYPE_VIDEO,
  UploadMediaType,
  type IlinkItem,
} from "../ilink-client.js"
import { aesEcbPaddedSize, decryptAesEcb, encryptAesEcb } from "./aes.js"

const UPLOAD_MAX_RETRIES = 3

class FatalUploadError extends Error {}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export interface UploadedMedia {
  filekey: string
  downloadEncryptedQueryParam: string
  aeskeyHex: string
  fileSize: number // plaintext bytes
  fileSizeCiphertext: number // PKCS7 ciphertext bytes
}

export async function uploadMedia(opts: {
  base: string
  token: string
  botAgent: string
  cdnBaseUrl: string
  plaintext: Buffer
  toUserId: string
  mediaType: number // UploadMediaType
}): Promise<UploadedMedia> {
  const plaintext = opts.plaintext
  const rawsize = plaintext.length
  const rawfilemd5 = crypto.createHash("md5").update(plaintext).digest("hex")
  const filesize = aesEcbPaddedSize(rawsize)
  const filekey = crypto.randomBytes(16).toString("hex")
  const aeskey = crypto.randomBytes(16)
  const aeskeyHex = aeskey.toString("hex")

  const resp = await getUploadUrl({
    base: opts.base,
    token: opts.token,
    botAgent: opts.botAgent,
    filekey,
    mediaType: opts.mediaType,
    toUserId: opts.toUserId,
    rawsize,
    rawfilemd5,
    filesize,
    aeskeyHex,
  })

  const uploadFullUrl = resp.upload_full_url?.trim()
  const uploadParam = resp.upload_param
  let cdnUrl: string
  if (uploadFullUrl) {
    cdnUrl = uploadFullUrl
  } else if (uploadParam) {
    cdnUrl = `${opts.cdnBaseUrl}/upload?encrypted_query_param=${encodeURIComponent(uploadParam)}&filekey=${encodeURIComponent(filekey)}`
  } else {
    throw new Error("getUploadUrl returned neither upload_full_url nor upload_param")
  }

  const ciphertext = encryptAesEcb(plaintext, aeskey)

  let lastErr: unknown = null
  let downloadEncryptedQueryParam: string | undefined
  for (let attempt = 0; attempt < UPLOAD_MAX_RETRIES; attempt += 1) {
    try {
      const res = await fetch(cdnUrl, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: new Uint8Array(ciphertext),
        signal: AbortSignal.timeout(60000),
      })
      if (res.status >= 400 && res.status < 500) {
        const errMsg = res.headers.get("x-error-message") || (await res.text().catch(() => ""))
        throw new FatalUploadError(`CDN upload client error ${res.status}: ${errMsg}`)
      }
      if (res.ok) {
        const param = res.headers.get("x-encrypted-param")
        if (!param) throw new FatalUploadError("CDN upload ok but missing x-encrypted-param header")
        downloadEncryptedQueryParam = param
        break
      }
      // 5xx: retry
      lastErr = new Error(`CDN upload server error ${res.status}`)
    } catch (e) {
      if (e instanceof FatalUploadError) throw e
      lastErr = e
    }
    if (attempt < UPLOAD_MAX_RETRIES - 1) await sleep(2000 * (attempt + 1))
  }

  if (!downloadEncryptedQueryParam) {
    throw lastErr instanceof Error ? lastErr : new Error("CDN upload failed")
  }

  return {
    filekey,
    downloadEncryptedQueryParam,
    aeskeyHex,
    fileSize: rawsize,
    fileSizeCiphertext: filesize,
  }
}

/** Build the outbound MessageItem (IMAGE/VIDEO/FILE) from an uploaded descriptor. */
export function mediaItemForSend(
  mediaType: number,
  uploaded: UploadedMedia,
  fileName: string
): IlinkItem {
  const media = {
    encrypt_query_param: uploaded.downloadEncryptedQueryParam,
    // base64 of the 32-char HEX string (NOT of the raw 16 bytes) — matches the plugin
    aes_key: Buffer.from(uploaded.aeskeyHex, "utf8").toString("base64"),
    encrypt_type: 1,
  }
  if (mediaType === UploadMediaType.IMAGE) {
    return { type: ITEM_TYPE_IMAGE, image_item: { media, mid_size: uploaded.fileSizeCiphertext } }
  }
  if (mediaType === UploadMediaType.VIDEO) {
    return { type: ITEM_TYPE_VIDEO, video_item: { media, video_size: uploaded.fileSizeCiphertext } }
  }
  return {
    type: ITEM_TYPE_FILE,
    file_item: { media, file_name: fileName, len: String(uploaded.fileSize) },
  }
}

/** Download + AES-decrypt an inbound media item. */
export async function downloadAndDecrypt(opts: {
  cdnBaseUrl: string
  fullUrl?: string
  encryptedQueryParam?: string
  aesKeyBase64?: string
  aesKeyHex?: string // image_item.aeskey (raw hex)
  maxBytes: number
}): Promise<Buffer> {
  let url: string
  if (opts.fullUrl) {
    url = opts.fullUrl
  } else if (opts.encryptedQueryParam) {
    url = `${opts.cdnBaseUrl}/download?encrypted_query_param=${encodeURIComponent(opts.encryptedQueryParam)}`
  } else {
    throw new Error("download: no full_url or encrypt_query_param")
  }

  const res = await fetch(url, { signal: AbortSignal.timeout(60000) })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`CDN download ${res.status} ${res.statusText} body=${body.slice(0, 200)}`)
  }
  const ciphertext = Buffer.from(await res.arrayBuffer())
  if (ciphertext.length > opts.maxBytes) {
    throw new Error(`media exceeds max bytes (${ciphertext.length} > ${opts.maxBytes})`)
  }
  return decryptAesEcb(ciphertext, parseAesKey(opts))
}

function parseAesKey(opts: { aesKeyBase64?: string; aesKeyHex?: string }): Buffer {
  if (opts.aesKeyHex) return Buffer.from(opts.aesKeyHex, "hex")
  if (!opts.aesKeyBase64) throw new Error("download: no aes key supplied")
  const decoded = Buffer.from(opts.aesKeyBase64, "base64")
  if (decoded.length === 16) return decoded
  // otherwise it may be base64 of a 32-char hex string
  const asStr = decoded.toString("utf8")
  if (/^[0-9a-fA-F]{32}$/.test(asStr)) return Buffer.from(asStr, "hex")
  throw new Error(`download: cannot parse aes key (decoded len ${decoded.length})`)
}
