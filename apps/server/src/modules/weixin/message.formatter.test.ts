import { describe, expect, it } from 'vitest'
import { chunks, cleanAgentText, summarizeFinal } from './message.formatter.js'

describe('WeChat message formatting', () => {
  it('removes ANSI terminal control sequences', () => {
    expect(cleanAgentText('\u001b[31mfailed\u001b[0m\r\nnext')).toBe('failed\nnext')
  })

  it('splits long text without losing content', () => {
    const input = Array.from({ length: 300 }, (_, index) => `line-${index}`).join('\n')
    const result = chunks(input, 120)
    expect(result.length).toBeGreaterThan(1)
    expect(result.join('\n')).toBe(input)
    expect(result.every((part) => part.length <= 120)).toBe(true)
  })

  it('caps the automatic final response at three messages', () => {
    const result = summarizeFinal('x '.repeat(5000))
    expect(result).toHaveLength(3)
    expect(result[2]).toContain('查看详情')
  })
})
