/*
 * media/mime.ts — extension <-> MIME lookup (extension-based, like the plugin)
 * plus a tiny magic-byte sniffer for inbound images, and a media-type router
 * for outbound sends.
 */
import path from "node:path"

const EXTENSION_TO_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".zip": "application/zip",
  ".tar": "application/x-tar",
  ".gz": "application/gzip",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
}

export function getMimeFromFilename(filename: string): string {
  const ext = path.extname(filename).toLowerCase()
  return EXTENSION_TO_MIME[ext] || "application/octet-stream"
}

export function getExtensionFromMime(mime: string): string {
  const m = mime.split(";")[0].trim().toLowerCase()
  const entry = Object.entries(EXTENSION_TO_MIME).find(([, v]) => v === m)
  return entry ? entry[0] : ".bin"
}

/** Cheap magic-byte sniff for common image/video formats; null if unknown. */
export function sniffMime(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg"
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return "image/png"
  }
  if (
    buf.length >= 12 &&
    buf.slice(0, 4).toString("latin1") === "RIFF" &&
    buf.slice(8, 12).toString("latin1") === "WEBP"
  ) {
    return "image/webp"
  }
  if (buf.length >= 6) {
    const sig = buf.slice(0, 6).toString("latin1")
    if (sig === "GIF87a" || sig === "GIF89a") return "image/gif"
  }
  if (buf.length >= 12 && buf.slice(4, 8).toString("latin1") === "ftyp") return "video/mp4"
  return null
}

/** Outbound UploadMediaType (1/2/3) from a MIME string. */
export function mediaTypeForMime(mime: string): 1 | 2 | 3 {
  const m = mime.toLowerCase()
  if (m.startsWith("image/")) return 1
  if (m.startsWith("video/")) return 2
  return 3
}
