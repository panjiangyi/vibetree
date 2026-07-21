/*
 * media/aes.ts — AES-128-ECB with PKCS7 padding (Node built-in). Mirrors the
 * plugin's cdn/aes-ecb.ts. The iLink CDN stores ciphertext; the key is
 * exchanged out-of-band via getUploadUrl / the sendMessage item.
 */
import { createCipheriv, createDecipheriv } from "node:crypto"

/** PKCS7 ciphertext size for a plaintext of `plaintextSize` bytes. */
export function aesEcbPaddedSize(plaintextSize: number): number {
  return Math.ceil((plaintextSize + 1) / 16) * 16
}

export function encryptAesEcb(plaintext: Buffer, key16: Buffer): Buffer {
  const cipher = createCipheriv("aes-128-ecb", key16, null)
  return Buffer.concat([cipher.update(plaintext), cipher.final()])
}

export function decryptAesEcb(ciphertext: Buffer, key16: Buffer): Buffer {
  const decipher = createDecipheriv("aes-128-ecb", key16, null)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}
