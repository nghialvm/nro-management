export type JsonMap = Record<string, unknown>

export interface ApiMeta {
  page?: number
  pageSize?: number
  total?: number
  resource?: string
  [key: string]: unknown
}

export type LookupKind =
  | 'items'
  | 'options'
  | 'maps'
  | 'mobs'
  | 'npcs'
  | 'parts'
  | 'skills'
  | 'tasks'
  | 'side-tasks'
  | 'clan-tasks'
  | 'kol-tasks'
  | 'event-tasks'
  | 'events'
  | 'accounts'
  | 'players'
  | 'clans'
  | 'shops'
  | 'shop-tabs'
  | 'shop-items'
  | 'shop-options'

export interface LookupOption {
  id: string | number
  label: string
  iconId?: number
  meta?: JsonMap
}

export interface ItemTemplateDetails extends LookupOption {
  meta?: JsonMap
}

export interface ShopOptionDetail {
  id?: number
  item_shop_id?: number
  option_id: number
  param: number
  optionTemplate?: LookupOption | null
}

export interface ShopItemDetail {
  id?: number
  tab_id?: number
  temp_id: number
  is_new: boolean
  is_sell: boolean
  type_sell: number
  cost: number
  costgold: number
  icon_spec: number
  create_time?: string | null
  version?: string
  itemTemplate?: ItemTemplateDetails | null
  options: ShopOptionDetail[]
}

export interface ShopTabDetail {
  id: number
  shop_id: number
  NAME: string
  version: string
  items: ShopItemDetail[]
}

export interface ShopDetail {
  shop: ResourceRow & {
    id: number
    npc_id: number
    tag_name?: string
    type_shop?: number
    version: string
    npc?: LookupOption | null
  }
  tabs: ShopTabDetail[]
  version: string
}

export interface GiftcodeReward {
  id: number
  quantity: number
  itemTemplate?: ItemTemplateDetails | null
}

export interface GiftcodeOption {
  id: number
  param: number
  optionTemplate?: LookupOption | null
}

export interface GiftcodeDetail {
  id?: number
  code: string
  count_left: number
  datecreate?: string | null
  expired: string
  rewards: GiftcodeReward[]
  options: GiftcodeOption[]
  usedPlayerIds: number[]
  usedPlayers: LookupOption[]
  rawItem?: string
  rawOption?: string
  rawUsedPlayers?: string
  validation?: Record<string, string>
  version?: string
}

export interface ApiEnvelope<T> {
  data: T
  meta?: ApiMeta
}

export interface ApiErrorBody {
  error: {
    code: string
    message: string
    fields?: JsonMap
  }
  requestId?: string
}

export interface User {
  id: number
  username: string
  isAdmin: boolean
}

export interface AuthData {
  user: User
  csrfToken: string
  expiresInSeconds?: number
}

export interface ResourceRow extends JsonMap {
  id?: string | number
  version?: string
}

export interface DashboardSnapshot {
  serverRunning: boolean
  serverName: string
  gamePort: number
  startTime?: string
  heapUsedBytes: number
  heapMaxBytes: number
  heapUsedPercent: number
  cpuLoad: number
  threads: number
  sessions: number
  onlinePlayers: number
  bossAlive: number
  bossDead: number
  bossResting: number
  events: Record<string, boolean>
  antiDdos: Record<string, unknown>
}

export interface EventConfig {
  events: Array<{ id: number; name: string; active: boolean }>
  activeIds: number[]
  runtimeUsesFirstEventOnly: boolean
}

export interface BossConfigRow {
  key: string
  data: JsonMap
  overridden: boolean
  version: string
}

export interface AntiDdosStatus {
  running: boolean
  autoScan: boolean
  lockdown: boolean
  gamePort: number
  connLimit: number
  scanSeconds: number
  mode: string
}

export const moduleDefinitions = [
  { key: 'dashboard', path: '/', label: 'Tổng quan' },
  { key: 'accounts', path: '/accounts', label: 'Tài khoản' },
  { key: 'players', path: '/players', label: 'Người chơi' },
  { key: 'shops', path: '/shops', label: 'Cửa hàng / Shop' },
  { key: 'giftcodes', path: '/giftcodes', label: 'Giftcode' },
  { key: 'topup-rewards', path: '/topup-rewards', label: 'Nạp & phần thưởng' },
  { key: 'events', path: '/events', label: 'Sự kiện' },
  { key: 'badges', path: '/badges', label: 'Danh hiệu' },
  { key: 'maps', path: '/maps', label: 'Dữ liệu bản đồ' },
  { key: 'items', path: '/items', label: 'Dữ liệu vật phẩm' },
  { key: 'transactions', path: '/transactions', label: 'Lịch sử giao dịch' },
  { key: 'radar', path: '/radar', label: 'Radar' },
  { key: 'parts', path: '/parts', label: 'Part / Avatar' },
  { key: 'drops', path: '/drops', label: 'Drop item' },
  { key: 'bosses', path: '/bosses', label: 'Cấu hình Boss' },
  { key: 'security', path: '/security', label: 'Bảo mật' },
  { key: 'anti-ddos', path: '/anti-ddos', label: 'Anti-DDoS' },
] as const
