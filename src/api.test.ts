import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, clearAuth } from './api'

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response
}

describe('management API client', () => {
  beforeEach(() => clearAuth())

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    clearAuth()
  })

  it('stores the CSRF token and sends it on mutations', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: { user: { id: 1, username: 'admin', isAdmin: true }, csrfToken: 'csrf-1' } }))
      .mockResolvedValueOnce(response({ data: { id: 7, username: 'admin-2', version: 'next' } }))
    vi.stubGlobal('fetch', fetchMock)

    await api.login('admin', 'secret')
    await api.save('accounts', { id: 7, username: 'admin-2' }, 'current')

    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(new Headers(init.headers).get('X-CSRF-Token')).toBe('csrf-1')
    expect(init.credentials).toBe('include')
    expect(JSON.parse(String(init.body))).toEqual({ data: { username: 'admin-2' }, version: 'current' })
  })

  it('preserves structured conflict errors from the backend', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      error: { code: 'VERSION_CONFLICT', message: 'Dữ liệu đã thay đổi' },
      requestId: 'request-1',
    }, 409))
    vi.stubGlobal('fetch', fetchMock)

    await expect(api.save('accounts', { id: 7, username: 'admin-2' }, 'stale')).rejects.toMatchObject({
      status: 409,
      code: 'VERSION_CONFLICT',
      requestId: 'request-1',
    })
  })

  it('sends lookup IDs as one bounded batch request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      data: [{ id: 12, label: 'Áo vải', iconId: 44, meta: {} }],
      meta: { kind: 'items', requested: 2 },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await api.lookup('items', { ids: [12, 13], limit: 200 })
    expect(result[0]).toMatchObject({ id: 12, label: 'Áo vải', iconId: 44 })
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/lookups/items?')
    expect(String(fetchMock.mock.calls[0][0])).toContain('ids=12%2C13')
    expect(String(fetchMock.mock.calls[0][0])).toContain('limit=200')
  })

  it('sends nested giftcode payloads with numeric IDs and keeps version separate', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      data: { id: 7, code: 'tanthu', version: 'next', rewards: [], options: [], usedPlayerIds: [], usedPlayers: [] },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await api.saveGiftcodeDetail({
      code: 'tanthu',
      count_left: 10,
      expired: '2030-01-01 00:00:00',
      rewards: [{ id: 457, quantity: 10 }],
      options: [{ id: 30, param: 0 }],
    }, 'current', 7)

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(fetchMock.mock.calls[0][0]).toBe('/api/giftcodes/7/detail')
    expect(JSON.parse(String(init.body))).toEqual(expect.objectContaining({
      version: 'current',
      data: expect.objectContaining({ rewards: [{ id: 457, quantity: 10 }], options: [{ id: 30, param: 0 }] }),
    }))
  })
})
