import type { AttributeServerRow, AttributeServerUpdate } from './types'

export const ATTRIBUTE_SERVER_VALUE_MIN = 0
export const ATTRIBUTE_SERVER_VALUE_MAX = 100_000
export const ATTRIBUTE_SERVER_TIME_MIN = -1
export const ATTRIBUTE_SERVER_TIME_MAX = 2_147_483_647

export type AttributeServerDraft = AttributeServerUpdate

export function isAttributeServerDraftValid(draft: AttributeServerDraft) {
  return Number.isInteger(draft.value)
    && draft.value >= ATTRIBUTE_SERVER_VALUE_MIN
    && draft.value <= ATTRIBUTE_SERVER_VALUE_MAX
    && Number.isInteger(draft.time)
    && draft.time >= ATTRIBUTE_SERVER_TIME_MIN
    && draft.time <= ATTRIBUTE_SERVER_TIME_MAX
}

export function buildAttributeServerPayload(
  draft: AttributeServerDraft,
  source: Pick<AttributeServerRow, 'value' | 'time'>,
): AttributeServerUpdate | null {
  if (draft.value === source.value && draft.time === source.time) return null
  return { value: draft.value, time: draft.time }
}
