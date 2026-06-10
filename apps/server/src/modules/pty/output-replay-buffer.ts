const UTF8_ENCODING = 'utf8'

function trimStartToMaxBytes(data: string, maxBytes: number): string {
  let byteLength = 0
  const chars: string[] = []

  for (const char of Array.from(data).reverse()) {
    const charByteLength = Buffer.byteLength(char, UTF8_ENCODING)
    if (byteLength + charByteLength > maxBytes) {
      break
    }

    chars.push(char)
    byteLength += charByteLength
  }

  return chars.reverse().join('')
}

export class OutputReplayBuffer {
  private chunks: Array<{ data: string; byteLength: number }> = []
  private totalBytes = 0

  constructor(private readonly maxBytes: number) {
    if (!Number.isFinite(maxBytes) || maxBytes < 1) {
      throw new Error('OutputReplayBuffer maxBytes must be a positive number')
    }
  }

  push(data: string): void {
    if (!data) return

    let chunk = data
    let byteLength = Buffer.byteLength(chunk, UTF8_ENCODING)

    if (byteLength > this.maxBytes) {
      chunk = trimStartToMaxBytes(chunk, this.maxBytes)
      if (!chunk) return
      byteLength = Buffer.byteLength(chunk, UTF8_ENCODING)
    }

    this.chunks.push({ data: chunk, byteLength })
    this.totalBytes += byteLength

    while (this.totalBytes > this.maxBytes && this.chunks.length > 1) {
      const removed = this.chunks.shift()
      if (removed) {
        this.totalBytes -= removed.byteLength
      }
    }
  }

  toString(): string {
    return this.chunks.map((chunk) => chunk.data).join('')
  }

  get byteLength(): number {
    return this.totalBytes
  }

  clear(): void {
    this.chunks = []
    this.totalBytes = 0
  }
}
