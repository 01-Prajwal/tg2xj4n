import { ApiError, api, buildUrl, filterParams } from './client'
import type { Filters } from './types'

const filters: Filters = {
  from: '2026-01-02T00:00:00Z',
  to: '2026-02-02T00:00:00Z',
  mode: 'dayahead',
  horizonH: 24,
  basis: 'point',
}

describe('api client', () => {
  afterEach(() => vi.restoreAllMocks())

  it('omits the horizon in day-ahead mode', () => {
    expect(filterParams(filters).h).toBeUndefined()
    expect(filterParams({ ...filters, mode: 'horizon' }).h).toBe(24)
  })

  it('builds encoded query strings and skips undefined values', () => {
    expect(buildUrl('/series', { from: '2026-01-02T00:00:00Z', h: undefined })).toBe(
      '/api/series?from=2026-01-02T00%3A00%3A00Z',
    )
    expect(buildUrl('/health')).toBe('/api/health')
  })

  it('surfaces the API error detail', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: "'from' must be before 'to'" }), { status: 422 }),
    )
    const err = await api.series(filters).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(422)
    expect((err as ApiError).message).toBe("'from' must be before 'to'")
  })
})
