import { describe, expect, it } from 'vitest'
import { normalizeAbsoluteRequestUrl } from './request-url.js'

describe('normalizeAbsoluteRequestUrl', () => {
  it('keeps origin-form paths unchanged', () => {
    expect(normalizeAbsoluteRequestUrl('/ws/terminal')).toBe('/ws/terminal')
  })

  it('normalizes absolute websocket urls to route paths', () => {
    expect(normalizeAbsoluteRequestUrl('ws://123.56.160.120:3767/ws/terminal')).toBe('/ws/terminal')
  })

  it('preserves query strings when normalizing absolute urls', () => {
    expect(normalizeAbsoluteRequestUrl('https://example.com/api/projects?sort=asc')).toBe(
      '/api/projects?sort=asc'
    )
  })

  it('falls back to the original value for invalid absolute urls', () => {
    expect(normalizeAbsoluteRequestUrl('ws://%zz')).toBe('ws://%zz')
  })
})
