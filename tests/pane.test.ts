import { expect, mock, test } from 'claude-code/testing'

const CSV =
  'name,url,username,password,note\n' +
  'google,https://accounts.google.com/,me@x.com,same-Pass-123,\n' +
  'mail,https://mail.google.com/,me@x.com,same-Pass-123,\n' +
  'site,https://example.com/,bob,abc,\n'

test('the loaded pane draws grouped rows on terminal and desktop', async ($, on) => {
  on('fs.stat', () => ({ value: { kind: 'file', size: CSV.length, mtimeMs: 0, isLink: false } }))
  on('fs.read', () => ({ value: CSV }))
  on('ui.open', () => ({ value: {} }))
  mock.store(on)
  const clock = mock.clock(on)

  const ran = await $.command.run({ command: 'passwords', args: 'import C:/x/export.csv' })
  expect(ran.text).toContain('Imported 3 logins')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'chrome-passwords', surface, component: 'Pane', requestId: 'chrome-passwords', props: {} })
    expect(await ui.find({ key: 'g:reused' })).toBeDefined()
    await ui.press({ key: 'g:reused' })
    expect(await ui.find({ key: 'pass:l0' })).toBeDefined()

    // 👁 shows the password in the pane, and it hides itself after 10 s
    expect(await ui.find({ type: 'Text', text: 'same-Pass-123' })).toBeUndefined()
    await ui.press({ key: 'show:l0' })
    expect(await ui.find({ type: 'Text', text: 'same-Pass-123' })).toBeDefined()
    expect((await ui.find({ key: 'show:l0' }))?.text).toBe('🙈 hide')
    await clock.advance(10_000)
    expect(await ui.find({ type: 'Text', text: 'same-Pass-123' })).toBeUndefined()

    // pressing it again hides it at once
    await ui.press({ key: 'show:l0' })
    await ui.press({ key: 'show:l0' })
    expect(await ui.find({ type: 'Text', text: 'same-Pass-123' })).toBeUndefined()

    await ui.press({ key: 'by:site' })
    expect(await ui.find({ key: 'g:site:google.com' })).toBeDefined()
    await ui.press({ key: 'by:health' })
    await ui.unmount()
  }
})
