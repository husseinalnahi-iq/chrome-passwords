/** Parses RFC 4180 CSV (quoted fields, "" escapes, CRLF or LF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text

  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some(f => f !== '')) rows.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.some(f => f !== '')) rows.push(row)
  return rows
}

export type ParsedLogin = { name: string; url: string; username: string; password: string }

/** Reads Chrome's export (name,url,username,password,note); column order taken from the header. */
export function parseChromeExport(text: string): ParsedLogin[] {
  const [header, ...rows] = parseCsv(text)
  if (!header) return []
  const col = (n: string) => header.findIndex(h => h.trim().toLowerCase() === n)
  const iName = col('name')
  const iUrl = col('url')
  const iUser = col('username')
  const iPass = col('password')
  if (iPass < 0 || (iUrl < 0 && iName < 0)) {
    throw new Error('not a Chrome passwords export (needs name/url, username, password columns)')
  }
  const at = (r: string[], i: number) => (i < 0 ? '' : (r[i] ?? ''))
  return rows.map(r => ({
    name: at(r, iName),
    url: at(r, iUrl),
    username: at(r, iUser),
    password: at(r, iPass),
  }))
}
