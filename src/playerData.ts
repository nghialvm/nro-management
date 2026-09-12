export type PlayerItemFormat = 'string-items' | 'structured-items'

export interface PlayerOptionValue {
  id: number
  param: number
}

export interface PlayerItemEntry {
  index: number
  raw: unknown
  itemId: number
  quantity: number
  options: PlayerOptionValue[]
  optionsRaw: unknown
  format: 'array' | 'object'
}

export interface ParsedPlayerItems {
  entries: PlayerItemEntry[]
  format: PlayerItemFormat
  error?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function integer(value: unknown, fallback = 0) {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isSafeInteger(number) ? number : fallback
}

export function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function parseJsonValue(raw: unknown): { value: unknown; valid: boolean; rawText: string; error?: string } {
  if (raw === null || raw === undefined || raw === '') return { value: null, valid: true, rawText: '' }
  if (typeof raw !== 'string') return { value: cloneValue(raw), valid: true, rawText: JSON.stringify(raw) }
  if (!raw.trim()) return { value: null, valid: true, rawText: raw }
  try {
    return { value: JSON.parse(raw) as unknown, valid: true, rawText: raw }
  } catch (error) {
    return { value: null, valid: false, rawText: raw, error: error instanceof Error ? error.message : 'JSON không hợp lệ' }
  }
}

export function parseNestedJson(raw: unknown): { value: unknown; valid: boolean } {
  let value = raw
  for (let depth = 0; depth < 4 && typeof value === 'string'; depth += 1) {
    const parsed = parseJsonValue(value)
    if (!parsed.valid) return { value: null, valid: false }
    value = parsed.value
  }
  return { value, valid: true }
}

export function parsePlayerOptions(raw: unknown): { options: PlayerOptionValue[]; valid: boolean } {
  const nested = parseNestedJson(raw)
  if (!nested.valid || !Array.isArray(nested.value)) return { options: [], valid: false }
  const options: PlayerOptionValue[] = []
  for (const value of nested.value) {
    const pair = parseNestedJson(value)
    if (!pair.valid || !Array.isArray(pair.value) || pair.value.length < 2) return { options: [], valid: false }
    const id = integer(pair.value[0], Number.NaN)
    const param = integer(pair.value[1], Number.NaN)
    if (!Number.isSafeInteger(id) || !Number.isSafeInteger(param)) return { options: [], valid: false }
    options.push({ id, param })
  }
  return { options, valid: true }
}

export function serializePlayerOptions(options: PlayerOptionValue[], original: unknown): unknown {
  const pairs = options.map((option) => [Number(option.id), Number(option.param)])
  return typeof original === 'string'
    ? JSON.stringify(pairs.map((pair) => JSON.stringify(pair)))
    : pairs
}

function parseItemEntry(raw: unknown, index: number): { entry?: PlayerItemEntry; error?: string } {
  const nested = parseNestedJson(raw)
  if (!nested.valid) return { error: `Vật phẩm tại vị trí ${index} có JSON không hợp lệ` }
  const value = nested.value
  if (Array.isArray(value)) {
    if (value.length < 3) return { error: `Vật phẩm tại vị trí ${index} thiếu dữ liệu` }
    const itemId = integer(value[0], Number.NaN)
    const quantity = integer(value[1], Number.NaN)
    if (!Number.isSafeInteger(itemId) || !Number.isSafeInteger(quantity)) return { error: `Vật phẩm tại vị trí ${index} có ID/số lượng không hợp lệ` }
    const optionsRaw = value[2]
    const parsedOptions = parsePlayerOptions(optionsRaw)
    if (!parsedOptions.valid) return { error: `Options của vật phẩm tại vị trí ${index} không hợp lệ` }
    return { entry: { index, raw: cloneValue(value), itemId, quantity, options: parsedOptions.options, optionsRaw: cloneValue(optionsRaw), format: 'array' } }
  }
  if (isRecord(value)) {
    const idValue = value.temp_id ?? value.item_id ?? value.itemId ?? value.id
    const optionsRaw = value.options ?? value.option ?? []
    const itemId = integer(idValue, Number.NaN)
    const quantity = integer(value.quantity ?? value.count ?? value.sl, Number.NaN)
    if (!Number.isSafeInteger(itemId) || !Number.isSafeInteger(quantity)) return { error: `Vật phẩm tại vị trí ${index} có ID/số lượng không hợp lệ` }
    const parsedOptions = parsePlayerOptions(optionsRaw)
    if (!parsedOptions.valid) return { error: `Options của vật phẩm tại vị trí ${index} không hợp lệ` }
    return { entry: { index, raw: cloneValue(value), itemId, quantity, options: parsedOptions.options, optionsRaw: cloneValue(optionsRaw), format: 'object' } }
  }
  return { error: `Vật phẩm tại vị trí ${index} không phải array/object` }
}

export function parsePlayerItems(raw: unknown): ParsedPlayerItems {
  const parsed = parseJsonValue(raw)
  if (!parsed.valid || !Array.isArray(parsed.value)) return { entries: [], format: 'string-items', error: parsed.error ?? 'Dữ liệu vật phẩm phải là JSON array' }
  const entries: PlayerItemEntry[] = []
  const stringItems = parsed.value.length === 0 || parsed.value.every((value) => typeof value === 'string')
  for (let index = 0; index < parsed.value.length; index += 1) {
    const result = parseItemEntry(parsed.value[index], index)
    if (result.error) return { entries, format: stringItems ? 'string-items' : 'structured-items', error: result.error }
    if (result.entry) entries.push(result.entry)
  }
  return { entries, format: stringItems ? 'string-items' : 'structured-items' }
}

function serializeItemEntry(entry: PlayerItemEntry) {
  const raw = cloneValue(entry.raw)
  if (Array.isArray(raw)) {
    raw[0] = Number(entry.itemId)
    raw[1] = Number(entry.quantity)
    raw[2] = serializePlayerOptions(entry.options, raw[2])
    return raw
  }
  if (isRecord(raw)) {
    const idKey = Object.prototype.hasOwnProperty.call(raw, 'temp_id') ? 'temp_id'
      : Object.prototype.hasOwnProperty.call(raw, 'item_id') ? 'item_id'
        : Object.prototype.hasOwnProperty.call(raw, 'itemId') ? 'itemId' : 'id'
    const quantityKey = Object.prototype.hasOwnProperty.call(raw, 'quantity') ? 'quantity'
      : Object.prototype.hasOwnProperty.call(raw, 'count') ? 'count' : 'sl'
    const optionsKey = Object.prototype.hasOwnProperty.call(raw, 'options') ? 'options' : 'option'
    raw[idKey] = Number(entry.itemId)
    raw[quantityKey] = Number(entry.quantity)
    raw[optionsKey] = serializePlayerOptions(entry.options, raw[optionsKey])
    return raw
  }
  return raw
}

export function serializePlayerItems(entries: PlayerItemEntry[], format: PlayerItemFormat): string {
  const values = entries.map(serializeItemEntry)
  return JSON.stringify(format === 'string-items' ? values.map((value) => JSON.stringify(value)) : values)
}

export function emptyPlayerItem(template?: PlayerItemEntry): PlayerItemEntry {
  if (template) {
    const raw = cloneValue(template.raw)
    if (Array.isArray(raw)) {
      raw[0] = -1
      raw[1] = 0
      raw[2] = serializePlayerOptions([], raw[2])
    } else if (isRecord(raw)) {
      const idKey = Object.prototype.hasOwnProperty.call(raw, 'temp_id') ? 'temp_id'
        : Object.prototype.hasOwnProperty.call(raw, 'item_id') ? 'item_id'
          : Object.prototype.hasOwnProperty.call(raw, 'itemId') ? 'itemId' : 'id'
      const quantityKey = Object.prototype.hasOwnProperty.call(raw, 'quantity') ? 'quantity'
        : Object.prototype.hasOwnProperty.call(raw, 'count') ? 'count' : 'sl'
      const optionsKey = Object.prototype.hasOwnProperty.call(raw, 'options') ? 'options' : 'option'
      raw[idKey] = -1
      raw[quantityKey] = 0
      raw[optionsKey] = serializePlayerOptions([], raw[optionsKey])
    }
    return { ...template, raw, itemId: -1, quantity: 0, options: [], optionsRaw: Array.isArray(raw) ? raw[2] : [] }
  }
  return { index: 0, raw: [-1, 0, '[]', 0], itemId: -1, quantity: 0, options: [], optionsRaw: '[]', format: 'array' }
}

export function updateJsonArrayValue(raw: unknown, index: number, value: unknown): string {
  const parsed = parseJsonValue(raw)
  const array = Array.isArray(parsed.value) ? [...parsed.value] : []
  array[index] = value
  return JSON.stringify(array)
}

export function numberOrText(value: string): number | string {
  return /^-?\d+$/.test(value.trim()) ? Number(value) : value
}
