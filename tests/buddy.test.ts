import { describe, expect, test } from 'claude-code/testing'

import { BUDDY_SVG_WIDTH, buddyRows, buddySvg } from '../hooks/buddy'

describe('buddy', () => {
  test('stands still: only translations, no flips or rotations', async () => {
    const svg = buddySvg()
    expect(svg).toContain(`width="${BUDDY_SVG_WIDTH}"`)
    expect(svg).not.toContain('scaleX')
    expect(svg).not.toContain('rotate')
  })

  test('terminal Clawd shuffles his legs in place', async () => {
    const legs = (t: number) => buddyRows(t)[4]?.[0]?.text
    expect(buddyRows(0).length).toBe(5)
    expect(legs(0)).not.toBe(legs(3))
  })

  test('the pane draws with the buddy on terminal and desktop', async $ => {
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({
        plugin: 'chrome-passwords',
        surface,
        component: 'Pane',
        requestId: 'chrome-passwords',
        props: {},
      })
      expect(await ui.find({ key: 'buddy-toggle' })).toBeDefined()
      expect(await ui.find({ key: 'browse' })).toBeDefined()
      await ui.unmount()
    }
  })
})
