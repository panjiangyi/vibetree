import { describe, expect, it } from 'vitest'
import { OutputReplayBuffer } from './output-replay-buffer.js'

describe('OutputReplayBuffer', () => {
  it('keeps output in insertion order while under the byte limit', () => {
    const buffer = new OutputReplayBuffer(20)

    buffer.push('hello')
    buffer.push('\nworld')

    expect(buffer.toString()).toBe('hello\nworld')
    expect(buffer.byteLength).toBe(Buffer.byteLength('hello\nworld'))
  })

  it('drops the oldest chunks when the byte limit is exceeded', () => {
    const buffer = new OutputReplayBuffer(10)

    buffer.push('12345')
    buffer.push('abcde')
    buffer.push('XYZ')

    expect(buffer.toString()).toBe('abcdeXYZ')
    expect(buffer.byteLength).toBe(8)
  })

  it('trims an oversized chunk from the start', () => {
    const buffer = new OutputReplayBuffer(5)

    buffer.push('123456789')

    expect(buffer.toString()).toBe('56789')
    expect(buffer.byteLength).toBe(5)
  })

  it('does not split multibyte characters while trimming', () => {
    const buffer = new OutputReplayBuffer(7)

    buffer.push('ab你好cd')

    expect(buffer.toString()).toBe('好cd')
    expect(buffer.byteLength).toBe(5)
  })
})
