import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Database,
  FileCode2,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { api, ApiRequestError } from './api'
import {
  IconPreview,
  JsonReferencePreview,
  LookupSelect,
  ReferenceCell,
  ReferenceThumbnail,
  ResolvedReference,
  useReferenceCatalog,
  useRowReferenceCatalog,
  type ReferenceCatalog,
} from './ReferenceDisplay'
import {
  collectFieldReferences,
  collectReferences,
  displayId,
  parseJsonDocument,
  type ReferenceToken,
} from './relations'
import {
  buildPlayerUpdatePayload,
  cloneValue,
  emptyPlayerItem,
  numberOrText,
  parseJsonValue,
  parseNestedJson,
  parsePlayerItems,
  serializePlayerItems,
  serializePlayerOptions,
  type ParsedPlayerItems,
  type PlayerItemEntry,
  type PlayerOptionValue,
} from './playerData'
import type { JsonMap, LookupOption, ResourceRow } from './types'

type PlayerMainTab = 'general' | 'items' | 'pet' | 'tasks' | 'badges'
type PlayerItemField = 'items_body' | 'items_bag' | 'items_box'
type JsonPlayerField = PlayerItemField | 'data_point' | 'data_inventory' | 'pet' | 'data_task' | 'data_side_task' | 'data_clan_task' | 'data_kol_task' | 'dataBadges'

const itemTabs: Array<{ key: PlayerItemField; label: string }> = [
  { key: 'items_body', label: 'Đồ đang mặc' },
  { key: 'items_bag', label: 'Hành trang' },
  { key: 'items_box', label: 'Rương đồ' },
]

type TaskLookupKind = 'tasks' | 'side-tasks' | 'clan-tasks' | 'kol-tasks' | 'event-tasks'

const jsonPlayerFields: JsonPlayerField[] = [
  'data_point', 'data_inventory', 'items_body', 'items_bag', 'items_box', 'pet',
  'data_task', 'data_side_task', 'data_clan_task', 'data_kol_task', 'dataBadges',
]

const pointFields = [
  ['Sức mạnh', 1],
  ['Tiềm năng', 2],
  ['HP gốc', 5],
  ['KI gốc', 6],
  ['Sức đánh', 7],
  ['Giáp', 8],
  ['Chí mạng', 9],
  ['HP hiện tại', 11],
  ['KI hiện tại', 12],
  ['Sức đánh hiện tại', 13],
  ['HP tối đa', 14],
  ['KI tối đa', 15],
] as const

const taskFields: Array<{ field: JsonPlayerField; title: string; labels: string[]; kind: TaskLookupKind }> = [
  { field: 'data_task', title: 'Nhiệm vụ chính tuyến', labels: ['ID nhiệm vụ', 'Index', 'Count', 'Last time'], kind: 'tasks' },
  { field: 'data_side_task', title: 'Nhiệm vụ hằng ngày', labels: ['ID nhiệm vụ', 'Thời điểm nhận', 'Count', 'Max count', 'Còn lại', 'Level'], kind: 'side-tasks' },
  { field: 'data_clan_task', title: 'Nhiệm vụ clan', labels: ['ID nhiệm vụ', 'Thời điểm nhận', 'Count', 'Max count', 'Còn lại', 'Level'], kind: 'clan-tasks' },
  { field: 'data_kol_task', title: 'Nhiệm vụ KOL', labels: ['ID nhiệm vụ', 'Giá trị 2', 'Giá trị 3', 'Giá trị 4', 'Giá trị 5'], kind: 'kol-tasks' },
]

function asText(value: unknown, fallback: unknown = '') {
  return value === null || value === undefined ? String(fallback) : String(value)
}

function numericId(value: unknown): number | undefined {
  const result = Number(value)
  return Number.isSafeInteger(result) && result >= 0 ? result : undefined
}

function dateText(value: unknown) {
  if (!value) return '—'
  const date = new Date(String(value))
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('vi-VN')
}

function errorText(error: unknown) {
  if (error instanceof ApiRequestError && error.status === 409) return 'Dữ liệu đã bị thay đổi bởi admin khác (HTTP 409). Hãy tải lại trước khi lưu.'
  return error instanceof Error ? error.message : 'Có lỗi xảy ra'
}

function jsonText(value: unknown) {
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return ''
  return JSON.stringify(value, null, 2)
}

function safeJson(value: unknown) {
  const parsed = parseJsonValue(value)
  return parsed.valid ? parsed.value : null
}

function itemTemplate(catalog: ReferenceCatalog, id: number) {
  return catalog.get('items')?.get(String(id))
}

function optionTemplate(catalog: ReferenceCatalog, id: number) {
  return catalog.get('options')?.get(String(id))
}

function createFilledPlayerItem(itemId: number, quantity: number, template?: PlayerItemEntry): PlayerItemEntry {
  const empty = emptyPlayerItem(template)
  const raw = cloneValue(empty.raw)
  if (Array.isArray(raw)) {
    raw[0] = itemId
    raw[1] = quantity
    raw[2] = serializePlayerOptions([], raw[2])
  } else if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>
    const idKey = Object.prototype.hasOwnProperty.call(record, 'temp_id') ? 'temp_id'
      : Object.prototype.hasOwnProperty.call(record, 'item_id') ? 'item_id'
        : Object.prototype.hasOwnProperty.call(record, 'itemId') ? 'itemId' : 'id'
    const quantityKey = Object.prototype.hasOwnProperty.call(record, 'quantity') ? 'quantity'
      : Object.prototype.hasOwnProperty.call(record, 'count') ? 'count' : 'sl'
    const optionsKey = Object.prototype.hasOwnProperty.call(record, 'options') ? 'options' : 'option'
    record[idKey] = itemId
    record[quantityKey] = quantity
    record[optionsKey] = serializePlayerOptions([], record[optionsKey])
  }
  return { ...empty, raw, itemId, quantity, options: [], optionsRaw: Array.isArray(raw) ? raw[2] : [] }
}

function addPlayerReferences(result: ReferenceToken[], draft: ResourceRow | null, parsedItems: Record<PlayerItemField, ParsedPlayerItems>) {
  if (!draft) return
  const base = collectReferences({ account_id: draft.account_id, head: draft.head, clan_id: draft.clan_id }, 'players')
  result.push(...base)
  for (const field of jsonPlayerFields) {
    if (field === 'items_body' || field === 'items_bag' || field === 'items_box') {
      const parsed = parsedItems[field]
      if (!parsed.error) {
        parsed.entries.filter((entry) => entry.itemId >= 0).forEach((entry) => {
          result.push({ kind: 'items', value: entry.itemId, path: `${field}[${entry.index}][0]` })
          entry.options.forEach((option, optionIndex) => result.push({ kind: 'options', value: option.id, path: `${field}[${entry.index}][2][${optionIndex}]` }))
        })
      }
      continue
    }
    const value = safeJson(draft[field])
    if (value !== null) result.push(...collectFieldReferences(value, 'players', field))
  }
}

function updateArrayField(raw: unknown, index: number, value: unknown) {
  const parsed = parseJsonValue(raw)
  const array = Array.isArray(parsed.value) ? cloneValue(parsed.value) as unknown[] : []
  array[index] = value
  return JSON.stringify(array)
}

function parseArraySlot(raw: unknown, index: number): unknown[] | null {
  const parsed = parseJsonValue(raw)
  if (!Array.isArray(parsed.value)) return null
  const nested = parseNestedJson(parsed.value[index])
  return Array.isArray(nested.value) ? cloneValue(nested.value) as unknown[] : null
}

function updateNestedArray(raw: unknown, slot: number, index: number, value: unknown) {
  const parsed = parseJsonValue(raw)
  if (!Array.isArray(parsed.value)) return jsonText(raw)
  const outer = cloneValue(parsed.value) as unknown[]
  const nested = parseNestedJson(outer[slot])
  if (!Array.isArray(nested.value)) return jsonText(raw)
  const next = cloneValue(nested.value) as unknown[]
  next[index] = value
  outer[slot] = typeof outer[slot] === 'string' ? JSON.stringify(next) : next
  return JSON.stringify(outer)
}

function validPlayerDraft(draft: ResourceRow | null, parsedItems: Record<PlayerItemField, ParsedPlayerItems>) {
  if (!draft) return false
  if (jsonPlayerFields.some((field) => !parseJsonValue(draft[field]).valid)) return false
  return !Object.values(parsedItems).some((parsed) => Boolean(parsed.error))
}

export function PlayerPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [mainTab, setMainTab] = useState<PlayerMainTab>('general')
  const [itemField, setItemField] = useState<PlayerItemField>('items_body')
  const [draft, setDraft] = useState<ResourceRow | null>(null)

  const listQuery = useQuery({
    queryKey: ['players', page, search],
    queryFn: () => api.list('players', { page, pageSize: 50, search }),
  })
  const rows = listQuery.data?.data ?? []
  const rowLookup = useRowReferenceCatalog(rows, 'players')
  const detailQuery = useQuery({
    queryKey: ['player-detail', selectedId],
    queryFn: () => api.get('players', selectedId as number),
    enabled: selectedId !== null,
  })
  const parsedItems = useMemo<Record<PlayerItemField, ParsedPlayerItems>>(() => ({
    items_body: parsePlayerItems(draft?.items_body),
    items_bag: parsePlayerItems(draft?.items_bag),
    items_box: parsePlayerItems(draft?.items_box),
  }), [draft])
  const playerReferences = useMemo(() => {
    const references: ReferenceToken[] = []
    addPlayerReferences(references, draft, parsedItems)
    return references
  }, [draft, parsedItems])
  const lookup = useReferenceCatalog(playerReferences)

  useEffect(() => {
    if (!detailQuery.data) return
    setDraft(cloneValue(detailQuery.data))
    setMainTab('general')
    setItemField('items_body')
  }, [detailQuery.data?.id, detailQuery.data?.version])

  const source = detailQuery.data
  const savePayload = useMemo(
    () => draft && source ? buildPlayerUpdatePayload(draft, source) : null,
    [draft, source],
  )
  const dirty = Boolean(savePayload && Object.keys(savePayload).some((field) => field !== 'id'))
  const valid = validPlayerDraft(draft, parsedItems)
  const save = useMutation({
    mutationFn: async () => {
      if (!draft || draft.id === undefined) throw new Error('Chưa chọn nhân vật')
      if (!valid) throw new Error('Dữ liệu nhân vật chưa hợp lệ')
      if (!source || !savePayload || !dirty) throw new Error('Không có thay đổi để lưu')
      return api.save('players', savePayload, source.version)
    },
    onSuccess: (data) => {
      if (selectedId !== null) queryClient.setQueryData(['player-detail', selectedId], data)
      queryClient.invalidateQueries({ queryKey: ['players'] })
      setDraft(cloneValue(data))
    },
  })
  const playerAction = useMutation({
    mutationFn: ({ id, action, body }: { id: number; action: 'kick' | 'buff-item' | 'revoke-item'; body?: JsonMap }) => api.playerAction(id, action, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['players'] })
      if (!dirty && selectedId !== null) queryClient.invalidateQueries({ queryKey: ['player-detail', selectedId] })
    },
  })

  const openPlayer = (row: ResourceRow) => {
    const id = numericId(row.id)
    if (id === undefined) return
    setSelectedId(id)
    setDraft(null)
  }
  const closePlayer = () => {
    if (dirty && !window.confirm('Nhân vật có thay đổi chưa lưu. Đóng cửa sổ?')) return
    setSelectedId(null)
    setDraft(null)
  }
  const updateField = (field: string, value: unknown) => setDraft((current) => current ? { ...current, [field]: value } : current)
  const updateJsonField = (field: JsonPlayerField, value: string) => updateField(field, value)
  const updateArrayIndex = (field: JsonPlayerField, index: number, value: string) => updateJsonField(field, updateArrayField(draft?.[field], index, numberOrText(value)))

  const lastPage = Math.max(1, Math.ceil(Number(listQuery.data?.meta?.total ?? 0) / Number(listQuery.data?.meta?.pageSize ?? 50)))

  return <>
    <div className="page-header">
      <div><p className="eyebrow">NRO MANAGEMENT</p><h2>Người chơi</h2><p className="muted">Mở một nhân vật để chỉnh sửa theo từng nhóm giống màn hình Java Swing.</p></div>
      <div className="page-actions"><button className="secondary" onClick={() => listQuery.refetch()}><RefreshCw size={16} /> Làm mới</button></div>
    </div>
    {listQuery.isError && <div className="alert danger"><AlertTriangle size={16} />{errorText(listQuery.error)}</div>}
    <section className="panel table-panel">
      <div className="table-toolbar"><div className="toolbar-search"><Search size={17} /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Tìm tên, ID nhân vật..." /></div><div className="toolbar-meta"><span>{String(listQuery.data?.meta?.total ?? 0)} nhân vật</span><button className="icon-button" onClick={() => listQuery.refetch()} aria-label="Làm mới"><RefreshCw size={16} /></button></div></div>
      {listQuery.isLoading ? <div className="table-empty"><RefreshCw className="spin" size={20} /> Đang tải danh sách nhân vật…</div> : !rows.length ? <div className="table-empty"><Database size={22} /><strong>Chưa có nhân vật</strong><span className="muted">Thử đổi điều kiện tìm kiếm.</span></div> : <div className="table-scroll"><table className="player-list-table"><thead><tr><th>ID</th><th>Tên</th><th>Tài khoản</th><th>Head</th><th>Clan</th><th>Đăng nhập gần nhất</th><th /></tr></thead><tbody>{rows.map((row, index) => <tr key={`${String(row.id ?? index)}-${index}`} className="clickable" onClick={() => openPlayer(row)}><td>{displayId(row.id ?? '—')}</td><td><strong>{asText(row.name, 'Không tên')}</strong></td><td><ReferenceCell value={row.account_id} resource="players" field="account_id" catalog={rowLookup.catalog} /></td><td><ReferenceCell value={row.head} resource="players" field="head" catalog={rowLookup.catalog} /></td><td><ReferenceCell value={row.clan_id} resource="players" field="clan_id" catalog={rowLookup.catalog} /></td><td>{dateText(row.LastTimeLoginGame)}</td><td><button className="mini-action" onClick={(event) => { event.stopPropagation(); const id = numericId(row.id); if (id !== undefined && window.confirm(`Kick ${asText(row.name, row.id)}?`)) playerAction.mutate({ id, action: 'kick' }) }}>Kick</button></td></tr>)}</tbody></table></div>}
    </section>
    <div className="pagination"><span>{listQuery.data?.meta?.total ?? 0} bản ghi</span><div><button className="icon-button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={16} /></button><strong>Trang {page} / {lastPage}</strong><button className="icon-button" disabled={page >= lastPage} onClick={() => setPage((value) => value + 1)}><ChevronRight size={16} /></button></div></div>
    {selectedId !== null && <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && closePlayer()}><aside className="management-detail-drawer player-detail-drawer" role="dialog" aria-modal="true" aria-label={`Chỉnh sửa nhân vật #${selectedId}`}>
      <div className="drawer-heading player-drawer-heading"><div><p className="eyebrow">PLAYER DETAIL</p><h3>Chỉnh sửa chi tiết · #{selectedId} {dirty && <span className="dirty-badge">Chưa lưu</span>}</h3><p className="muted">Tab đang mở: {mainTab === 'general' ? 'Thông tin chung' : mainTab === 'items' ? 'Vật phẩm' : mainTab === 'pet' ? 'Đệ tử' : mainTab === 'tasks' ? 'Nhiệm vụ' : 'Danh hiệu'}</p></div><button className="icon-button" onClick={closePlayer} aria-label="Đóng chi tiết"><X size={19} /></button></div>
      <div className="drawer-body player-detail-body">
        {detailQuery.isLoading && <div className="table-empty"><RefreshCw className="spin" size={20} /> Đang tải dữ liệu nhân vật…</div>}
        {detailQuery.isError && <div className="alert danger"><AlertTriangle size={16} />{errorText(detailQuery.error)}</div>}
        {draft && <>
          <PlayerSummary draft={draft} catalog={lookup.catalog} />
          <nav className="player-main-tabs" aria-label="Nhóm dữ liệu nhân vật">{([['general', 'Thông tin chung'], ['items', 'Vật phẩm'], ['pet', 'Đệ tử'], ['tasks', 'Nhiệm vụ'], ['badges', 'Danh hiệu (Badges)']] as Array<[PlayerMainTab, string]>).map(([key, label]) => <button key={key} className={mainTab === key ? 'active' : ''} onClick={() => setMainTab(key)}>{label}</button>)}</nav>
          {mainTab === 'general' && <GeneralTab draft={draft} catalog={lookup.catalog} onFieldChange={updateField} onJsonChange={updateJsonField} onArrayIndexChange={updateArrayIndex} />}
          {mainTab === 'items' && <ItemsTab draft={draft} field={itemField} parsed={parsedItems[itemField]} catalog={lookup.catalog} onFieldChange={updateField} onJsonChange={updateJsonField} onSelectField={setItemField} onAction={(action, body) => { const id = numericId(draft.id); if (id !== undefined) playerAction.mutate({ id, action, body }) }} />}
          {mainTab === 'pet' && <PetTab draft={draft} catalog={lookup.catalog} onJsonChange={updateJsonField} />}
          {mainTab === 'tasks' && <TasksTab draft={draft} catalog={lookup.catalog} onJsonChange={updateJsonField} onArrayIndexChange={updateArrayIndex} />}
          {mainTab === 'badges' && <BadgesTab draft={draft} catalog={lookup.catalog} onJsonChange={updateJsonField} />}
          {save.isError && <div className="alert danger player-save-error"><AlertTriangle size={16} />{errorText(save.error)}</div>}
        </>}
      </div>
      <div className="drawer-actions player-drawer-actions"><span className="muted player-save-hint">{valid ? 'Dữ liệu hợp lệ · ID vẫn được giữ nguyên' : 'Có JSON/slot chưa hợp lệ · chưa thể lưu'}</span><button className="secondary" onClick={closePlayer}>Hủy</button><button className="primary" onClick={() => save.mutate()} disabled={!draft || !dirty || !valid || save.isPending}><Save size={16} /> {save.isPending ? 'Đang lưu…' : 'Lưu dữ liệu & cập nhật'}</button></div>
    </aside></div>}
  </>
}

function PlayerSummary({ draft, catalog }: { draft: ResourceRow; catalog: ReferenceCatalog }) {
  const head = numericId(draft.head)
  const clan = numericId(draft.clan_id)
  return <section className="player-summary"><div className="player-summary-avatar">{head !== undefined ? <ReferenceThumbnail kind="parts" value={head} catalog={catalog} /> : <Users size={22} />}</div><div className="player-summary-main"><strong>{asText(draft.name, 'Không tên')}</strong><span>Nhân vật {displayId(draft.id ?? '—')} · giới tính {asText(draft.gender, '—')}</span></div><div className="player-summary-reference"><small>Tài khoản</small>{numericId(draft.account_id) !== undefined ? <ResolvedReference kind="accounts" value={numericId(draft.account_id) as number} catalog={catalog} compact /> : <span>—</span>}</div><div className="player-summary-reference"><small>Clan</small>{clan !== undefined && clan >= 0 ? <ResolvedReference kind="clans" value={clan} catalog={catalog} compact /> : <span>Không thuộc clan</span>}</div></section>
}

function GeneralTab({ draft, catalog, onFieldChange, onJsonChange, onArrayIndexChange }: { draft: ResourceRow; catalog: ReferenceCatalog; onFieldChange: (field: string, value: unknown) => void; onJsonChange: (field: JsonPlayerField, value: string) => void; onArrayIndexChange: (field: JsonPlayerField, index: number, value: string) => void }) {
  const point = parseJsonValue(draft.data_point)
  const inventory = parseJsonValue(draft.data_inventory)
  const pointArray = Array.isArray(point.value) ? point.value : []
  const inventoryArray = Array.isArray(inventory.value) ? inventory.value : []
  const head = numericId(draft.head)
  const clan = numericId(draft.clan_id)
  return <div className="player-tab-content">
    <DetailSection title="Thông tin nhân vật" icon={<Users size={16} />}><div className="field-grid player-general-grid"><label>Tên<input value={asText(draft.name)} onChange={(event) => onFieldChange('name', event.target.value)} /></label><label>Giới tính<output>{asText(draft.gender, '—')}</output></label><label>Head Part{head !== undefined ? <ResolvedReference kind="parts" value={head} catalog={catalog} /> : <output>—</output>}<LookupSelect kind="parts" value={head === undefined ? '' : String(head)} resolvedOption={head === undefined ? undefined : catalog.get('parts')?.get(String(head))} onChange={(value) => onFieldChange('head', value === '' ? -1 : Number(value))} placeholder="Chọn part theo tên…" /></label><label>Tài khoản<output>{numericId(draft.account_id) !== undefined ? <ResolvedReference kind="accounts" value={numericId(draft.account_id) as number} catalog={catalog} compact /> : '—'}</output></label><label>Clan{clan !== undefined && clan >= 0 ? <ResolvedReference kind="clans" value={clan} catalog={catalog} compact /> : <output>Không thuộc clan</output>}<LookupSelect kind="clans" value={clan !== undefined && clan >= 0 ? String(clan) : ''} resolvedOption={clan !== undefined && clan >= 0 ? catalog.get('clans')?.get(String(clan)) : undefined} onChange={(value) => onFieldChange('clan_id', value === '' ? -1 : Number(value))} placeholder="Chọn clan theo tên…" /></label></div></DetailSection>
    <DetailSection title="Chỉ số & Tiềm năng"><div className="stat-fields">{pointFields.map(([label, index]) => <label key={index}>{label}<input value={asText(pointArray[index], '0')} onChange={(event) => onArrayIndexChange('data_point', index, event.target.value)} inputMode="numeric" /></label>)}</div>{!point.valid || !Array.isArray(point.value) ? <JsonFieldEditor field="data_point" label="Raw data_point" value={jsonText(draft.data_point)} onChange={(value) => onJsonChange('data_point', value)} resource="players" /> : <small className="muted">Các vị trí JSON khác được giữ nguyên khi lưu.</small>}</DetailSection>
    <DetailSection title="Tài sản"><div className="stat-fields currency-fields">{[['Vàng', 0], ['Ngọc xanh', 1], ['Hồng ngọc', 2]].map(([label, index]) => <label key={String(index)}>{String(label)}<input value={asText(inventoryArray[Number(index)], '0')} onChange={(event) => onArrayIndexChange('data_inventory', Number(index), event.target.value)} inputMode="numeric" /></label>)}</div>{!inventory.valid || !Array.isArray(inventory.value) ? <JsonFieldEditor field="data_inventory" label="Raw data_inventory" value={jsonText(draft.data_inventory)} onChange={(value) => onJsonChange('data_inventory', value)} resource="players" /> : <small className="muted">Các loại tiền/thống kê còn lại vẫn được giữ trong JSON gốc.</small>}</DetailSection>
  </div>
}

function ItemsTab({ draft, field, parsed, catalog, onFieldChange, onJsonChange, onSelectField, onAction }: { draft: ResourceRow; field: PlayerItemField; parsed: ParsedPlayerItems; catalog: ReferenceCatalog; onFieldChange: (field: string, value: unknown) => void; onJsonChange: (field: JsonPlayerField, value: string) => void; onSelectField: (field: PlayerItemField) => void; onAction: (action: 'buff-item' | 'revoke-item', body?: JsonMap) => void }) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [newItemId, setNewItemId] = useState('')
  const [newItemOption, setNewItemOption] = useState('')
  const [newItemOptionParam, setNewItemOptionParam] = useState('0')
  const [quantity, setQuantity] = useState('1')
  const [actionItemId, setActionItemId] = useState('')
  const [actionQuantity, setActionQuantity] = useState('1')

  useEffect(() => { setSelectedIndex(null) }, [field])

  const updateItems = (updater: (entries: PlayerItemEntry[]) => PlayerItemEntry[]) => {
    if (parsed.error) return
    onJsonChange(field, serializePlayerItems(updater(parsed.entries), parsed.format))
  }
  const current = selectedIndex === null ? undefined : parsed.entries.find((entry) => entry.index === selectedIndex)
  const template = current ? itemTemplate(catalog, current.itemId) : undefined
  const itemOptions = current?.options ?? []
  const visible = parsed.entries.filter((entry) => entry.itemId >= 0)
  const selectedItemOption = newItemId ? catalog.get('items')?.get(newItemId) : undefined
  const selectedActionOption = actionItemId ? catalog.get('items')?.get(actionItemId) : undefined

  const addItem = () => {
    const id = numericId(newItemId)
    const count = Number(quantity)
    if (id === undefined || !Number.isInteger(count) || count <= 0 || count > 1_000_000_000) return
    const empty = parsed.entries.find((entry) => entry.itemId < 0)
    const nextEntry = createFilledPlayerItem(id, count, empty ?? parsed.entries[0])
    if (empty) {
      nextEntry.index = empty.index
      updateItems((entries) => entries.map((entry) => entry.index === empty.index ? nextEntry : entry))
      setSelectedIndex(empty.index)
    } else {
      nextEntry.index = parsed.entries.length
      updateItems((entries) => [...entries, nextEntry])
      setSelectedIndex(nextEntry.index)
    }
    setNewItemId('')
    setQuantity('1')
  }
  const deleteItem = (index: number) => {
    if (!window.confirm('Xóa vật phẩm khỏi nhân vật?')) return
    updateItems((entries) => entries.map((entry) => entry.index === index ? emptyPlayerItem(entry) : entry))
    if (selectedIndex === index) setSelectedIndex(null)
  }
  const patchItem = (index: number, patch: Partial<PlayerItemEntry>) => updateItems((entries) => entries.map((entry) => entry.index === index ? { ...entry, ...patch } : entry))
  const addOption = () => {
    const id = numericId(newItemOption)
    const param = Number(newItemOptionParam)
    if (selectedIndex === null || id === undefined || !Number.isInteger(param)) return
    patchItem(selectedIndex, { options: [...itemOptions, { id, param }] })
    setNewItemOption('')
    setNewItemOptionParam('0')
  }
  const removeOption = (index: number) => {
    if (selectedIndex === null) return
    patchItem(selectedIndex, { options: itemOptions.filter((_, optionIndex) => optionIndex !== index) })
  }
  const rawValue = jsonText(draft[field])
  return <div className="player-tab-content">
    <nav className="player-subtabs">{itemTabs.map((tab) => <button key={tab.key} className={field === tab.key ? 'active' : ''} onClick={() => onSelectField(tab.key)}>{tab.label}</button>)}</nav>
    <DetailSection title={`${itemTabs.find((tab) => tab.key === field)?.label ?? 'Vật phẩm'} · ${visible.length} item`} icon={<FileCode2 size={16} />}>
      <div className="player-item-toolbar"><div className="player-item-add"><LookupSelect kind="items" value={newItemId} resolvedOption={selectedItemOption} onChange={setNewItemId} placeholder="Chọn item theo tên…" /><input value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="SL" inputMode="numeric" /><button className="primary" disabled={!numericId(newItemId) || Number(quantity) <= 0} onClick={addItem}><Plus size={15} /> Thêm item</button></div><div className="player-item-quick-actions"><LookupSelect kind="items" value={actionItemId} resolvedOption={selectedActionOption} onChange={setActionItemId} placeholder="Item buff/thu hồi…" /><input value={actionQuantity} onChange={(event) => setActionQuantity(event.target.value)} placeholder="SL" inputMode="numeric" /><button className="secondary" disabled={!numericId(actionItemId) || Number(actionQuantity) <= 0} onClick={() => onAction('buff-item', { itemId: Number(actionItemId), quantity: Number(actionQuantity) })}>Buff</button><button className="danger-button" disabled={!numericId(actionItemId) || Number(actionQuantity) <= 0} onClick={() => onAction('revoke-item', { itemId: Number(actionItemId), quantity: Number(actionQuantity), removeAll: false })}>Thu hồi</button></div></div>
      {parsed.error && <><div className="alert danger">JSON vật phẩm lỗi: {parsed.error}</div><JsonFieldEditor field={field} label="Sửa JSON gốc" value={rawValue} onChange={(value) => onJsonChange(field, value)} resource="players" /></>}
      {!parsed.error && !visible.length && <div className="player-tab-empty"><Database size={20} /> Chưa có vật phẩm trong khu vực này.</div>}
      {!parsed.error && visible.length > 0 && <div className="nested-table-wrap player-item-table-wrap"><table className="nested-table player-item-table"><thead><tr><th>Vị trí</th><th>ID</th><th>Icon</th><th>Tên Item</th><th>SL</th><th>Options (Readable)</th><th>Raw Options</th><th /></tr></thead><tbody>{visible.map((entry) => { const resolved = itemTemplate(catalog, entry.itemId); return <tr key={entry.index} className={selectedIndex === entry.index ? 'selected-row' : ''} onClick={() => setSelectedIndex(entry.index)}><td>#{entry.index}</td><td>{displayId(entry.itemId)}</td><td><IconPreview iconId={resolved?.iconId} label={resolved?.label ?? 'Item'} /></td><td><ResolvedReference kind="items" value={entry.itemId} option={resolved} catalog={catalog} compact /></td><td>{entry.quantity}</td><td><div className="option-readable-list">{entry.options.length ? entry.options.map((option, optionIndex) => <ResolvedReference key={`${option.id}-${optionIndex}`} kind="options" value={option.id} option={optionTemplate(catalog, option.id)} catalog={catalog} compact />) : <span className="muted">Không có</span>}</div></td><td><code className="raw-cell">{JSON.stringify(entry.optionsRaw ?? [])}</code></td><td><button className="icon-button danger-icon" onClick={(event) => { event.stopPropagation(); deleteItem(entry.index) }} aria-label="Xóa item"><Trash2 size={15} /></button></td></tr>})}</tbody></table></div>}
    </DetailSection>
    {current && <PlayerItemEditor entry={current} template={template} catalog={catalog} onQuantityChange={(value) => patchItem(current.index, { quantity: Number(value) })} options={itemOptions} onOptionChange={(index, patch) => patchItem(current.index, { options: itemOptions.map((option, optionIndex) => optionIndex === index ? { ...option, ...patch } : option) })} onAddOption={addOption} newOptionId={newItemOption} newOptionParam={newItemOptionParam} onNewOptionId={setNewItemOption} onNewOptionParam={setNewItemOptionParam} onRemoveOption={removeOption} />}
    <JsonFieldEditor field={field} label="JSON gốc (authoritative)" value={rawValue} onChange={(value) => onJsonChange(field, value)} resource="players" />
  </div>
}

function PlayerItemEditor({ entry, template, catalog, onQuantityChange, options, onOptionChange, onAddOption, newOptionId, newOptionParam, onNewOptionId, onNewOptionParam, onRemoveOption }: { entry: PlayerItemEntry; template?: LookupOption; catalog: ReferenceCatalog; onQuantityChange: (value: string) => void; options: PlayerOptionValue[]; onOptionChange: (index: number, patch: Partial<PlayerOptionValue>) => void; onAddOption: () => void; newOptionId: string; newOptionParam: string; onNewOptionId: (value: string) => void; onNewOptionParam: (value: string) => void; onRemoveOption: (index: number) => void }) {
  const stats = template?.meta ?? {}
  return <section className="detail-card player-item-editor"><div className="detail-section-heading"><div><p className="eyebrow">ITEM DETAIL</p><h4><ResolvedReference kind="items" value={entry.itemId} option={template} catalog={catalog} /></h4></div><span className="status-badge neutral">Slot #{entry.index}</span></div><div className="field-grid item-detail-fields"><label>Số lượng<input value={String(entry.quantity)} onChange={(event) => onQuantityChange(event.target.value)} inputMode="numeric" /></label><label>ID template<output>{displayId(entry.itemId)}</output></label><label>Icon<output>{template?.iconId ? `#${template.iconId}` : 'Không có ảnh'}</output></label></div><div className="player-options-editor"><div className="detail-section-heading"><h4>Options</h4><span className="muted">{options.length} option</span></div><div className="option-editor-list">{options.map((option, index) => <div className="option-editor-row" key={`${option.id}-${index}`}><LookupSelect kind="options" value={option.id >= 0 ? String(option.id) : ''} resolvedOption={optionTemplate(catalog, option.id)} onChange={(value) => onOptionChange(index, { id: value === '' ? 0 : Number(value) })} placeholder="Chọn option…" /><input value={String(option.param)} onChange={(event) => onOptionChange(index, { param: Number(event.target.value) })} inputMode="numeric" /><span className="option-description">{(optionTemplate(catalog, option.id)?.label ?? `Option #${option.id}`).replace(/#/g, String(option.param))}</span><button className="icon-button danger-icon" onClick={() => onRemoveOption(index)} aria-label="Xóa option"><Trash2 size={14} /></button></div>)}</div><div className="option-add-row"><LookupSelect kind="options" value={newOptionId} onChange={onNewOptionId} placeholder="Thêm option…" /><input value={newOptionParam} onChange={(event) => onNewOptionParam(event.target.value)} placeholder="Param" inputMode="numeric" /><button className="secondary" disabled={!numericId(newOptionId) || !Number.isInteger(Number(newOptionParam))} onClick={onAddOption}><Plus size={14} /> Thêm option</button></div></div><div className="item-stat-preview"><div className="detail-section-heading"><h4>Chỉ số item template</h4><span className="muted">Chỉ đọc</span></div>{Object.keys(stats).length ? <div className="item-stat-grid">{[['TYPE', 'Loại'], ['gender', 'Giới tính'], ['description', 'Mô tả'], ['level', 'Level'], ['part', 'Part'], ['power_require', 'Yêu cầu SM'], ['gold', 'Giá vàng'], ['gold_sell', 'Bán vàng'], ['gem', 'Giá ngọc'], ['gem_sell', 'Bán ngọc'], ['ruby', 'Giá ruby'], ['ruby_sell', 'Bán ruby']].filter(([key]) => stats[key] !== undefined).map(([key, label]) => <div key={key}><small>{label}</small><strong>{String(stats[key])}</strong></div>)}</div> : <span className="muted">Lookup item chưa trả chỉ số.</span>}</div></section>
}

function PetTab({ draft, catalog, onJsonChange }: { draft: ResourceRow; catalog: ReferenceCatalog; onJsonChange: (field: JsonPlayerField, value: string) => void }) {
  const raw = jsonText(draft.pet)
  const parsed = parseJsonValue(draft.pet)
  const outer = Array.isArray(parsed.value) ? parsed.value : []
  const info = parseNestedJson(outer[0]).value
  const point = parseNestedJson(outer[1]).value
  const petBody = parsePlayerItems(parseNestedJson(outer[2]).value)
  const skills = parseNestedJson(outer[3]).value
  const updateInfo = (index: number, value: string) => onJsonChange('pet', updateNestedArray(draft.pet, 0, index, index === 2 ? value : numberOrText(value)))
  const updatePoint = (index: number, value: string) => onJsonChange('pet', updateNestedArray(draft.pet, 1, index, numberOrText(value)))
  const skillRows = Array.isArray(skills) ? skills.map((value, index) => { const pair = parseNestedJson(value).value; return { index, id: Array.isArray(pair) ? numericId(pair[0]) : undefined, level: Array.isArray(pair) ? asText(pair[1]) : '—' } }) : []
  return <div className="player-tab-content">
    {!parsed.valid && <div className="alert danger">JSON đệ tử không hợp lệ: {parsed.error}</div>}
    {parsed.valid && Array.isArray(parsed.value) && outer.length >= 2 && <><DetailSection title="Thông tin cơ bản" icon={<Users size={16} />}><div className="field-grid pet-info-grid"><label>Loại đệ tử<input value={asText(Array.isArray(info) ? info[0] : '')} onChange={(event) => updateInfo(0, event.target.value)} inputMode="numeric" /></label><label>Giới tính<input value={asText(Array.isArray(info) ? info[1] : '')} onChange={(event) => updateInfo(1, event.target.value)} inputMode="numeric" /></label><label>Tên đệ tử<input value={asText(Array.isArray(info) ? info[2] : '')} onChange={(event) => updateInfo(2, event.target.value)} /></label><label>Fusion type<input value={asText(Array.isArray(info) ? info[3] : '')} onChange={(event) => updateInfo(3, event.target.value)} inputMode="numeric" /></label><label>Thời gian fusion<input value={asText(Array.isArray(info) ? info[4] : '')} onChange={(event) => updateInfo(4, event.target.value)} inputMode="numeric" /></label><label>Trạng thái<input value={asText(Array.isArray(info) ? info[5] : '')} onChange={(event) => updateInfo(5, event.target.value)} inputMode="numeric" /></label></div></DetailSection><DetailSection title="Chỉ số đệ tử"><div className="stat-fields">{[['Sức mạnh', 1], ['Tiềm năng', 2], ['HP gốc', 5], ['KI gốc', 6], ['Sức đánh', 7], ['Giáp', 8], ['Chí mạng', 9], ['HP hiện tại', 10], ['KI hiện tại', 11], ['Sức đánh hiện tại', 12]].map(([label, index]) => <label key={String(index)}>{String(label)}<input value={asText(Array.isArray(point) ? point[Number(index)] : '0')} onChange={(event) => updatePoint(Number(index), event.target.value)} inputMode="numeric" /></label>)}</div></DetailSection><PetBodyPreview parsed={petBody} catalog={catalog} /><DetailSection title="Kỹ năng"><div className="pet-skills-list">{skillRows.length ? skillRows.map((skill) => <div className="pet-skill-row" key={skill.index}>{skill.id !== undefined ? <ResolvedReference kind="skills" value={skill.id} catalog={catalog} compact /> : <span>Slot #{skill.index}</span>}<span>Level {skill.level}</span></div>) : <span className="muted">Đệ tử chưa có kỹ năng.</span>}</div></DetailSection></>}
    {parsed.valid && (!Array.isArray(parsed.value) || outer.length < 2) && <div className="player-tab-empty"><Database size={20} /> Nhân vật chưa có dữ liệu đệ tử.</div>}
    <JsonFieldEditor field="pet" label="JSON đệ tử (authoritative)" value={raw} onChange={(value) => onJsonChange('pet', value)} resource="players" />
  </div>
}

function PetBodyPreview({ parsed, catalog }: { parsed: ParsedPlayerItems; catalog: ReferenceCatalog }) {
  const rows = parsed.entries.filter((entry) => entry.itemId >= 0)
  return <DetailSection title={`Vật phẩm đệ tử · ${rows.length} item`}><div className="nested-table-wrap"><table className="nested-table player-item-table"><thead><tr><th>Vị trí</th><th>Icon</th><th>Item</th><th>SL</th><th>Options</th></tr></thead><tbody>{rows.map((entry) => { const resolved = itemTemplate(catalog, entry.itemId); return <tr key={entry.index}><td>#{entry.index}</td><td><IconPreview iconId={resolved?.iconId} label={resolved?.label ?? 'Item'} /></td><td><ResolvedReference kind="items" value={entry.itemId} option={resolved} catalog={catalog} compact /></td><td>{entry.quantity}</td><td>{entry.options.map((option, index) => <ResolvedReference key={`${option.id}-${index}`} kind="options" value={option.id} option={optionTemplate(catalog, option.id)} catalog={catalog} compact />)}</td></tr>})}</tbody></table></div>{parsed.error && <small className="field-error">{parsed.error}</small>}</DetailSection>
}

function TasksTab({ draft, catalog, onJsonChange, onArrayIndexChange }: { draft: ResourceRow; catalog: ReferenceCatalog; onJsonChange: (field: JsonPlayerField, value: string) => void; onArrayIndexChange: (field: JsonPlayerField, index: number, value: string) => void }) {
  return <div className="player-tab-content"><div className="task-sections">{taskFields.map((task) => <ArrayFieldSection key={task.field} field={task.field} title={task.title} labels={task.labels} taskKind={task.kind} catalog={catalog} value={jsonText(draft[task.field])} onChange={(value) => onJsonChange(task.field, value)} onIndexChange={(index, value) => onArrayIndexChange(task.field, index, value)} />)}</div><div className="drawer-note"><FileCode2 size={16} /> ID nhiệm vụ được fetch từ template tương ứng; khi lưu vẫn giữ nguyên số ID trong JSON.</div></div>
}

function ArrayFieldSection({ field, title, labels, taskKind, catalog, value, onChange, onIndexChange }: { field: JsonPlayerField; title: string; labels: string[]; taskKind?: TaskLookupKind; catalog: ReferenceCatalog; value: string; onChange: (value: string) => void; onIndexChange: (index: number, value: string) => void }) {
  const parsed = parseJsonValue(value)
  const array = Array.isArray(parsed.value) ? parsed.value : []
  return <DetailSection title={title}><div className="stat-fields task-stat-fields">{labels.map((label, index) => <label key={index}>{index === 0 && taskKind ? <><span>{label}</span><TaskLookupField kind={taskKind} value={array[index]} catalog={catalog} onChange={(next) => onIndexChange(index, next)} /></> : <>{label}<input value={asText(array[index], '0')} onChange={(event) => onIndexChange(index, event.target.value)} inputMode="numeric" /></>}</label>)}</div>{!parsed.valid || !Array.isArray(parsed.value) ? <div className="alert danger">JSON nhiệm vụ không hợp lệ</div> : <small className="muted">Đang chỉnh các vị trí đầu; {Math.max(0, array.length - labels.length)} giá trị khác được giữ nguyên.</small>}<JsonFieldEditor field={field} label="JSON gốc" value={value} onChange={onChange} resource="players" /></DetailSection>
}

function TaskLookupField({ kind, value, catalog, onChange }: { kind: TaskLookupKind; value: unknown; catalog: ReferenceCatalog; onChange: (value: string) => void }) {
  const rawId = asText(value, '')
  const id = Number(rawId)
  const selectedId = Number.isSafeInteger(id) && id >= 0 ? String(id) : ''
  const resolved = selectedId ? catalog.get(kind)?.get(selectedId) : undefined
  return <div className="task-selector-cell"><LookupSelect kind={kind} value={selectedId} resolvedOption={resolved} onChange={onChange} placeholder="Chọn nhiệm vụ theo tên…" /><small className="muted">ID gốc: {rawId || '—'}</small></div>
}

function BadgesTab({ draft, catalog, onJsonChange }: { draft: ResourceRow; catalog: ReferenceCatalog; onJsonChange: (field: JsonPlayerField, value: string) => void }) {
  const raw = jsonText(draft.dataBadges)
  const parsed = parseJsonValue(draft.dataBadges)
  const values = Array.isArray(parsed.value) ? parsed.value : []
  const updateBadge = (index: number, key: string, value: string | boolean) => {
    if (!Array.isArray(parsed.value)) return
    const next = cloneValue(parsed.value) as unknown[]
    const item = next[index]
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const copy = { ...(item as Record<string, unknown>) }
      copy[key] = typeof value === 'boolean' ? value : numberOrText(value)
      next[index] = copy
    } else if (Array.isArray(item)) {
      const positions: Record<string, number> = { idBadGes: 0, timeofUseBadges: 1, isUse: 2 }
      item[positions[key] ?? 0] = typeof value === 'boolean' ? value : numberOrText(value)
    }
    onJsonChange('dataBadges', JSON.stringify(next))
  }
  const addBadge = () => onJsonChange('dataBadges', JSON.stringify([...values, { idBadGes: 0, timeofUseBadges: 0, isUse: false }]))
  const removeBadge = (index: number) => { if (window.confirm('Xóa danh hiệu khỏi nhân vật?')) onJsonChange('dataBadges', JSON.stringify(values.filter((_, itemIndex) => itemIndex !== index))) }
  return <div className="player-tab-content"><DetailSection title={`Danh hiệu đã sở hữu · ${values.length}`} icon={<ShieldCheck size={16} />}><div className="button-row player-badge-actions"><button className="primary" onClick={addBadge}><Plus size={15} /> Thêm danh hiệu</button></div>{!parsed.valid && <div className="alert danger">JSON danh hiệu không hợp lệ: {parsed.error}</div>}{parsed.valid && values.length > 0 && <div className="nested-table-wrap"><table className="nested-table badge-table"><thead><tr><th>ID danh hiệu</th><th>Thời gian sử dụng</th><th>Đang dùng</th><th /></tr></thead><tbody>{values.map((value, index) => { const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined; const id = record?.idBadGes ?? (Array.isArray(value) ? value[0] : ''); const time = record?.timeofUseBadges ?? (Array.isArray(value) ? value[1] : ''); const used = Boolean(record?.isUse ?? (Array.isArray(value) ? value[2] : false)); return <tr key={index}><td><input value={asText(id)} onChange={(event) => updateBadge(index, 'idBadGes', event.target.value)} inputMode="numeric" /></td><td><input value={asText(time)} onChange={(event) => updateBadge(index, 'timeofUseBadges', event.target.value)} inputMode="numeric" /></td><td><input type="checkbox" checked={used} onChange={(event) => updateBadge(index, 'isUse', event.target.checked)} /></td><td><button className="icon-button danger-icon" onClick={() => removeBadge(index)} aria-label="Xóa danh hiệu"><Trash2 size={15} /></button></td></tr>})}</tbody></table></div>}{parsed.valid && !values.length && <div className="player-tab-empty">Nhân vật chưa có danh hiệu.</div>}</DetailSection><JsonFieldEditor field="dataBadges" label="JSON danh hiệu (authoritative)" value={raw} onChange={(value) => onJsonChange('dataBadges', value)} resource="players" /></div>
}

function JsonFieldEditor({ field, label, value, onChange, resource }: { field: JsonPlayerField; label: string; value: string; onChange: (value: string) => void; resource: string }) {
  const parsed = parseJsonDocument(value)
  return <div className="player-json-block"><div className="json-field-heading"><strong>{label}</strong>{parsed === null && value.trim() && <span className="field-error">JSON lỗi</span>}</div><textarea className="json-editor player-json-editor" value={value} onChange={(event) => onChange(event.target.value)} spellCheck={false} /><JsonReferencePreview value={value} resource={resource} field={field} /></div>
}

function DetailSection({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return <section className="detail-card player-detail-card"><div className="detail-section-heading"><h4>{icon}{title}</h4></div>{children}</section>
}
