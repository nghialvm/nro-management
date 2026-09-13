import { describe, expect, it } from 'vitest'
import {
  ATTRIBUTE_SERVER_TIME_MIN,
  ATTRIBUTE_SERVER_VALUE_MAX,
  buildAttributeServerPayload,
  isAttributeServerDraftValid,
} from './attributeServerData'

const source = { value: 10, time: 0 }
const sourceRow = {
  id: 1,
  templateId: 1,
  templateName: 'Tăng #value% TNSM toàn máy chủ',
  value: 10,
  time: 0,
  active: false,
}

describe('attribute server data', () => {
  it('does not create a request payload when value and time are unchanged', () => {
    expect(buildAttributeServerPayload(source, source)).toBeNull()
  })

  it('sends only editable value and time fields when a row changes', () => {
    expect(buildAttributeServerPayload({ value: 11000, time: -1 }, sourceRow)).toEqual({ value: 11000, time: -1 })
  })

  it('validates the configured value and permanent duration bounds', () => {
    expect(isAttributeServerDraftValid({ value: ATTRIBUTE_SERVER_VALUE_MAX, time: ATTRIBUTE_SERVER_TIME_MIN })).toBe(true)
    expect(isAttributeServerDraftValid({ value: ATTRIBUTE_SERVER_VALUE_MAX + 1, time: -1 })).toBe(false)
    expect(isAttributeServerDraftValid({ value: 100, time: -2 })).toBe(false)
  })
})
