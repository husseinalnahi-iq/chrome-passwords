import { describe, expect, test } from 'claude-code/testing'

import { parseChromeExport, parseCsv } from '../hooks/csv'

describe('Chrome export parsing', () => {
  test('reads quoted fields, escaped quotes and a BOM', async () => {
    const csv =
      '\uFEFFname,url,username,password,note\r\n' +
      'github.com,https://github.com/login,me@x.com,"p,a""ss",\r\n' +
      'example.com,https://example.com/,bob,secret,"multi\nline"\n'
    const logins = parseChromeExport(csv)
    expect(logins.length).toBe(2)
    expect(logins[0]?.password).toBe('p,a"ss')
    expect(logins[1]?.username).toBe('bob')
    expect(parseCsv('a,b\n\n1,2\n').length).toBe(2)
  })

  test('rejects a CSV that is not a passwords export', async () => {
    expect(() => parseChromeExport('foo,bar\n1,2\n')).toThrow()
  })
})

describe('guard', () => {
  test('denies tool calls that name a Chrome passwords export', async ($, on) => {
    on('tool.call', () => ({ result: 'ran' }))

    const blocked = await $.tool.call({ tool: 'Read', file_path: 'C:\\Users\\me\\Downloads\\Chrome Passwords.csv' })
    expect(blocked.deny).toContain('private')
    const viaShell = await $.tool.call({ tool: 'Bash', command: 'cat "/c/Users/me/Downloads/Chrome Passwords (1).csv"' })
    expect(viaShell.deny).toContain('private')
    const other = await $.tool.call({ tool: 'Read', file_path: 'C:\\work\\notes.csv' })
    expect(other.deny).toBeUndefined()
  })
})
