import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ResolvedReference, iconAssetUrl, normalizeIconId } from './ReferenceDisplay'

describe('reference image display', () => {
  it('normalizes only safe positive icon ids', () => {
    expect(normalizeIconId(7679)).toBe(7679)
    expect(normalizeIconId('7679')).toBe(7679)
    expect(normalizeIconId(0)).toBeUndefined()
    expect(normalizeIconId(-1)).toBeUndefined()
    expect(normalizeIconId('not-an-id')).toBeUndefined()
    expect(normalizeIconId(2_000_001)).toBeUndefined()
  })

  it('builds the safe asset URL from an icon id', () => {
    expect(iconAssetUrl(7679)).toBe('/api/assets/icons/7679')
    expect(iconAssetUrl('7679')).toBe('/api/assets/icons/7679')
    expect(iconAssetUrl(838)).toBe('/api/assets/icons/838')
    expect(iconAssetUrl(-1)).toBeUndefined()
  })

  it('uses the lookup icon id for a part instead of the part id', () => {
    const html = renderToStaticMarkup(createElement(ResolvedReference, {
      kind: 'parts',
      value: 838,
      option: { id: 838, label: 'Part #838 · Head', iconId: 7679 },
    }))

    expect(html).toContain('/api/assets/icons/7679')
    expect(html).not.toContain('/api/assets/icons/838')
    expect(html).toContain('#838')
  })

  it('renders an accessible placeholder when a lookup has no image', () => {
    const html = renderToStaticMarkup(createElement(ResolvedReference, {
      kind: 'parts',
      value: 9999,
      option: { id: 9999, label: 'Part #9999 · Head' },
    }))

    expect(html).toContain('reference-placeholder')
    expect(html).toContain('#9999')
    expect(html).not.toContain('/api/assets/icons/9999')
  })

  it('does not show a broken-image placeholder for references without image support', () => {
    const html = renderToStaticMarkup(createElement(ResolvedReference, {
      kind: 'options',
      value: 47,
      option: { id: 47, label: 'Giáp +#%' },
    }))

    expect(html).not.toContain('reference-placeholder')
    expect(html).toContain('Giáp +#%')
    expect(html).toContain('#47')
  })
})
