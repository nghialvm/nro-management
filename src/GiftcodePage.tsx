import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Code2,
  Database,
  Eye,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { api, ApiRequestError } from './api'
import { LookupSelect, ResolvedReference, useReferenceCatalog } from './ReferenceDisplay'
import type { GiftcodeDetail, GiftcodeOption, GiftcodeReward, LookupOption, ResourceRow } from './types'
import type { ReferenceToken } from './relations'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function emptyGiftcode(): GiftcodeDetail {
  return { code: '', count_left: 100, expired: '2030-01-01 00:00:00', rewards: [], options: [], usedPlayerIds: [], usedPlayers: [] }
}

function giftcodePayload(form: GiftcodeDetail) {
  return {
    code: form.code.trim(),
    count_left: Number(form.count_left),
    expired: form.expired,
    rewards: form.rewards.map(({ id, quantity }) => ({ id: Number(id), quantity: Number(quantity) })),
    options: form.options.map(({ id, param }) => ({ id: Number(id), param: Number(param) })),
  }
}

function arrayLength(raw: unknown) {
  if (typeof raw !== 'string') return 0
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.length : 0
  } catch {
    return 0
  }
}

function localDateTime(value: string) {
  return value ? value.replace(' ', 'T').slice(0, 16) : ''
}

function serverDateTime(value: string) {
  return value ? `${value.replace('T', ' ')}${value.length === 16 ? ':00' : ''}` : ''
}

function optionDescription(option: GiftcodeOption) {
  const label = option.optionTemplate?.label ?? `Option #${option.id}`
  return label.replace(/#/g, String(option.param))
}

function errorText(error: unknown) {
  if (error instanceof ApiRequestError && error.status === 409) return 'Giftcode đã bị thay đổi bởi admin khác (HTTP 409). Hãy tải lại trước khi lưu.'
  return error instanceof Error ? error.message : 'Có lỗi xảy ra'
}

function validForm(form: GiftcodeDetail) {
  return /^[^\s]{1,255}$/.test(form.code.trim())
    && Number.isInteger(Number(form.count_left)) && Number(form.count_left) >= 0
    && Number(form.count_left) <= 2_147_483_647
    && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(form.expired)
    && form.rewards.length <= 200
    && form.options.length <= 200
    && form.rewards.every((reward) => Number.isInteger(Number(reward.id)) && Number(reward.id) >= 0 && Number.isInteger(Number(reward.quantity)) && Number(reward.quantity) > 0 && Number(reward.quantity) <= 1_000_000_000)
    && form.options.every((option) => Number.isInteger(Number(option.id)) && Number(option.id) >= 0 && Number.isInteger(Number(option.param)))
    && new Set(form.rewards.map((reward) => Number(reward.id))).size === form.rewards.length
    && new Set(form.options.map((option) => Number(option.id))).size === form.options.length
}

export function GiftcodePage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const [form, setForm] = useState<GiftcodeDetail | null>(null)

  const listQuery = useQuery({
    queryKey: ['giftcodes', page, search],
    queryFn: () => api.list('giftcodes', { page, pageSize: 50, search }),
  })
  const detailQuery = useQuery({
    queryKey: ['giftcode-detail', selectedId],
    queryFn: () => api.giftcodeDetail(selectedId as number),
    enabled: selectedId !== null && !newOpen,
  })

  useEffect(() => {
    if (newOpen) {
      setForm(emptyGiftcode())
    } else if (detailQuery.data) {
      setForm(clone(detailQuery.data))
    }
  }, [newOpen, detailQuery.data?.id, detailQuery.data?.version])

  const source = newOpen ? null : detailQuery.data
  const dirty = Boolean(form && (newOpen ? JSON.stringify(giftcodePayload(form)) !== JSON.stringify(giftcodePayload(emptyGiftcode())) : source && JSON.stringify(giftcodePayload(form)) !== JSON.stringify(giftcodePayload(source))))
  const save = useMutation({
    mutationFn: async () => {
      if (!form) throw new Error('Chưa có dữ liệu giftcode')
      return api.saveGiftcodeDetail(giftcodePayload(form), source?.version, newOpen ? undefined : selectedId as number)
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['giftcode-detail', data.id], data)
      queryClient.invalidateQueries({ queryKey: ['giftcodes'] })
      setSelectedId(data.id ?? null)
      setNewOpen(false)
      setForm(clone(data))
    },
  })
  const remove = useMutation({
    mutationFn: (row: ResourceRow) => {
      if (row.id === undefined) throw new Error('Giftcode không có ID')
      return api.remove('giftcodes', row.id, row.version)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['giftcodes'] }),
  })
  const reset = useMutation({
    mutationFn: ({ id, version, ids, all }: { id: number; version: string; ids: number[]; all: boolean }) => api.resetGiftcodeUsedPlayers(id, version, ids, all),
    onSuccess: (data) => {
      setForm(clone(data))
      if (data.id !== undefined) queryClient.setQueryData(['giftcode-detail', data.id], data)
      queryClient.invalidateQueries({ queryKey: ['giftcodes'] })
    },
  })

  const openExisting = (id: number) => { setNewOpen(false); setForm(null); setSelectedId(id) }
  const openNew = () => { setSelectedId(null); setForm(emptyGiftcode()); setNewOpen(true) }
  const close = () => {
    if (dirty && !window.confirm('Giftcode có thay đổi chưa lưu. Đóng form?')) return
    setSelectedId(null)
    setNewOpen(false)
    setForm(null)
  }
  const lastPage = Math.max(1, Math.ceil(Number(listQuery.data?.meta?.total ?? 0) / Number(listQuery.data?.meta?.pageSize ?? 50)))

  return <>
    <div className="page-header"><div><p className="eyebrow">NRO MANAGEMENT</p><h2>Giftcode</h2><p className="muted">Tạo/sửa phần thưởng bằng giao diện trực quan; JSON runtime vẫn giữ schema hiện tại.</p></div><div className="page-actions"><button className="secondary" onClick={() => listQuery.refetch()}><RefreshCw size={16} /> Làm mới</button><button className="primary" onClick={openNew}><Plus size={16} /> Tạo giftcode</button></div></div>
    {listQuery.isError && <div className="alert danger"><AlertTriangle size={16} />{errorText(listQuery.error)}</div>}
    <section className="panel table-panel giftcode-list-panel"><div className="table-toolbar"><div className="toolbar-search"><Search size={17} /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Tìm mã giftcode..." /></div><div className="toolbar-meta"><span>{String(listQuery.data?.meta?.total ?? 0)} mã</span><button className="icon-button" onClick={() => listQuery.refetch()} aria-label="Làm mới"><RefreshCw size={16} /></button></div></div>{listQuery.isLoading ? <div className="table-empty"><RefreshCw className="spin" size={20} /> Đang tải giftcode…</div> : !listQuery.data?.data.length ? <div className="table-empty"><Database size={22} /><strong>Chưa có giftcode</strong><span className="muted">Tạo mã mới để thêm phần thưởng.</span></div> : <div className="table-scroll"><table><thead><tr><th>Code</th><th>Lượt còn</th><th>Phần thưởng</th><th>Tạo lúc</th><th>Hạn dùng</th><th>Trạng thái</th><th /></tr></thead><tbody>{listQuery.data.data.map((row, index) => { const expired = isExpired(String(row.expired ?? '')); return <tr key={`${String(row.id ?? index)}-${index}`} className="clickable" onClick={() => row.id !== undefined && openExisting(Number(row.id))}><td><strong>{String(row.code ?? '—')}</strong><small className="muted">#{String(row.id ?? '—')}</small></td><td>{String(row.count_left ?? 0)}</td><td>{arrayLength(row.item)} item · {arrayLength(row.option)} option</td><td>{String(row.datecreate ?? '—')}</td><td>{String(row.expired ?? '—')}</td><td><span className={`status-badge ${expired || Number(row.count_left) <= 0 ? 'danger' : 'success'}`}>{expired ? 'Hết hạn' : Number(row.count_left) <= 0 ? 'Hết lượt' : 'Đang dùng'}</span></td><td><div className="table-actions"><button className="mini-action" onClick={(event) => { event.stopPropagation(); if (row.id !== undefined) openExisting(Number(row.id)) }}><Eye size={13} /> Detail</button><button className="icon-button danger-icon" onClick={(event) => { event.stopPropagation(); if (row.id !== undefined && window.confirm(`Xóa giftcode ${String(row.code ?? row.id)}?`)) remove.mutate(row) }} aria-label="Xóa giftcode"><Trash2 size={15} /></button></div></td></tr> })}</tbody></table></div>}</section>
    <div className="pagination"><span>{listQuery.data?.meta?.total ?? 0} bản ghi</span><div><button className="icon-button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={16} /></button><strong>Trang {page} / {lastPage}</strong><button className="icon-button" disabled={page >= lastPage} onClick={() => setPage((value) => value + 1)}><ChevronRight size={16} /></button></div></div>
    {(newOpen || selectedId !== null) && <GiftcodeDrawer form={form} source={source ?? undefined} loading={!newOpen && detailQuery.isLoading} error={detailQuery.error} dirty={dirty} onChange={setForm} onClose={close} onSave={() => save.mutate()} saving={save.isPending} saveError={save.error} resetError={reset.error} onResetUsed={(ids, all) => { if (!form?.id || !form.version) return; if (!window.confirm(all ? 'Reset toàn bộ lịch sử đã sử dụng?' : `Reset lịch sử của ${ids.length} người chơi?`)) return; reset.mutate({ id: form.id, version: form.version, ids, all }) }} />}
  </>
}

function isExpired(value: string) {
  return Boolean(value) && value < new Date().toISOString().slice(0, 19).replace('T', ' ')
}

function GiftcodeDrawer({ form, source, loading, error, dirty, onChange, onClose, onSave, saving, saveError, resetError, onResetUsed }: {
  form: GiftcodeDetail | null
  source?: GiftcodeDetail
  loading: boolean
  error: unknown
  dirty: boolean
  onChange: (value: GiftcodeDetail | null) => void
  onClose: () => void
  onSave: () => void
  saving: boolean
  saveError: unknown
  resetError: unknown
  onResetUsed: (ids: number[], all: boolean) => void
}) {
  const usedReferences = useMemo<ReferenceToken[]>(() => (form?.usedPlayerIds ?? []).map((id) => ({ kind: 'players', value: id, path: `usedPlayerIds[${id}]` })), [form?.usedPlayerIds])
  const usedLookup = useReferenceCatalog(usedReferences)
  const valid = Boolean(form && validForm(form) && !form.validation && Object.keys(form.validation ?? {}).length === 0)
  const update = (patch: Partial<GiftcodeDetail>) => {
    if (!form) return
    const validation = { ...(form.validation ?? {}) }
    if ('rewards' in patch) delete validation.item
    if ('options' in patch) delete validation.option
    if ('usedPlayerIds' in patch) delete validation.listIdPlayers
    onChange({ ...form, ...patch, validation: Object.keys(validation).length ? validation : undefined })
  }
  const addReward = () => { if (form) update({ rewards: [...form.rewards, { id: 0, quantity: 1 }] }) }
  const updateReward = (index: number, patch: Partial<GiftcodeReward>) => { if (form) update({ rewards: form.rewards.map((reward, rewardIndex) => rewardIndex === index ? { ...reward, ...patch } : reward) }) }
  const removeReward = (index: number) => { if (form) update({ rewards: form.rewards.filter((_, rewardIndex) => rewardIndex !== index) }) }
  const addOption = () => { if (form) update({ options: [...form.options, { id: 0, param: 0 }] }) }
  const updateOption = (index: number, patch: Partial<GiftcodeOption>) => { if (form) update({ options: form.options.map((option, optionIndex) => optionIndex === index ? { ...option, ...patch } : option) }) }
  const removeOption = (index: number) => { if (form) update({ options: form.options.filter((_, optionIndex) => optionIndex !== index) }) }
  const rawPreview = form ? JSON.stringify({ item: form.rewards.map(({ id, quantity }) => ({ id, quantity })), option: form.options.map(({ id, param }) => ({ id, param })) }, null, 2) : ''
  return <div className="drawer-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><aside className="management-detail-drawer giftcode-drawer" role="dialog" aria-modal="true" aria-label="Giftcode detail">
    <div className="drawer-heading"><div><p className="eyebrow">GIFTCODE EDITOR</p><h3>{form?.id ? `${form.code || 'Giftcode'} #${form.id}` : 'Tạo giftcode mới'} {dirty && <span className="dirty-badge">Chưa lưu</span>}</h3><p className="muted">listIdPlayers là lịch sử người đã sử dụng, không phải danh sách target.</p></div><button className="icon-button" onClick={onClose} aria-label="Đóng editor"><X size={19} /></button></div>
    <div className="drawer-body detail-scroll">{loading && <div className="table-empty"><RefreshCw className="spin" size={20} /> Đang tải detail…</div>}{Boolean(error) && <div className="alert danger"><AlertTriangle size={16} />{errorText(error)}</div>}{form && <>
      <section className="detail-card"><div className="detail-section-heading"><div><p className="eyebrow">THÔNG TIN</p><h4>Thông tin cấu hình</h4></div><Code2 size={18} className="heading-icon" /></div><div className="field-grid"><label>Mã code<input value={form.code} onChange={(event) => update({ code: event.target.value })} maxLength={255} placeholder="tanthu" /></label><label>Lượt sử dụng còn<input type="number" min={0} value={form.count_left} onChange={(event) => update({ count_left: Number(event.target.value) })} /></label><label>Hạn sử dụng<input type="datetime-local" value={localDateTime(form.expired)} onChange={(event) => update({ expired: serverDateTime(event.target.value) })} /></label><label>Ngày tạo<output>{String(form.datecreate ?? 'Mới')}</output></label></div></section>
      {form.validation && Object.keys(form.validation).length > 0 && <div className="alert danger"><AlertTriangle size={16} /><span>JSON cũ trong database chưa hợp lệ: {Object.entries(form.validation).map(([key, value]) => `${key}: ${value}`).join(' · ')}. Hãy kiểm tra trước khi lưu.</span></div>}
      <section className="detail-card"><div className="detail-section-heading"><div><p className="eyebrow">REWARDS</p><h4>Phần thưởng ({form.rewards.length})</h4></div><button className="secondary" onClick={addReward}><Plus size={15} /> Thêm item</button></div><div className="reward-list">{form.rewards.map((reward, index) => <div className="reward-row" key={`${reward.id}-${index}`}><LookupSelect kind="items" value={String(reward.id)} resolvedOption={reward.itemTemplate ?? undefined} onChange={(value) => updateReward(index, { id: value === '' ? 0 : Number(value), itemTemplate: undefined })} onOptionChange={(template) => updateReward(index, { itemTemplate: template })} placeholder="Tìm item theo tên…" /><input type="number" min={1} value={reward.quantity} onChange={(event) => updateReward(index, { quantity: Number(event.target.value) })} aria-label="Số lượng" /><button className="icon-button danger-icon" onClick={() => removeReward(index)} aria-label="Xóa phần thưởng"><Trash2 size={15} /></button></div>)}{!form.rewards.length && <p className="muted">Chưa có phần thưởng.</p>}</div></section>
      <section className="detail-card"><div className="detail-section-heading"><div><p className="eyebrow">OPTIONS</p><h4>Option global ({form.options.length})</h4><p className="muted">Lưu vào cột option theo schema giftcode hiện tại.</p></div><button className="secondary" onClick={addOption}><Plus size={15} /> Thêm option</button></div><div className="reward-list">{form.options.map((option, index) => <div className="reward-row option-reward-row" key={`${option.id}-${index}`}><LookupSelect kind="options" value={String(option.id)} resolvedOption={option.optionTemplate ?? undefined} onChange={(value) => updateOption(index, { id: value === '' ? 0 : Number(value), optionTemplate: undefined })} onOptionChange={(template) => updateOption(index, { optionTemplate: template })} placeholder="Tìm option theo tên…" /><input type="number" value={option.param} onChange={(event) => updateOption(index, { param: Number(event.target.value) })} aria-label="Param" /><span className="option-description">{optionDescription(option)}<small>param: {option.param}</small></span><button className="icon-button danger-icon" onClick={() => removeOption(index)} aria-label="Xóa option"><Trash2 size={15} /></button></div>)}{!form.options.length && <p className="muted">Chưa có option.</p>}</div></section>
      {Boolean(saveError) && <div className="alert danger"><AlertTriangle size={16} />{errorText(saveError)}</div>}
      {Boolean(resetError) && <div className="alert danger"><AlertTriangle size={16} />{errorText(resetError)}</div>}
      <UsedPlayers form={form} catalog={usedLookup.catalog} onResetUsed={onResetUsed} />
      <section className="detail-card"><div className="detail-section-heading"><div><p className="eyebrow">JSON PREVIEW</p><h4>Payload runtime</h4><p className="muted">ID vẫn là số; backend sẽ serialize thành item/option JSON.</p></div></div><pre className="json-preview-code">{rawPreview}</pre>{(form.rawItem || form.rawOption) && <details className="raw-json-details"><summary>JSON đang có trong database</summary><pre>{JSON.stringify({ item: form.rawItem, option: form.rawOption }, null, 2)}</pre></details>}</section>
    </>}</div>
    <div className="drawer-actions"><button className="secondary" onClick={onClose}>Đóng</button><button className="primary" onClick={onSave} disabled={!form || !valid || saving}><Save size={16} /> {saving ? 'Đang lưu…' : 'Lưu giftcode'}</button></div>
  </aside></div>
}

function UsedPlayers({ form, catalog, onResetUsed }: { form: GiftcodeDetail; catalog: Map<string, Map<string, LookupOption>>; onResetUsed: (ids: number[], all: boolean) => void }) {
  return <section className="detail-card used-players-card"><div className="detail-section-heading"><div><p className="eyebrow">HISTORY</p><h4><Users size={16} /> Đã sử dụng ({form.usedPlayerIds.length})</h4><p className="muted">Có thể reset từng player hoặc toàn bộ. Thao tác cần version hiện tại.</p></div><button className="danger-button" disabled={!form.usedPlayerIds.length || !form.id} onClick={() => onResetUsed([], true)}>Reset toàn bộ</button></div><div className="used-player-list">{form.usedPlayerIds.map((id) => { const resolved = form.usedPlayers.find((player) => String(player.id) === String(id)) ?? catalog.get('players')?.get(String(id)); return <div className="used-player-row" key={id}>{resolved ? <ResolvedReference kind="players" value={id} option={resolved} compact /> : <ResolvedReference kind="players" value={id} compact />}<button className="icon-button danger-icon" disabled={!form.id} onClick={() => onResetUsed([id], false)} aria-label={`Reset player ${id}`}><X size={15} /></button></div> })}{!form.usedPlayerIds.length && <span className="muted">Chưa có player sử dụng code này.</span>}</div></section>
}
