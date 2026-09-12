import { useEffect, useMemo, useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { ImageOff, Search, X } from 'lucide-react'
import { api } from './api'
import type { LookupOption, ResourceRow } from './types'
import {
  collectReferences,
  collectFieldReferences,
  collectRowReferences,
  displayId,
  parseJsonDocument,
  referenceKindForField,
  referenceKindLabel,
  type ReferenceKind,
  type ReferenceToken,
  uniqueReferenceIds,
} from './relations'

export type ReferenceCatalog = Map<ReferenceKind, Map<string, LookupOption>>

const BATCH_SIZE = 200
const MAX_ICON_ID = 2_000_000
const failedIconIds = new Set<number>()
const imageReferenceKinds = new Set<ReferenceKind>(['icons', 'items', 'parts', 'npcs', 'skills', 'shop-items'])

export function normalizeIconId(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value.trim()) : NaN
  return Number.isSafeInteger(numeric) && numeric > 0 && numeric <= MAX_ICON_ID ? numeric : undefined
}

export function iconAssetUrl(value: unknown): string | undefined {
  const iconId = normalizeIconId(value)
  return iconId === undefined ? undefined : `/api/assets/icons/${encodeURIComponent(String(iconId))}`
}

function splitIntoBatches(values: string[]) {
  const batches: string[][] = []
  for (let index = 0; index < values.length; index += BATCH_SIZE) {
    batches.push(values.slice(index, index + BATCH_SIZE))
  }
  return batches
}

export function useReferenceCatalog(references: ReferenceToken[]) {
  const requested = useMemo(() => uniqueReferenceIds(references), [references])
  const requests = useMemo(() => Array.from(requested.entries()).flatMap(([kind, ids]) =>
    splitIntoBatches(ids).map((batch) => ({ kind, ids: batch }))), [requested])
  const queries = useQueries({
    queries: requests.map(({ kind, ids }) => ({
      queryKey: ['lookup', kind, ids],
      queryFn: () => api.lookup(kind, { ids, limit: BATCH_SIZE }),
      enabled: ids.length > 0,
      staleTime: 10 * 60 * 1000,
      retry: false,
    })),
  })
  const catalog = useMemo<ReferenceCatalog>(() => {
    const result: ReferenceCatalog = new Map()
    requests.forEach(({ kind }, index) => {
      const options = queries[index]?.data ?? []
      const values = result.get(kind) ?? new Map<string, LookupOption>()
      options.forEach((option) => values.set(String(option.id), option))
      result.set(kind, values)
    })
    return result
  }, [queries, requests])
  return {
    catalog,
    isLoading: queries.some((query) => query.isLoading),
    isError: queries.some((query) => query.isError),
  }
}

export function IconPreview({ iconId, label, large = false, showPlaceholder = true }: { iconId?: number; label: string; large?: boolean; showPlaceholder?: boolean }) {
  const normalizedId = normalizeIconId(iconId)
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>(() => normalizedId === undefined || failedIconIds.has(normalizedId) ? 'failed' : 'loading')
  const source = iconAssetUrl(normalizedId) ?? ''
  useEffect(() => { setStatus(normalizedId === undefined || failedIconIds.has(normalizedId) ? 'failed' : 'loading') }, [normalizedId, source])
  if (!source || status === 'failed') {
    return showPlaceholder ? <span className={`reference-placeholder ${large ? 'large' : ''}`} title="Không có ảnh"><ImageOff size={large ? 20 : 14} /></span> : null
  }
  return <img className={`reference-icon ${large ? 'large' : ''} ${status === 'loading' ? 'is-loading' : ''}`} src={source} alt={label} loading="lazy" aria-busy={status === 'loading'} onLoad={() => setStatus('ready')} onError={() => { if (normalizedId !== undefined) failedIconIds.add(normalizedId); setStatus('failed') }} />
}

function shouldRenderIcon(kind: ReferenceKind, resolved?: LookupOption) {
  return imageReferenceKinds.has(kind) || resolved?.iconId !== undefined
}

export function ReferenceThumbnail({ kind, value, catalog, option }: { kind: ReferenceKind; value: string | number; catalog?: ReferenceCatalog; option?: LookupOption }) {
  const resolved = option ?? catalog?.get(kind)?.get(String(value))
  const label = resolved?.label ?? (kind === 'icons' ? 'Icon' : 'Không tìm thấy')
  const iconId = kind === 'icons' ? normalizeIconId(value) : normalizeIconId(resolved?.iconId)
  return <span className="reference-thumbnail" title={`${referenceKindLabel(kind)} ${displayId(value)} · ${label}`}>
    <IconPreview iconId={iconId} label={label} showPlaceholder={shouldRenderIcon(kind, resolved)} />
  </span>
}

export function ResolvedReference({
  kind,
  value,
  catalog,
  option,
  compact = false,
}: {
  kind: ReferenceKind
  value: string | number
  catalog?: ReferenceCatalog
  option?: LookupOption
  compact?: boolean
}) {
  const resolved = option ?? catalog?.get(kind)?.get(String(value))
  const label = resolved?.label ?? (kind === 'icons' ? 'Icon' : 'Không tìm thấy')
  const iconId = kind === 'icons' ? normalizeIconId(value) : normalizeIconId(resolved?.iconId)
  return <span className={`resolved-reference ${compact ? 'compact' : ''}`} title={`${referenceKindLabel(kind)} ${displayId(value)}${resolved ? ` · ${label}` : ''}`}>
    <IconPreview iconId={iconId} label={label} showPlaceholder={shouldRenderIcon(kind, resolved)} />
    <span className="reference-copy"><strong>{label}</strong><small>{displayId(value)}</small></span>
  </span>
}

export function ReferenceCell({ value, resource, field, catalog }: { value: unknown; resource: string; field: string; catalog: ReferenceCatalog }) {
  const directKind = referenceKindForField(resource, field)
  const references = useMemo(() => {
    if (value === null || value === undefined) return []
    return collectFieldReferences(value, resource, field)
  }, [field, resource, value])
  if (directKind && (typeof value === 'number' || typeof value === 'string') && /^-?\d+$/.test(String(value).trim())) {
    return <ResolvedReference kind={directKind} value={value} catalog={catalog} compact />
  }
  if (references.length > 0 && typeof value === 'string') {
    return <JsonReferenceSummary references={references} catalog={catalog} />
  }
  return <span title={formatRawValue(value)}>{formatRawValue(value)}</span>
}

export function JsonReferenceSummary({ references, catalog }: { references: ReferenceToken[]; catalog: ReferenceCatalog }) {
  const visible = references.slice(0, 4)
  return <span className="json-reference-summary" title={`${references.length} quan hệ ID`}>
    {visible.map((reference, index) => <ResolvedReference key={`${reference.kind}-${String(reference.value)}-${index}`} {...reference} catalog={catalog} compact />)}
    {references.length > visible.length && <small className="reference-more">+{references.length - visible.length}</small>}
  </span>
}

export function JsonReferencePreview({ value, resource, field }: { value: string; resource: string; field?: string }) {
  const parsed = useMemo(() => parseJsonDocument(value), [value])
  const references = useMemo(() => parsed === null ? [] : field ? collectFieldReferences(parsed, resource, field) : collectReferences(parsed, resource), [parsed, resource, field])
  const lookup = useReferenceCatalog(references)
  if (value.trim() && parsed === null) {
    return <div className="json-preview invalid"><span>JSON chưa hợp lệ — chưa thể phân giải ID.</span></div>
  }
  if (!references.length) {
    return <div className="json-preview"><span className="muted">Chưa phát hiện ID quan hệ trong JSON.</span></div>
  }
  return <div className="json-preview">
    <div className="json-preview-heading"><strong>Preview dữ liệu</strong>{lookup.isLoading && <span className="muted">Đang tải label…</span>}{lookup.isError && <span className="muted">Lookup tạm thời không khả dụng</span>}</div>
    <div className="json-preview-list">
      {references.slice(0, 30).map((reference, index) => <div className="json-preview-row" key={`${reference.path}-${index}`}><code>{reference.path}</code><ResolvedReference {...reference} catalog={lookup.catalog} compact /></div>)}
    </div>
    {references.length > 30 && <small className="muted">Chỉ hiển thị 30 ID đầu tiên.</small>}
  </div>
}

export function useRowReferenceCatalog(rows: ResourceRow[], resource: string) {
  const references = useMemo(() => collectRowReferences(rows, resource), [rows, resource])
  return useReferenceCatalog(references)
}

export function LookupSelect({
  kind,
  value,
  onChange,
  placeholder = 'Tìm theo ID hoặc tên…',
  resolvedOption,
  onOptionChange,
}: {
  kind: Exclude<ReferenceKind, 'icons'>
  value: string
  onChange: (value: string) => void
  placeholder?: string
  resolvedOption?: LookupOption
  onOptionChange?: (option: LookupOption) => void
}) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [selectedOption, setSelectedOption] = useState<LookupOption | undefined>()
  const query = useQuery({
    queryKey: ['lookup-search', kind, search],
    queryFn: () => api.lookup(kind, { search, limit: 50 }),
    enabled: open,
    staleTime: 60_000,
    retry: false,
  })
  const selectedQuery = useQuery({
    queryKey: ['lookup-selected', kind, value],
    queryFn: () => api.lookup(kind, { ids: [value], limit: 1 }),
    enabled: Boolean(value) && !resolvedOption,
    staleTime: 10 * 60 * 1000,
    retry: false,
  })
  const selected = query.data?.find((option) => String(option.id) === value)
    ?? (selectedOption && String(selectedOption.id) === value ? selectedOption : selectedQuery.data?.[0])
    ?? (resolvedOption && String(resolvedOption.id) === value ? resolvedOption : undefined)
  const catalog: ReferenceCatalog = useMemo(() => new Map([[kind, new Map((query.data ?? []).map((option) => [String(option.id), option]))]]), [kind, query.data])
  return <div className="lookup-select" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
    <div className="lookup-select-control">
      <Search size={14} />
      {selected && !open && shouldRenderIcon(kind, selected) && <span className="lookup-select-selected-icon"><ReferenceThumbnail kind={kind} value={selected.id} option={selected} /></span>}
      <input value={selected && !open ? selected.label : search} onFocus={() => { setOpen(true); setSearch('') }} onChange={(event) => { setSearch(event.target.value); setOpen(true) }} placeholder={placeholder} />
      {value && <button type="button" className="lookup-clear" onMouseDown={(event) => event.preventDefault()} onClick={() => onChange('')} aria-label="Xóa lựa chọn"><X size={13} /></button>}
    </div>
    {open && <div className="lookup-select-options" role="listbox">
      {query.isLoading && <span className="lookup-empty">Đang tìm…</span>}
      {!query.isLoading && !query.data?.length && <span className="lookup-empty">Không tìm thấy</span>}
      {query.data?.map((option) => <button type="button" key={String(option.id)} role="option" aria-selected={String(option.id) === value} onMouseDown={(event) => event.preventDefault()} onClick={() => { setSelectedOption(option); onChange(String(option.id)); onOptionChange?.(option); setOpen(false); setSearch('') }}><ResolvedReference kind={kind} value={option.id} option={option} catalog={catalog} compact /></button>)}
    </div>}
  </div>
}

function formatRawValue(value: unknown) {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'Có' : 'Không'
  if (typeof value === 'object') return JSON.stringify(value)
  const text = String(value)
  return text.length > 80 ? `${text.slice(0, 77)}…` : text
}
