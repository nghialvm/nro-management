import { describe, expect, it } from 'vitest'
import { buildPlayerUpdatePayload, emptyPlayerItem, parsePlayerItems, serializePlayerItems } from './playerData'

describe('player item data', () => {
  it('parses the legacy string-item format and preserves numeric IDs when saved', () => {
    const raw = JSON.stringify([
      JSON.stringify([838, 1, JSON.stringify([JSON.stringify([47, 2])]), 123]),
      JSON.stringify([-1, 0, '[]', 124]),
    ])
    const parsed = parsePlayerItems(raw)

    expect(parsed.error).toBeUndefined()
    expect(parsed.format).toBe('string-items')
    expect(parsed.entries[0]).toMatchObject({ itemId: 838, quantity: 1, options: [{ id: 47, param: 2 }] })

    const saved = serializePlayerItems(parsed.entries, parsed.format)
    const roundTrip = parsePlayerItems(saved)
    expect(roundTrip.entries.map((entry) => entry.itemId)).toEqual([838, -1])
    expect(roundTrip.entries[0].options).toEqual([{ id: 47, param: 2 }])
  })

  it('reports malformed item or option JSON without throwing', () => {
    expect(parsePlayerItems('{bad-json').error).toBeTruthy()
    const malformedOptions = JSON.stringify([JSON.stringify([838, 1, '["not-a-pair"]', 123])])
    expect(parsePlayerItems(malformedOptions).error).toContain('Options')
  })

  it('removes an equipped item by emptying only its existing slot', () => {
    const raw = JSON.stringify([
      JSON.stringify([838, 1, JSON.stringify([JSON.stringify([47, 2])]), 123]),
      JSON.stringify([839, 1, '[]', 124]),
      JSON.stringify([-1, 0, '[]', 125]),
    ])
    const parsed = parsePlayerItems(raw)
    const removed = emptyPlayerItem(parsed.entries[1])
    const saved = serializePlayerItems(
      parsed.entries.map((entry) => entry.index === 1 ? removed : entry),
      parsed.format,
    )
    const roundTrip = parsePlayerItems(saved)

    expect(roundTrip.entries).toHaveLength(3)
    expect(roundTrip.entries.map((entry) => entry.itemId)).toEqual([838, -1, -1])
    expect(roundTrip.entries[0].options).toEqual([{ id: 47, param: 2 }])
    expect(roundTrip.entries.map((entry) => entry.index)).toEqual([0, 1, 2])
  })

  it('builds a partial player payload without read-only or unchanged fields', () => {
    const source = {
      id: 1234,
      name: 'Warrior',
      items_body: 'old-items',
      items_bag: 'same-bag',
      LastTimeLoginGame: '2026-09-13 10:00:00',
    }
    const draft = {
      ...source,
      items_body: 'new-items',
      LastTimeLoginGame: '2026-09-13 11:00:00',
    }

    expect(buildPlayerUpdatePayload(draft, source)).toEqual({ id: 1234, items_body: 'new-items' })
    expect(buildPlayerUpdatePayload(source, source)).toEqual({ id: 1234 })
  })
})
