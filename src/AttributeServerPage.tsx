import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, RefreshCw, Save, Zap } from 'lucide-react'
import { api } from './api'
import {
  ATTRIBUTE_SERVER_TIME_MAX,
  ATTRIBUTE_SERVER_TIME_MIN,
  ATTRIBUTE_SERVER_VALUE_MAX,
  ATTRIBUTE_SERVER_VALUE_MIN,
  buildAttributeServerPayload,
  isAttributeServerDraftValid,
  type AttributeServerDraft,
} from './attributeServerData'
import type { AttributeServerConfig, AttributeServerRow, AttributeServerUpdate } from './types'

const numberFormat = new Intl.NumberFormat('vi-VN')

function formatTemplateName(name: string, value: number) {
  return name.replace('#value', numberFormat.format(value))
}

function statusText(time: number) {
  if (time === -1) return 'Vĩnh viễn'
  if (time === 0) return 'Tắt'
  return `${numberFormat.format(time)} giây`
}

export function AttributeServerPage() {
  const queryClient = useQueryClient()
  const query = useQuery<AttributeServerConfig>({ queryKey: ['attribute-server'], queryFn: api.attributeServer })
  const [drafts, setDrafts] = useState<Record<number, AttributeServerDraft>>({})

  useEffect(() => {
    if (!query.data) return
    const next: Record<number, AttributeServerDraft> = {}
    query.data.attributes.forEach((row) => { next[row.id] = { value: row.value, time: row.time } })
    setDrafts(next)
  }, [query.data])

  const save = useMutation<AttributeServerRow, Error, { id: number; payload: AttributeServerUpdate }>({
    mutationFn: ({ id, payload }) => api.updateAttributeServer(id, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData<AttributeServerConfig>(['attribute-server'], (current) => {
        if (!current) return current
        return {
          ...current,
          attributes: current.attributes.map((row) => row.id === updated.id ? updated : row),
        }
      })
    },
  })

  const updateDraft = (row: AttributeServerRow, field: keyof AttributeServerDraft, value: string) => {
    const parsed = value === '' ? 0 : Number(value)
    setDrafts((current) => ({
      ...current,
      [row.id]: { ...(current[row.id] ?? { value: row.value, time: row.time }), [field]: parsed },
    }))
  }

  const saveRow = (row: AttributeServerRow) => {
    const draft = drafts[row.id] ?? { value: row.value, time: row.time }
    const payload = buildAttributeServerPayload(draft, row)
    if (!payload || !isAttributeServerDraftValid(draft)) return
    save.mutate({ id: row.id, payload })
  }

  return <>
    <div className="page-header">
      <div>
        <p className="eyebrow">NRO MANAGEMENT</p>
        <h2>Tiềm năng server</h2>
        <p className="muted">Chỉnh buff toàn server, cập nhật runtime và database ngay lập tức.</p>
      </div>
      <div className="page-actions">
        <button className="secondary" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw className={query.isFetching ? 'spin' : ''} size={16} /> Làm mới</button>
      </div>
    </div>

    <div className="alert warning attribute-server-warning">
      <AlertTriangle size={18} />
      <div>
        <strong>Buff TNSM vẫn chịu giới hạn EXP hiện tại.</strong>
        <span>11000% là cộng 110 lần phần gốc; từ 50 tỷ sức mạnh còn 20%, từ 100 tỷ trở lên còn 1%, mỗi lần tối đa 20 triệu sau giảm.</span>
        <span>Điểm sức mạnh cao nhất đang cấu hình: {query.data?.powerLimit ? `${numberFormat.format(query.data.powerLimit)} (${numberFormat.format(query.data.powerLimit / 1_000_000_000)} tỷ)` : 'đang tải'}.</span>
      </div>
    </div>

    {query.isError && <div className="alert danger"><AlertTriangle size={16} />{query.error instanceof Error ? query.error.message : 'Không thể tải attribute server'}</div>}
    {query.isLoading && <section className="panel skeleton-block"><span /><span /><span /></section>}
    {query.data && <div className="attribute-server-grid">
      {query.data.attributes.map((row) => {
        const draft = drafts[row.id] ?? { value: row.value, time: row.time }
        const payload = buildAttributeServerPayload(draft, row)
        const valid = isAttributeServerDraftValid(draft)
        const saving = save.isPending && save.variables?.id === row.id
        const isTnsm = row.templateId === 1
        return <section className={`panel attribute-server-card ${isTnsm ? 'featured' : ''}`} key={row.id}>
          <div className="panel-heading">
            <div><h3>{formatTemplateName(row.templateName, draft.value)}</h3><p className="muted">Template #{row.templateId}{isTnsm ? ' · Áp dụng cho sư phụ và đệ tử' : ''}</p></div>
            <Zap size={19} className="heading-icon" />
          </div>
          <div className="attribute-server-fields">
            <label>Value (%)<input type="number" min={ATTRIBUTE_SERVER_VALUE_MIN} max={ATTRIBUTE_SERVER_VALUE_MAX} step="1" value={draft.value} onChange={(event) => updateDraft(row, 'value', event.target.value)} /></label>
            <label>Thời gian (giây)<input type="number" min={ATTRIBUTE_SERVER_TIME_MIN} max={ATTRIBUTE_SERVER_TIME_MAX} step="1" value={draft.time} onChange={(event) => updateDraft(row, 'time', event.target.value)} /></label>
          </div>
          <div className={`attribute-server-status ${draft.time === 0 ? 'off' : 'on'}`}><span />{statusText(draft.time)}{draft.time !== 0 ? (payload ? ' · chưa lưu' : ' · đang áp dụng') : ''}</div>
          {!valid && <div className="field-error">Value phải từ 0 đến 100.000; time từ -1 đến 2.147.483.647.</div>}
          <div className="attribute-server-actions"><small className="muted">-1 = vĩnh viễn · 0 = tắt</small><button className="primary" disabled={!payload || !valid || saving} onClick={() => saveRow(row)}><Save size={16} />{saving ? 'Đang lưu…' : 'Lưu'}</button></div>
        </section>
      })}
    </div>}
    {save.isError && <div className="alert danger attribute-server-save-error"><AlertTriangle size={16} />{save.error.message}</div>}
  </>
}
