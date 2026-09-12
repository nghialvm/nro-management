import { describe, expect, it } from 'vitest'
import {
  collectReferences,
  collectFieldReferences,
  collectRowReferences,
  isJsonObjectDocument,
  parseJsonDocument,
  referenceKindForField,
  uniqueReferenceIds,
} from './relations'

describe('management reference mapping', () => {
  it('maps explicit table fields to the correct lookup kind', () => {
    expect(referenceKindForField('drops', 'item_id')).toBe('items')
    expect(referenceKindForField('drops', 'option_id')).toBe('options')
    expect(referenceKindForField('drops', 'map_id')).toBe('maps')
    expect(referenceKindForField('drops', 'mob_id')).toBe('mobs')
    expect(referenceKindForField('shops', 'npc_id')).toBe('npcs')
    expect(referenceKindForField('players', 'clan_id')).toBe('clans')
    expect(referenceKindForField('players', 'clanId')).toBe('clans')
    expect(referenceKindForField('items', 'icon_id')).toBe('icons')
    expect(referenceKindForField('badges', 'idEffect')).toBeUndefined()
  })

  it('batch-resolves clan references without guessing unrelated IDs', () => {
    const references = collectRowReferences([
      { id: 1102, clan_id: 7, idEffect: 47 },
      { id: 1103, clanId: 7 },
    ], 'players')
    expect(uniqueReferenceIds(references).get('clans')).toEqual(['7'])
    expect(references).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'options', value: 47 }),
    ]))
  })

  it('collects nested item and option IDs without changing their values', () => {
    const data = {
      item: [{ id: 12, quantity: 2, options: [{ id: 47, param: 5 }] }],
      mapJoin: [3, 4],
      skillTemp: [8],
    }
    const references = collectReferences(data, 'giftcodes')
    expect(references).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'items', value: 12 }),
      expect.objectContaining({ kind: 'options', value: 47 }),
      expect.objectContaining({ kind: 'maps', value: 3 }),
      expect.objectContaining({ kind: 'maps', value: 4 }),
      expect.objectContaining({ kind: 'skills', value: 8 }),
    ]))
    expect(data.item[0].id).toBe(12)
  })

  it('deduplicates batch lookup IDs by kind', () => {
    const references = collectRowReferences([
      { item_id: 10, option_id: 2, map_id: 5 },
      { item_id: 10, option_id: 3, map_id: 5 },
    ], 'drops')
    expect(uniqueReferenceIds(references).get('items')).toEqual(['10'])
    expect(uniqueReferenceIds(references).get('maps')).toEqual(['5'])
    expect(uniqueReferenceIds(references).get('options')).toEqual(['2', '3'])
  })

  it('resolves part DATA and boss arrays as image/map/skill references', () => {
    const references = collectReferences({
      DATA: '[[17,0,0],[18,0,0]]',
      mapJoin: [9],
      skillTemp: [21],
      outfit: [4, 5, 6],
    }, 'parts')
    expect(references).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'icons', value: 17 }),
      expect.objectContaining({ kind: 'icons', value: 18 }),
      expect.objectContaining({ kind: 'maps', value: 9 }),
      expect.objectContaining({ kind: 'skills', value: 21 }),
      expect.objectContaining({ kind: 'parts', value: 4 }),
    ]))
  })

  it('keeps the DATA field context when the part JSON is stored as a cell string', () => {
    const references = collectFieldReferences('[[7679,3,-15],[7680,3,-13]]', 'parts', 'DATA')
    expect(references).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'icons', value: 7679 }),
      expect.objectContaining({ kind: 'icons', value: 7680 }),
    ]))
  })

  it('does not treat player currency data as item template ids', () => {
    const references = collectReferences({
      data_inventory: '[2858426228,100,0,0]',
      items_body: '[[1,1,[],0]]',
    }, 'players')

    expect(references).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'items', value: 2858426228 }),
    ]))
    expect(references).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'items', value: 1 }),
    ]))
  })

  it('resolves legacy map mob rows stored as JSON strings', () => {
    const references = collectReferences({ mobs: ['[15, 1, 2, 3, 4]'], npcs: [[7, 10, 20]] }, 'maps')
    expect(references).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'mobs', value: 15 }),
      expect.objectContaining({ kind: 'npcs', value: 7 }),
    ]))
  })

  it('resolves options inside legacy item arrays', () => {
    const references = collectReferences({ items_bag: ['[12,2,"[[47,5]]",0]'] }, 'players')
    expect(references).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'items', value: 12 }),
      expect.objectContaining({ kind: 'options', value: 47 }),
    ]))
  })

  it('resolves player task IDs with the matching task template kind', () => {
    expect(collectFieldReferences('[13,1,0,0]', 'players', 'data_task')).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'tasks', value: 13 }),
    ]))
    expect(collectFieldReferences('[20,0,3,10,2,1]', 'players', 'data_clan_task')).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'clan-tasks', value: 20 }),
    ]))
    expect(collectFieldReferences('[4,490]', 'players', 'data_kol_task')).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'kol-tasks', value: 4 }),
    ]))
  })

  it('returns null for malformed JSON so editors can block submit', () => {
    expect(parseJsonDocument('{"item_id": 1}')).toEqual({ item_id: 1 })
    expect(parseJsonDocument('{broken')).toBeNull()
    expect(isJsonObjectDocument('{"item_id": 1}')).toBe(true)
    expect(isJsonObjectDocument('[1, 2]')).toBe(false)
  })
})
