import { describe, expect, it } from 'vitest'
import { stripTerminalQuerySequences } from './pty.manager.js'

describe('stripTerminalQuerySequences', () => {
  it('removes device attribute queries from replay output', () => {
    expect(stripTerminalQuerySequences(`before\x1b[>0cafter`)).toBe('beforeafter')
  })

  it('removes OSC color responses terminated by ST or BEL', () => {
    const output = [
      'before',
      '\x1b]10;rgb:1616/2020/3131\x1b\\',
      '\x1b]11;rgb:f7f7/f9f9/fcfc\x07',
      'after',
    ].join('')

    expect(stripTerminalQuerySequences(output)).toBe('beforeafter')
  })

  it('preserves color-like text that is not an OSC response', () => {
    expect(stripTerminalQuerySequences('10;rgb:1616/2020/3131')).toBe(
      '10;rgb:1616/2020/3131'
    )
  })
})
