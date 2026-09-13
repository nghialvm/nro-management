import type {
  AntiDdosStatus,
  ApiEnvelope,
  AttributeServerConfig,
  AttributeServerRow,
  AttributeServerUpdate,
  AuthData,
  BossConfigRow,
  BossSpawnOptions,
  BossSpawnResult,
  DashboardSnapshot,
  EventConfig,
  GiftcodeDetail,
  JsonMap,
  LookupKind,
  LookupOption,
  ResourceRow,
  ShopDetail,
  User,
} from './types'

let csrfToken = ''

const resourceIdFields: Record<string, string> = {
  'head-avatars': 'head_id',
}

export class ApiRequestError extends Error {
  code: string
  status: number
  requestId?: string

  constructor(message: string, status: number, code = 'REQUEST_FAILED', requestId?: string) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.code = code
    this.requestId = requestId
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<ApiEnvelope<T>> {
  const method = (init.method ?? 'GET').toUpperCase()
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/json')
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken) headers.set('X-CSRF-Token', csrfToken)

  const response = await fetch(path, { ...init, headers, credentials: 'include' })
  const raw = await response.text()
  let payload: ApiEnvelope<T> | { error?: { code?: string; message?: string }; requestId?: string } = {}
  try {
    payload = raw ? JSON.parse(raw) : {}
  } catch {
    throw new ApiRequestError('Phản hồi từ server không hợp lệ', response.status, 'INVALID_RESPONSE')
  }
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event('nro:unauthorized'))
    const error = 'error' in payload && payload.error ? payload.error : undefined
    throw new ApiRequestError(
      error?.message ?? 'Có lỗi xảy ra',
      response.status,
      error?.code ?? 'REQUEST_FAILED',
      'requestId' in payload ? payload.requestId : undefined,
    )
  }
  return payload as ApiEnvelope<T>
}

const json = (value: unknown) => JSON.stringify(value)

export const api = {
  async login(username: string, password: string) {
    const response = await request<AuthData>('/api/auth/login', { method: 'POST', body: json({ username, password }) })
    csrfToken = response.data.csrfToken
    return response.data
  },

  async me() {
    const response = await request<AuthData>('/api/auth/me')
    csrfToken = response.data.csrfToken
    return response.data
  },

  async logout() {
    try {
      await request('/api/auth/logout', { method: 'POST' })
    } finally {
      csrfToken = ''
    }
  },

  async dashboard() {
    return (await request<DashboardSnapshot>('/api/dashboard')).data
  },

  async attributeServer() {
    return (await request<AttributeServerConfig>('/api/server/attribute-server')).data
  },

  async updateAttributeServer(id: number, data: AttributeServerUpdate) {
    return (await request<AttributeServerRow>(`/api/server/attribute-server/${encodeURIComponent(String(id))}`, {
      method: 'PUT',
      body: json(data),
    })).data
  },

  async list(resource: string, params: Record<string, string | number | undefined> = {}) {
    const search = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') search.set(key, String(value))
    })
    const query = search.toString()
    return request<ResourceRow[]>(`/api/resources/${resource}${query ? `?${query}` : ''}`)
  },

  async get(resource: string, id: string | number) {
    return (await request<ResourceRow>(`/api/resources/${resource}/${encodeURIComponent(String(id))}`)).data
  },

  async save(resource: string, data: JsonMap, version?: string, isNewOverride?: boolean, table?: string) {
    const idField = resourceIdFields[resource] ?? 'id'
    const id = data[idField]
    const isNew = isNewOverride ?? (id === undefined || id === null || id === '')
    const query = table ? `?table=${encodeURIComponent(table)}` : ''
    const path = `${isNew ? `/api/resources/${resource}` : `/api/resources/${resource}/${encodeURIComponent(String(id))}`}${query}`
    const payload = { ...data }
    if (!isNew) delete payload[idField]
    const response = await request<ResourceRow>(path, {
      method: isNew ? 'POST' : 'PUT',
      body: json({ data: payload, ...(version ? { version } : {}) }),
    })
    return response.data
  },

  async remove(resource: string, id: string | number, version?: string, table?: string) {
    const query = table ? `?table=${encodeURIComponent(table)}` : ''
    await request(`/api/resources/${resource}/${encodeURIComponent(String(id))}${query}`, {
      method: 'DELETE',
      body: json(version ? { version } : {}),
    })
  },

  async server(path: string, method: 'POST' | 'PUT', body: JsonMap = {}) {
    return (await request<JsonMap>(`/api/server/${path}`, { method, body: json(body) })).data
  },

  async events() {
    return (await request<EventConfig>('/api/events/config')).data
  },

  async updateEvents(eventIds: number[]) {
    return (await request<JsonMap>('/api/events/config', { method: 'PUT', body: json({ eventIds }) })).data
  },

  async bosses() {
    return (await request<BossConfigRow[]>('/api/boss-config')).data
  },

  async saveBoss(key: string, data: JsonMap, version?: string) {
    return (await request<BossConfigRow>(`/api/boss-config/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body: json({ data, ...(version ? { version } : {}) }),
    })).data
  },

  async reloadBosses() {
    return (await request<JsonMap>('/api/boss-config/reload', { method: 'POST' })).data
  },

  async bossAction(action: string, body: JsonMap = {}) {
    return (await request<JsonMap>('/api/bosses/actions', { method: 'POST', body: json({ action, ...body }) })).data
  },

  async bossSpawnOptions() {
    return (await request<BossSpawnOptions>('/api/bosses/spawn-options')).data
  },

  async summonBoss(bossId: number, mapId: number, zoneId: number) {
    return (await request<BossSpawnResult>('/api/bosses/actions', {
      method: 'POST',
      body: json({ action: 'summon', bossId, mapId, zoneId }),
    })).data
  },

  async security() {
    return request<ResourceRow[]>('/api/security/blocked-ips')
  },

  async blockIp(ip: string, reason: string) {
    return (await request<JsonMap>('/api/security/block-ip', { method: 'POST', body: json({ ip, reason }) })).data
  },

  async unblockIp(ip: string) {
    return (await request<JsonMap>(`/api/security/blocked-ips/${encodeURIComponent(ip)}`, { method: 'DELETE' })).data
  },

  async unblockAll() {
    return (await request<JsonMap>('/api/security/unblock-all', { method: 'POST' })).data
  },

  async antiDdos() {
    return (await request<AntiDdosStatus>('/api/anti-ddos/status')).data
  },

  async antiDdosAction(action: 'start' | 'stop' | 'auto-scan' | 'lockdown' | 'sync') {
    return (await request<AntiDdosStatus>(`/api/anti-ddos/${action}`, { method: 'POST' })).data
  },

  async antiDdosSettings(data: JsonMap) {
    return (await request<AntiDdosStatus>('/api/anti-ddos/settings', { method: 'PUT', body: json(data) })).data
  },

  async lookup(kind: LookupKind | string, params: string | { search?: string; ids?: Array<string | number>; limit?: number } = '') {
    const query = new URLSearchParams()
    if (typeof params === 'string') {
      if (params) query.set('search', params)
    } else {
      if (params.search) query.set('search', params.search)
      if (params.ids?.length) query.set('ids', params.ids.map((id) => String(id)).join(','))
      if (params.limit !== undefined) query.set('limit', String(Math.min(Math.max(params.limit, 1), 200)))
    }
    const suffix = query.toString() ? `?${query.toString()}` : ''
    return (await request<LookupOption[]>(`/api/lookups/${encodeURIComponent(kind)}${suffix}`)).data
  },

  async playerAction(id: string | number, action: 'kick' | 'buff-item' | 'revoke-item', body: JsonMap = {}) {
    return (await request<JsonMap>(`/api/players/${encodeURIComponent(String(id))}/${action}`, {
      method: 'POST',
      body: json(body),
    })).data
  },

  async shopDetail(shopId: string | number) {
    return (await request<ShopDetail>(`/api/shops/${encodeURIComponent(String(shopId))}/detail`)).data
  },

  async shopTabDetail(tabId: string | number) {
    return (await request<ShopDetail>(`/api/shop-tabs/${encodeURIComponent(String(tabId))}/detail`)).data
  },

  async saveShopTabDetail(tabId: string | number, data: JsonMap, version: string) {
    return (await request<ShopDetail>(`/api/shop-tabs/${encodeURIComponent(String(tabId))}/detail`, {
      method: 'PUT',
      body: json({ data, version }),
    })).data
  },

  async giftcodeDetail(id: string | number) {
    return (await request<GiftcodeDetail>(`/api/giftcodes/${encodeURIComponent(String(id))}/detail`)).data
  },

  async saveGiftcodeDetail(data: JsonMap, version?: string, id?: string | number) {
    const path = id === undefined
      ? '/api/giftcodes/detail'
      : `/api/giftcodes/${encodeURIComponent(String(id))}/detail`
    const response = await request<GiftcodeDetail>(path, {
      method: id === undefined ? 'POST' : 'PUT',
      body: json({ data, ...(version ? { version } : {}) }),
    })
    return response.data
  },

  async resetGiftcodeUsedPlayers(id: string | number, version: string, playerIds: number[] = [], all = false) {
    return (await request<GiftcodeDetail>(`/api/giftcodes/${encodeURIComponent(String(id))}/used-players/reset`, {
      method: 'POST',
      body: json({ version, data: { playerIds, all } }),
    })).data
  },
}

export function clearAuth() {
  csrfToken = ''
}

export type { User }
