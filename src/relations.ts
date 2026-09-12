import type { JsonMap, LookupKind, ResourceRow } from './types'

export type ReferenceKind = LookupKind | 'icons'

export interface ReferenceToken {
  kind: ReferenceKind
  value: string | number
  path: string
}

const commonFields: Record<string, ReferenceKind> = {
  item_id: 'items',
  itemId: 'items',
  idItem: 'items',
  temp_id: 'items',
  tempId: 'items',
  option_id: 'options',
  optionId: 'options',
  map_id: 'maps',
  mapId: 'maps',
  mob_id: 'mobs',
  mobId: 'mobs',
  npc_id: 'npcs',
  npcId: 'npcs',
  account_id: 'accounts',
  accountId: 'accounts',
  user_id: 'accounts',
  userId: 'accounts',
  player_id: 'players',
  playerId: 'players',
  clan_id: 'clans',
  clanId: 'clans',
  shop_id: 'shops',
  shopId: 'shops',
  tab_id: 'shop-tabs',
  tabId: 'shop-tabs',
  item_shop_id: 'shop-items',
  itemShopId: 'shop-items',
  skill_id: 'skills',
  skillId: 'skills',
  skillTemp: 'skills',
  id_event: 'events',
  eventId: 'events',
  icon_id: 'icons',
  iconId: 'icons',
  icon_spec: 'icons',
}

const resourceFields: Record<string, Record<string, ReferenceKind>> = {
  players: { head: 'parts' },
  items: { part: 'parts', head: 'parts', body: 'parts', leg: 'parts' },
  'head-avatars': { head_id: 'parts', avatar_id: 'parts' },
  'head-frames': { data: 'icons' },
  radar: { body: 'parts' },
  bosses: { mapJoin: 'maps', outfit: 'parts' },
}

function isNumericId(value: unknown): value is string | number {
  if (typeof value === 'number') {
    return Number.isInteger(value) && Number.isSafeInteger(value)
      && value >= -2_147_483_648 && value <= 2_147_483_647
  }
  if (typeof value !== 'string' || !/^-?\d+$/.test(value.trim())) return false
  const numeric = Number(value.trim())
  return Number.isSafeInteger(numeric) && numeric >= -2_147_483_648 && numeric <= 2_147_483_647
}

export function referenceKindForField(resource: string, field: string, parentKey = ''): ReferenceKind | undefined {
  const resourceMatch = resourceFields[resource]?.[field]
  if (resourceMatch) return resourceMatch
  const commonMatch = commonFields[field]
  if (commonMatch) return commonMatch

  if (field === 'head_id' || field === 'avatar_id') return 'parts'
  if (field === 'id' && /(^|_)(item|items|reward|inventory|bag|box)(_|$)/i.test(parentKey)) return 'items'
  if (field === 'id' && /(^|_)(option|options)(_|$)/i.test(parentKey)) return 'options'
  if (field === 'id' && parentKey === 'mobs') return 'mobs'
  if (field === 'id' && parentKey === 'npcs') return 'npcs'
  if (parentKey === 'mapJoin') return 'maps'
  if (parentKey === 'skillTemp') return 'skills'
  if (parentKey === 'outfit') return 'parts'
  return undefined
}

function pathFor(parent: string, key: string | number) {
  if (typeof key === 'number') return `${parent}[${key}]`
  return parent ? `${parent}.${key}` : key
}

function addReference(result: ReferenceToken[], kind: ReferenceKind, value: unknown, path: string) {
  if (!isNumericId(value)) return
  const normalized = typeof value === 'string' ? value.trim() : value
  result.push({ kind, value: normalized, path })
}

const itemContainers = /(^|_)(item|items|reward|inventory|bag|box)(_|$)/i
const primitiveContainers: Record<string, ReferenceKind> = {
  mapJoin: 'maps',
  skillTemp: 'skills',
  outfit: 'parts',
  options: 'options',
  mobs: 'mobs',
  npcs: 'npcs',
}
const taskContainers: Record<string, ReferenceKind> = {
  data_task: 'tasks',
  data_side_task: 'side-tasks',
  data_clan_task: 'clan-tasks',
  data_kol_task: 'kol-tasks',
  data_event_task: 'event-tasks',
}
const iconContainers = new Set(['DATA', 'data', 'iconData', 'icons'])

function isItemContainer(parentKey: string) {
  // Player data_inventory/data_item_time contain currency/timestamps, not item
  // template ids. Keep these ambiguous backend fields out of item lookups.
  return !/^data_/i.test(parentKey) && itemContainers.test(parentKey)
}

function collectValue(result: ReferenceToken[], resource: string, value: unknown, path: string, parentKey = '') {
  if (typeof value === 'string') {
    const parsed = parseJsonDocument(value)
    if (parsed !== null && typeof parsed !== 'string') collectValue(result, resource, parsed, path, parentKey)
    return
  }
  if (Array.isArray(value)) {
    const taskKind = taskContainers[parentKey]
    if (taskKind && value.length > 0 && isNumericId(value[0])) {
      addReference(result, taskKind, value[0], pathFor(path, 0))
    }
    if (isItemContainer(parentKey)) {
      if (value.length > 0 && isNumericId(value[0])) {
        addReference(result, 'items', value[0], pathFor(path, 0))
        if (value.length > 2) collectValue(result, resource, value[2], pathFor(path, 2), 'options')
      } else {
        value.forEach((entry, index) => {
          if (Array.isArray(entry) && isNumericId(entry[0])) {
            addReference(result, 'items', entry[0], pathFor(pathFor(path, index), 0))
          }
          collectValue(result, resource, entry, pathFor(path, index), parentKey)
        })
      }
      return
    }
    const primitiveKind = primitiveContainers[parentKey]
    if (primitiveKind) {
      value.forEach((entry, index) => {
        if (isNumericId(entry)) addReference(result, primitiveKind, entry, pathFor(path, index))
        else collectValue(result, resource, entry, pathFor(path, index), parentKey)
      })
      return
    }
    if (iconContainers.has(parentKey)) {
      if (value.length > 0 && isNumericId(value[0])) {
        addReference(result, 'icons', value[0], pathFor(path, 0))
      } else {
        value.forEach((entry, index) => {
          if (Array.isArray(entry) && isNumericId(entry[0])) {
            addReference(result, 'icons', entry[0], pathFor(pathFor(path, index), 0))
          }
        })
      }
      return
    }
    value.forEach((entry, index) => collectValue(result, resource, entry, pathFor(path, index), parentKey))
    return
  }
  if (!value || typeof value !== 'object') return
  Object.entries(value as JsonMap).forEach(([key, entry]) => {
    const childPath = pathFor(path, key)
    const kind = referenceKindForField(resource, key, parentKey)
    if (kind && isNumericId(entry)) {
      addReference(result, kind, entry, childPath)
      return
    }
    if (typeof entry === 'string') {
      collectValue(result, resource, entry, childPath, key)
      return
    }
    collectValue(result, resource, entry, childPath, key)
  })
}

export function collectReferences(value: unknown, resource: string, path = ''): ReferenceToken[] {
  const result: ReferenceToken[] = []
  collectValue(result, resource, value, path)
  return result
}

export function collectFieldReferences(value: unknown, resource: string, field: string): ReferenceToken[] {
  const result: ReferenceToken[] = []
  collectValue(result, resource, value, field, field)
  return result
}

export function collectRowReferences(rows: ResourceRow[], resource: string): ReferenceToken[] {
  const result: ReferenceToken[] = []
  rows.forEach((row, rowIndex) => {
    Object.entries(row).forEach(([field, value]) => {
      if (field === 'version') return
      const path = `row[${rowIndex}].${field}`
      const kind = referenceKindForField(resource, field)
      if (kind && isNumericId(value)) {
        addReference(result, kind, value, path)
      } else if (typeof value === 'string') {
        const parsed = parseJsonDocument(value)
        if (parsed !== null) collectValue(result, resource, parsed, path, field)
      } else if (value && typeof value === 'object') {
        collectValue(result, resource, value, path, field)
      }
    })
  })
  return result
}

export function uniqueReferenceIds(references: ReferenceToken[]) {
  const result = new Map<ReferenceKind, string[]>()
  references.forEach(({ kind, value }) => {
    if (kind === 'icons') return
    const key = String(value)
    const values = result.get(kind) ?? []
    if (!values.includes(key)) values.push(key)
    result.set(kind, values)
  })
  return result
}

export function parseJsonDocument(value: string): unknown | null {
  if (!value.trim()) return null
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

export function isJsonObjectDocument(value: string) {
  const parsed = parseJsonDocument(value)
  return Boolean(parsed && typeof parsed === 'object' && !Array.isArray(parsed))
}

export function referenceKindLabel(kind: ReferenceKind) {
  const labels: Record<ReferenceKind, string> = {
    icons: 'Icon',
    items: 'Vật phẩm',
    options: 'Option',
    maps: 'Bản đồ',
    mobs: 'Quái',
    npcs: 'NPC',
    parts: 'Part',
    skills: 'Skill',
    events: 'Sự kiện',
    accounts: 'Tài khoản',
    players: 'Người chơi',
    clans: 'Clan',
    shops: 'Shop',
    'shop-tabs': 'Shop tab',
    'shop-items': 'Shop item',
    'shop-options': 'Shop option',
    tasks: 'Nhiệm vụ chính',
    'side-tasks': 'Nhiệm vụ hằng ngày',
    'clan-tasks': 'Nhiệm vụ clan',
    'kol-tasks': 'Nhiệm vụ KOL',
    'event-tasks': 'Nhiệm vụ sự kiện',
  }
  return labels[kind]
}

export function displayId(value: string | number) {
  return `#${String(value)}`
}
