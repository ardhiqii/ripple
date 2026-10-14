import { describe, expect, it } from 'vitest'

import { apiUrl, resolveApiUrl } from './url'

describe('apiUrl', () => {
  it('keeps local API paths relative when no base URL is configured', () => {
    expect(apiUrl('/api/v1/health/live')).toBe('/api/v1/health/live')
  })

  it('preserves absolute stream URLs returned by the backend', () => {
    expect(apiUrl('https://api.example.test/api/v1/runs/1/stream')).toBe(
      'https://api.example.test/api/v1/runs/1/stream',
    )
  })

  it('prefixes preview paths with the configured API origin', () => {
    expect(resolveApiUrl('/api/v1/demo/scenarios', 'https://api.example.test/')).toBe(
      'https://api.example.test/api/v1/demo/scenarios',
    )
  })
})
