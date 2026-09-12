import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Database,
  Eye,
  Package,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { api, ApiRequestError } from './api'
import { LookupSelect, ReferenceCell, ReferenceThumbnail, ResolvedReference, useRowReferenceCatalog } from './ReferenceDisplay'
import type { JsonMap, LookupOption, ResourceRow, ShopDetail, ShopItemDetail, ShopOptionDetail, ShopTabDetail } from './types'

const moneyLabels: Record<number, string> = { 0: 'Vàng', 1: 'Ngọc', 2: 'Ruby', 3: 'Event' }

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function itemPayload(item: ShopItemDetail): JsonMap {
  return {
    ...(item.id === undefined ? {} : { id: item.id }),
    temp_id: Number(item.temp_id),
    is_new: Boolean(item.is_new),
    is_sell: Boolean(item.is_sell),
    type_sell: Number(item.type_sell),
    cost: Number(item.cost),
    costgold: Number(item.costgold),
    icon_spec: Number(item.icon_spec),
    options: item.options.map((option) => ({
      ...(option.id === undefined ? {} : { id: option.id }),
      option_id: Number(option.option_id),
      param: Number(option.param),
    })),
  }
}

function tabPayload(tab: ShopTabDetail): JsonMap {
  return {
    shop_id: Number(tab.shop_id),
    NAME: tab.NAME,
    items: tab.items.map(itemPayload),
  }
}

function newShopItem(): ShopItemDetail {
  return {
    temp_id: 0,
    is_new: false,
    is_sell: true,
    type_sell: 0,
    cost: 0,
    costgold: 0,
    icon_spec: -1,
    options: [],
  }
}

function newShopOption(): ShopOptionDetail {
  return { option_id: 0, param: 0 }
}

function optionDescription(option: ShopOptionDetail) {
  const label = option.optionTemplate?.label ?? `Option #${option.option_id}`
  return label.replace(/#/g, String(option.param))
}

function displayError(error: unknown) {
  if (error instanceof ApiRequestError && error.status === 409) return 'Dữ liệu đã thay đổi bởi admin khác (HTTP 409). Hãy tải lại trước khi lưu.'
  return error instanceof Error ? error.message : 'Có lỗi xảy ra'
}

export function ShopPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [selectedShopId, setSelectedShopId] = useState<number | null>(null)
  const [selectedTabId, setSelectedTabId] = useState<number | null>(null)
  const [draft, setDraft] = useState<ShopTabDetail | null>(null)
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null)
  const [itemDraft, setItemDraft] = useState<ShopItemDetail | null>(null)

  const listQuery = useQuery({
    queryKey: ['shops', page, search],
    queryFn: () => api.list('shops', { page, pageSize: 50, search }),
  })
  const rows = listQuery.data?.data ?? []
  const rowLookup = useRowReferenceCatalog(rows, 'shops')
  const detailQuery = useQuery<ShopDetail>({
    queryKey: ['shop-detail', selectedShopId],
    queryFn: () => api.shopDetail(selectedShopId as number),
    enabled: selectedShopId !== null,
  })
  const sourceTab = detailQuery.data?.tabs.find((tab) => tab.id === selectedTabId) ?? detailQuery.data?.tabs[0]

  useEffect(() => {
    if (detailQuery.data?.tabs.length && (selectedTabId === null || !detailQuery.data.tabs.some((tab) => tab.id === selectedTabId))) {
      setSelectedTabId(detailQuery.data.tabs[0].id)
    }
  }, [detailQuery.data, selectedTabId])

  useEffect(() => {
    if (!sourceTab) return
    setDraft(clone(sourceTab))
    setEditingItemIndex(null)
    setItemDraft(null)
  }, [sourceTab?.id, sourceTab?.version])

  const dirty = Boolean(draft && sourceTab && JSON.stringify(tabPayload(draft)) !== JSON.stringify(tabPayload(sourceTab)))
  const save = useMutation({
    mutationFn: async () => {
      if (!draft || !sourceTab) throw new Error('Chưa chọn tab shop')
      return api.saveShopTabDetail(draft.id, tabPayload(draft), sourceTab.version)
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['shop-detail', selectedShopId], data)
      queryClient.invalidateQueries({ queryKey: ['shops'] })
      setDraft(data.tabs[0] ? clone(data.tabs[0]) : null)
    },
  })
  const reloadRuntime = useMutation({
    mutationFn: () => api.server('reload', 'POST', { targets: ['shops'] }),
  })

  const lastPage = Math.max(1, Math.ceil(Number(listQuery.data?.meta?.total ?? 0) / Number(listQuery.data?.meta?.pageSize ?? 50)))

  const closeDetail = () => {
    if (dirty && !window.confirm('Tab shop có thay đổi chưa lưu. Đóng cửa sổ?')) return
    setSelectedShopId(null)
    setSelectedTabId(null)
    setDraft(null)
    setItemDraft(null)
  }

  const selectTab = (tab: ShopTabDetail) => {
    if (tab.id === draft?.id) return
    if (dirty && !window.confirm('Thay đổi của tab hiện tại chưa lưu. Chuyển tab?')) return
    setSelectedTabId(tab.id)
  }

  const openItem = (index: number) => {
    if (!draft) return
    setEditingItemIndex(index)
    setItemDraft(clone(draft.items[index]))
  }

  const addItem = () => {
    if (!draft) return
    setEditingItemIndex(-1)
    setItemDraft(newShopItem())
  }

  const removeItem = (index: number) => {
    if (!draft || !window.confirm('Xóa vật phẩm khỏi tab shop?')) return
    setDraft({ ...draft, items: draft.items.filter((_, itemIndex) => itemIndex !== index) })
    if (editingItemIndex === index) {
      setEditingItemIndex(null)
      setItemDraft(null)
    }
  }

  const commitItem = () => {
    if (!draft || !itemDraft) return
    const valid = Number.isInteger(Number(itemDraft.temp_id)) && Number(itemDraft.temp_id) >= 0
      && Number.isInteger(Number(itemDraft.cost)) && Number(itemDraft.cost) >= 0
      && Number.isInteger(Number(itemDraft.costgold)) && Number(itemDraft.costgold) >= 0
      && Number.isInteger(Number(itemDraft.type_sell)) && Number(itemDraft.type_sell) >= 0 && Number(itemDraft.type_sell) <= 3
      && itemDraft.options.every((option) => Number.isInteger(Number(option.option_id)) && Number(option.option_id) >= 0 && Number.isInteger(Number(option.param)))
    if (!valid) return
    const items = [...draft.items]
    if (editingItemIndex === -1) items.push(clone(itemDraft))
    else if (editingItemIndex !== null) items[editingItemIndex] = clone(itemDraft)
    setDraft({ ...draft, items })
    setEditingItemIndex(null)
    setItemDraft(null)
  }

  return <>
    <ShopPageHeader onRefresh={() => listQuery.refetch()} />
    {listQuery.isError && <ShopError error={listQuery.error} />}
    <section className="panel table-panel shop-list-panel">
      <div className="table-toolbar">
        <div className="toolbar-search"><Search size={17} /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Tìm shop, NPC..." /></div>
        <div className="toolbar-meta"><span>{String(listQuery.data?.meta?.total ?? 0)} shop</span><button className="icon-button" onClick={() => listQuery.refetch()} aria-label="Làm mới"><RefreshCw size={16} /></button></div>
      </div>
      {listQuery.isLoading ? <ShopLoading /> : !rows.length ? <ShopEmpty /> : <div className="table-scroll"><table className="shop-list-table"><thead><tr><th>ID</th><th>NPC</th><th>Tag</th><th>Loại shop</th><th>Detail</th></tr></thead><tbody>{rows.map((row, index) => <tr key={`${String(row.id ?? index)}-${index}`} className="clickable" onClick={() => typeof row.id === 'number' || /^\d+$/.test(String(row.id)) ? setSelectedShopId(Number(row.id)) : undefined}><td>#{String(row.id ?? '—')}</td><td><ReferenceCell value={row.npc_id} resource="shops" field="npc_id" catalog={rowLookup.catalog} /></td><td>{String(row.tag_name ?? '—')}</td><td>{String(row.type_shop ?? '—')}</td><td><button className="mini-action" onClick={(event) => { event.stopPropagation(); if (row.id !== undefined) setSelectedShopId(Number(row.id)) }}><Eye size={13} /> Mở detail</button></td></tr>)}</tbody></table></div>}
    </section>
    <div className="pagination"><span>{listQuery.data?.meta?.total ?? 0} bản ghi</span><div><button className="icon-button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={16} /></button><strong>Trang {page} / {lastPage}</strong><button className="icon-button" disabled={page >= lastPage} onClick={() => setPage((value) => value + 1)}><ChevronRight size={16} /></button></div></div>
    {selectedShopId !== null && <ShopDetailDrawer detail={detailQuery.data} loading={detailQuery.isLoading} error={detailQuery.error} draft={draft} sourceTab={sourceTab} dirty={dirty} selectedTabId={selectedTabId} onSelectTab={selectTab} onChangeDraft={setDraft} onAddItem={addItem} onOpenItem={openItem} onRemoveItem={removeItem} onClose={closeDetail} onSave={() => save.mutate()} saving={save.isPending} saveError={save.error} onReloadRuntime={() => window.confirm('Reload dữ liệu shop vào runtime Java?') && reloadRuntime.mutate()} reloadPending={reloadRuntime.isPending} itemDraft={itemDraft} editingItemIndex={editingItemIndex} onChangeItem={setItemDraft} onCommitItem={commitItem} onCancelItem={() => { setEditingItemIndex(null); setItemDraft(null) }} />}
  </>
}

function ShopPageHeader({ onRefresh }: { onRefresh: () => void }) {
  return <div className="page-header"><div><p className="eyebrow">NRO MANAGEMENT</p><h2>Cửa hàng / Shop</h2><p className="muted">Mở detail để quản lý tab, vật phẩm và option nested trong từng shop.</p></div><div className="page-actions"><button className="secondary" onClick={onRefresh}><RefreshCw size={16} /> Làm mới</button></div></div>
}

function ShopLoading() {
  return <div className="table-empty"><RefreshCw className="spin" size={20} /> Đang tải danh sách shop…</div>
}

function ShopEmpty() {
  return <div className="table-empty"><Database size={22} /><strong>Chưa có shop</strong><span className="muted">Không tìm thấy dữ liệu theo điều kiện hiện tại.</span></div>
}

function ShopError({ error }: { error: unknown }) {
  return <div className="alert danger"><AlertTriangle size={16} />{displayError(error)}</div>
}

function ShopDetailDrawer({
  detail,
  loading,
  error,
  draft,
  sourceTab,
  dirty,
  selectedTabId,
  onSelectTab,
  onChangeDraft,
  onAddItem,
  onOpenItem,
  onRemoveItem,
  onClose,
  onSave,
  saving,
  saveError,
  onReloadRuntime,
  reloadPending,
  itemDraft,
  editingItemIndex,
  onChangeItem,
  onCommitItem,
  onCancelItem,
}: {
  detail?: ShopDetail
  loading: boolean
  error: unknown
  draft: ShopTabDetail | null
  sourceTab?: ShopTabDetail
  dirty: boolean
  selectedTabId: number | null
  onSelectTab: (tab: ShopTabDetail) => void
  onChangeDraft: (tab: ShopTabDetail | null) => void
  onAddItem: () => void
  onOpenItem: (index: number) => void
  onRemoveItem: (index: number) => void
  onClose: () => void
  onSave: () => void
  saving: boolean
  saveError: unknown
  onReloadRuntime: () => void
  reloadPending: boolean
  itemDraft: ShopItemDetail | null
  editingItemIndex: number | null
  onChangeItem: (item: ShopItemDetail | null) => void
  onCommitItem: () => void
  onCancelItem: () => void
}) {
  return <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><aside className="management-detail-drawer" role="dialog" aria-modal="true" aria-label="Shop detail">
    <div className="drawer-heading"><div><p className="eyebrow">SHOP DETAIL</p><h3>{detail?.shop?.tag_name || `Shop #${detail?.shop?.id ?? ''}`} {dirty && <span className="dirty-badge">Chưa lưu</span>}</h3><p className="muted">{detail?.shop?.npc ? <ResolvedReference kind="npcs" value={detail.shop.npc_id} option={detail.shop.npc} compact /> : `NPC #${detail?.shop?.npc_id ?? '—'}`}</p></div><button className="icon-button" onClick={onClose} aria-label="Đóng detail"><X size={19} /></button></div>
    <div className="drawer-body detail-scroll">
      {loading && <ShopLoading />}
      {Boolean(error) && <ShopError error={error} />}
      {detail && <>
        <div className="detail-summary"><div><span className="muted">Shop</span><strong>#{detail.shop.id}</strong></div><div className="detail-summary-reference">{detail.shop.npc ? <ResolvedReference kind="npcs" value={detail.shop.npc_id} option={detail.shop.npc} /> : <span className="muted">NPC #{detail.shop.npc_id}</span>}</div><div><span className="muted">Số tab</span><strong>{detail.tabs.length}</strong></div></div>
        <div className="detail-tab-strip">{detail.tabs.map((tab) => <button key={tab.id} className={tab.id === selectedTabId ? 'active' : ''} onClick={() => onSelectTab(tab)}><span>{tab.NAME || `Tab #${tab.id}`}</span><small>#{tab.id} · {tab.items.length} item</small></button>)}{!detail.tabs.length && <span className="muted">Shop chưa có tab.</span>}</div>
        {draft && sourceTab ? <>
          <div className="detail-section-heading"><div><p className="eyebrow">TAB EDITOR</p><h4>Tab #{draft.id}</h4></div><div className="button-row"><button className="secondary" onClick={onAddItem}><Plus size={15} /> Thêm item</button><span className="status-badge neutral">{draft.items.length} item</span></div></div>
          <div className="field-grid compact-fields"><label>Tên tab<input value={draft.NAME} onChange={(event) => onChangeDraft({ ...draft, NAME: event.target.value })} maxLength={50} /></label><label>Shop ID<output>#{draft.shop_id}</output></label></div>
          <ShopItemsTable items={draft.items} onOpen={onOpenItem} onRemove={onRemoveItem} />
          {itemDraft && <ShopItemEditor item={itemDraft} isNew={editingItemIndex === -1} onChange={onChangeItem} onCommit={onCommitItem} onCancel={onCancelItem} />}
          {saveError && <ShopError error={saveError} />}
        </> : <div className="table-empty"><Package size={22} /><strong>Chọn một tab</strong><span className="muted">Mỗi tab có thể chứa nhiều item và option.</span></div>}
      </>}
    </div>
    <div className="drawer-actions"><button className="secondary" onClick={onClose}>Đóng</button><button className="secondary" onClick={onReloadRuntime} disabled={reloadPending}><RefreshCw size={16} /> {reloadPending ? 'Đang reload…' : 'Reload runtime'}</button><button className="primary" onClick={onSave} disabled={!draft || !sourceTab || !dirty || saving}><Save size={16} /> {saving ? 'Đang lưu…' : 'Lưu tab'}</button></div>
  </aside></div>
}

function ShopItemsTable({ items, onOpen, onRemove }: { items: ShopItemDetail[]; onOpen: (index: number) => void; onRemove: (index: number) => void }) {
  return <div className="nested-table-wrap"><table className="nested-table"><thead><tr><th>Item</th><th>Giá</th><th>Trạng thái</th><th>Icon spec</th><th>Options</th><th /></tr></thead><tbody>{items.map((item, index) => <tr key={item.id ?? `new-${index}`}><td><button className="reference-button" onClick={() => onOpen(index)}>{item.itemTemplate ? <ResolvedReference kind="items" value={item.temp_id} option={item.itemTemplate} compact /> : <ResolvedReference kind="items" value={item.temp_id} compact />}</button></td><td><strong>{item.cost.toLocaleString('vi-VN')}</strong> <small className="muted">{moneyLabels[item.type_sell] ?? `Loại ${item.type_sell}`}</small><br /><small className="muted">costgold: {item.costgold.toLocaleString('vi-VN')}</small></td><td><span className={`status-badge ${item.is_sell ? 'success' : 'neutral'}`}>{item.is_sell ? 'Đang bán' : 'Tắt bán'}</span>{item.is_new && <span className="tag active">Mới</span>}</td><td>{item.icon_spec >= 0 ? <ReferenceThumbnail kind="icons" value={item.icon_spec} /> : <span className="muted">—</span>}<small className="muted"> {item.icon_spec}</small></td><td><span className="status-badge neutral">{item.options.length} option</span></td><td><button className="icon-button danger-icon" onClick={() => onRemove(index)} aria-label="Xóa item"><Trash2 size={15} /></button></td></tr>)}{!items.length && <tr><td colSpan={6}><div className="table-empty compact-empty">Tab chưa có vật phẩm.</div></td></tr>}</tbody></table></div>
}

function ShopItemEditor({ item, isNew, onChange, onCommit, onCancel }: { item: ShopItemDetail; isNew: boolean; onChange: (item: ShopItemDetail) => void; onCommit: () => void; onCancel: () => void }) {
  const itemQuery = useQuery({ queryKey: ['lookup-selected', 'items', item.temp_id], queryFn: () => api.lookup('items', { ids: [item.temp_id], limit: 1 }), enabled: Number.isInteger(Number(item.temp_id)) && Number(item.temp_id) >= 0, staleTime: 10 * 60 * 1000, retry: false })
  const itemTemplate = itemQuery.data?.[0] ?? item.itemTemplate ?? undefined
  const valid = Number.isInteger(Number(item.temp_id)) && Number(item.temp_id) >= 0 && Number.isInteger(Number(item.cost)) && Number(item.cost) >= 0 && Number.isInteger(Number(item.costgold)) && Number(item.costgold) >= 0 && Number(item.type_sell) >= 0 && Number(item.type_sell) <= 3
  const set = (patch: Partial<ShopItemDetail>) => onChange({ ...item, ...patch })
  const addOption = () => set({ options: [...item.options, newShopOption()] })
  const updateOption = (index: number, patch: Partial<ShopOptionDetail>) => set({ options: item.options.map((option, optionIndex) => optionIndex === index ? { ...option, ...patch } : option) })
  const removeOption = (index: number) => set({ options: item.options.filter((_, optionIndex) => optionIndex !== index) })
  return <section className="nested-editor item-editor"><div className="detail-section-heading"><div><p className="eyebrow">ITEM DETAIL</p><h4>{isNew ? 'Thêm vật phẩm' : `Vật phẩm #${item.id}`}</h4><p className="muted">Chỉ số template chỉ đọc; chỉnh sâu ở module Item Template.</p></div><button className="icon-button" onClick={onCancel} aria-label="Đóng item editor"><X size={16} /></button></div>
    <div className="field-grid"><label>Vật phẩm<LookupSelect kind="items" value={String(item.temp_id)} resolvedOption={itemTemplate} onChange={(value) => set({ temp_id: value === '' ? 0 : Number(value), itemTemplate: undefined })} onOptionChange={(option) => set({ itemTemplate: option })} placeholder="Tìm item theo tên…" /></label><label>Loại tiền<select value={item.type_sell} onChange={(event) => set({ type_sell: Number(event.target.value) })}><option value={0}>0 - Vàng</option><option value={1}>1 - Ngọc</option><option value={2}>2 - Ruby</option><option value={3}>3 - Event</option></select></label><label>Giá bán<input type="number" min={0} value={item.cost} onChange={(event) => set({ cost: Number(event.target.value) })} /></label><label>Costgold<input type="number" min={0} value={item.costgold} onChange={(event) => set({ costgold: Number(event.target.value) })} /></label><label>Icon spec<input type="number" min={-1} value={item.icon_spec} onChange={(event) => set({ icon_spec: Number(event.target.value) })} /></label></div>
    <div className="check-grid"><label className="check-line"><input type="checkbox" checked={item.is_new} onChange={(event) => set({ is_new: event.target.checked })} /> Item mới</label><label className="check-line"><input type="checkbox" checked={item.is_sell} onChange={(event) => set({ is_sell: event.target.checked })} /> Đang bán</label></div>
    <ItemStats template={itemTemplate} itemId={item.temp_id} />
    <div className="detail-section-heading option-heading"><div><h4>Options ({item.options.length})</h4><p className="muted">Option lưu theo bảng item_shop_option.</p></div><button className="secondary" onClick={addOption}><Plus size={15} /> Thêm option</button></div>
    <div className="option-editor-list">{item.options.map((option, index) => <div className="option-editor-row" key={option.id ?? `new-option-${index}`}><LookupSelect kind="options" value={String(option.option_id)} resolvedOption={option.optionTemplate ?? undefined} onChange={(value) => updateOption(index, { option_id: value === '' ? 0 : Number(value), optionTemplate: undefined })} onOptionChange={(template) => updateOption(index, { optionTemplate: template })} placeholder="Tìm option…" /><input type="number" value={option.param} onChange={(event) => updateOption(index, { param: Number(event.target.value) })} aria-label="Param" /><div className="option-description">{optionDescription(option)}<small>param: {option.param}</small></div><button className="icon-button danger-icon" onClick={() => removeOption(index)} aria-label="Xóa option"><Trash2 size={15} /></button></div>)}{!item.options.length && <p className="muted">Chưa có option.</p>}</div>
    <div className="editor-inline-actions"><button className="secondary" onClick={onCancel}>Hủy</button><button className="primary" disabled={!valid} onClick={onCommit}><Save size={15} /> Xong</button></div>
  </section>
}

function ItemStats({ template, itemId }: { template?: LookupOption; itemId: number }) {
  const meta = template?.meta ?? {}
  const fields = [['TYPE', 'TYPE'], ['gender', 'Gender'], ['level', 'Level'], ['power_require', 'Power'], ['gold', 'Giá vàng'], ['gold_sell', 'Bán vàng'], ['gem', 'Giá ngọc'], ['gem_sell', 'Bán ngọc'], ['ruby', 'Giá ruby'], ['ruby_sell', 'Bán ruby'], ['part', 'Part']]
  return <div className="stats-card"><div className="stats-card-heading"><div>{template ? <ResolvedReference kind="items" value={itemId} option={template} /> : <ResolvedReference kind="items" value={itemId} />}</div><span className="muted">Read-only template</span></div>{Boolean(template?.meta?.description) && <p className="stats-description">{String(template?.meta?.description)}</p>}<div className="stats-grid">{fields.map(([key, label]) => <div key={key}><span>{label}</span><strong>{meta[key] === null || meta[key] === undefined || meta[key] === '' ? '—' : String(meta[key])}</strong></div>)}</div></div>
}
