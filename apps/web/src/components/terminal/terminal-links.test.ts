import { describe, expect, it } from 'vitest'
import { isSafeWebUrl } from './terminal-links.js'

describe('isSafeWebUrl', () => {
  it.each([
    'https://example.com/path?query=value',
    'http://localhost:3000',
    'https://127.0.0.1:5173/docs',
  ])('allows web URL %s', (url) => {
    expect(isSafeWebUrl(url)).toBe(true)
  })

  it.each([
    'javascript:alert(1)',
    'file:///etc/passwd',
    'data:text/html,<h1>unsafe</h1>',
    'not a url',
  ])('rejects non-web URL %s', (url) => {
    expect(isSafeWebUrl(url)).toBe(false)
  })
})
