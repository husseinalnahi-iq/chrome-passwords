import type { EngineInterface, Register } from 'claude-code'

import type { GroupBy, Login } from '../types'
import { BUDDY_HEIGHT, BUDDY_SVG_HEIGHT, BUDDY_SVG_WIDTH, buddyRows, buddySvg } from './buddy'
import { parseChromeExport } from './csv'
import { groupLogins, rate, siteOf, STRENGTH_COLOR } from './groups'

const PANE = 'chrome-passwords'
const PATH_KEY = 'csvPath'
const HIDE_KEY = 'buddyHidden'
const TICK = { plugin: 'chrome-passwords', key: 'tick' } as const
const HIDDEN = { plugin: 'chrome-passwords', key: 'buddyHidden' } as const
const GROUP_BY = { plugin: 'chrome-passwords', key: 'groupBy' } as const
const EXPANDED = { plugin: 'chrome-passwords', key: 'expanded' } as const
const GROUP_KEY = 'groupBy'
const GROUP_MODES: { by: GroupBy; label: string }[] = [
  { by: 'health', label: 'Status' },
  { by: 'site', label: 'Site' },
  { by: 'account', label: 'Account' },
  { by: 'none', label: 'None' },
]

// The mascot only animates while the pane is drawing; a closed pane stops
// drawing, so ticks stop writing until it opens again.
let lastDrawn = 0
const LOGINS = { plugin: 'chrome-passwords', key: 'logins' } as const
const QUERY = { plugin: 'chrome-passwords', key: 'query' } as const
const MESSAGE = { plugin: 'chrome-passwords', key: 'message' } as const
const FOUND = { plugin: 'chrome-passwords', key: 'found' } as const

// Passwords live only in this module's memory: never in $.state, $.store or
// any text the model reads. A hot reload drops them; they are re-read from
// the CSV on the next copy.
let secrets = new Map<string, string>()
let guardedPath: string | undefined

const REVEALED = { plugin: 'chrome-passwords', key: 'revealed' } as const
const REVEAL_MS = 10_000
let revealTimer: { cancel: () => void } | undefined

const norm = (p: string) => p.replace(/\\/g, '/').toLowerCase()
const baseName = (p: string) => norm(p).split('/').pop() ?? ''
const CHROME_EXPORT = /chrome passwords[^"'\n]*\.csv/i
const USAGE = '/passwords import <any CSV file or folder path>'
const isPasswordCsv = (name: string) => /\.csv$/i.test(name) && /pass/i.test(name)
const join = (dir: string, name: string) => `${dir.replace(/[\\/]+$/, '')}\\${name}`
const unquote = (p: string) => p.trim().replace(/^["']|["']$/g, '')

/** Every string inside a tool call's input, joined, so a guard can scan it. */
const textOf = (v: unknown): string =>
  typeof v === 'string'
    ? v
    : Array.isArray(v)
      ? v.map(textOf).join('\n')
      : v !== null && typeof v === 'object'
        ? Object.values(v).map(textOf).join('\n')
        : ''

const hostOf = (url: string) => {
  try { return new URL(url).hostname } catch { return url }
}

async function load($: EngineInterface, path: string): Promise<number> {
  const parsed = parseChromeExport(await $.fs.read(path))
  secrets = new Map()
  const strengths = rate(parsed.map(p => p.password))
  const list: Login[] = parsed.map((p, i) => {
    const id = `l${i}`
    secrets.set(id, p.password)
    const name = p.name || hostOf(p.url)
    return { id, name, url: p.url, username: p.username, site: siteOf(hostOf(p.url) || name), strength: strengths[i] ?? 'weak' }
  })
  list.sort((a, b) => a.name.localeCompare(b.name))
  guardedPath = path
  await $.state.set(LOGINS, list)
  return list.length
}

/** Password CSVs directly in `dir` or one folder below it, newest first. */
async function csvsIn($: EngineInterface, dir: string): Promise<{ path: string; mtimeMs: number }[]> {
  const out: { path: string; mtimeMs: number }[] = []
  const entries = await $.fs.list(dir).catch(() => [])
  for (const en of entries) {
    if (en.kind === 'file' && isPasswordCsv(en.name)) out.push({ path: join(dir, en.name), mtimeMs: en.mtimeMs })
    if (en.kind === 'dir' && !en.name.startsWith('.') && en.name !== 'node_modules') {
      const sub = join(dir, en.name)
      for (const s of await $.fs.list(sub).catch(() => [])) {
        if (s.kind === 'file' && isPasswordCsv(s.name)) out.push({ path: join(sub, s.name), mtimeMs: s.mtimeMs })
      }
    }
  }
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs)
}

/** Looks on Desktop (also OneDrive's), Downloads and Documents. */
async function scan($: EngineInterface): Promise<void> {
  const home = await $.env.get('USERPROFILE')
  if (!home) return
  const roots = ['Desktop', 'OneDrive\\Desktop', 'Downloads', 'Documents'].map(r => join(home, r))
  const found: string[] = []
  for (const root of roots) for (const f of await csvsIn($, root)) found.push(f.path)
  await $.state.set(FOUND, [...new Set(found)].slice(0, 15))
}

/** Imports a CSV file, or the newest password CSV inside a folder. */
async function importPath($: EngineInterface, raw: string): Promise<string> {
  let path = unquote(raw)
  if (!path) throw new Error('give a file or folder path')
  const stat = await $.fs.stat(path).catch(() => undefined)
  if (!stat) throw new Error(`not found: ${path}`)
  if (stat.kind === 'dir') {
    const [newest] = await csvsIn($, path)
    if (!newest) throw new Error(`no CSV with "pass" in its name inside ${path}`)
    path = newest.path
  }
  const count = await load($, path)
  await $.store.set(PATH_KEY, path)
  const msg = `Imported ${count} logins from ${baseName(path)}.`
  await $.state.set(MESSAGE, msg)
  return msg
}

// Windows' own Open dialog, on top of other windows, starting on the Desktop.
const PICKER = [
  '[Console]::OutputEncoding = [Text.Encoding]::UTF8',
  'Add-Type -AssemblyName System.Windows.Forms',
  '$d = New-Object System.Windows.Forms.OpenFileDialog',
  "$d.Title = 'Choose your Chrome passwords CSV'",
  "$d.Filter = 'CSV files (*.csv)|*.csv|All files (*.*)|*.*'",
  "$d.InitialDirectory = [Environment]::GetFolderPath('Desktop')",
  '$owner = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true }',
  "if ($d.ShowDialog($owner) -eq 'OK') { [Console]::Out.Write($d.FileName) }",
].join('; ')

/** Opens the file dialog and imports what the person picks; undefined if cancelled. */
async function browse($: EngineInterface): Promise<string | undefined> {
  const { stdout } = await $.process.run(['powershell.exe', '-NoProfile', '-STA', '-Command', PICKER], {
    timeoutMs: 600_000,
  })
  const picked = stdout.trim()
  return picked ? importPath($, picked) : undefined
}

async function ensureLoaded($: EngineInterface): Promise<boolean> {
  if (secrets.size > 0) return true
  const path = (await $.store.get(PATH_KEY)) as string | undefined
  if (!path) return false
  try {
    await load($, path)
    return true
  } catch {
    await $.state.set(MESSAGE, `Could not read ${path}. Import again.`)
    return false
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'passwords',
      description: 'Chrome passwords: /passwords, /passwords browse, /passwords <csv file or folder>, /passwords forget',
    })
    const path = (await $.store.get(PATH_KEY)) as string | undefined
    if (path) {
      guardedPath = path
      await ensureLoaded($)
    }
    await $.state.set(HIDDEN, (await $.store.get(HIDE_KEY)) === true)
    const savedGroup = (await $.store.get(GROUP_KEY)) as GroupBy | undefined
    await $.state.set(GROUP_BY, savedGroup ?? 'health')

    let tick = 0
    $.clock.every(220, () => {
      if (Date.now() - lastDrawn > 2000) return
      tick += 1
      void $.state.set(TICK, tick)
    })
    return next(e)
  })

  on('command.run', { command: 'passwords' }, async ($, e) => {
    const args = e.args.trim()
    const [sub = ''] = args.split(/\s+/)

    if (sub === 'browse') {
      try {
        const msg = await browse($)
        await $.ui.open({ id: PANE, title: 'Chrome passwords', focus: true })
        return { text: msg ? `${msg} Claude is blocked from reading that file.` : 'No file chosen.' }
      } catch (err) {
        return { text: `Import failed: ${err instanceof Error ? err.message : String(err)}` }
      }
    }

    // `/passwords import <path>` or just `/passwords <path>`: a file or a folder.
    if (sub === 'import' || (args !== '' && sub !== 'forget')) {
      const arg = sub === 'import' ? args.slice(sub.length) : args
      if (!unquote(arg)) return { text: `Usage: ${USAGE}` }
      try {
        const msg = await importPath($, arg)
        await $.ui.open({ id: PANE, title: 'Chrome passwords', focus: true })
        return { text: `${msg} Claude is blocked from reading that file.` }
      } catch (err) {
        return { text: `Import failed: ${err instanceof Error ? err.message : String(err)}` }
      }
    }

    if (sub === 'forget') {
      secrets = new Map()
      guardedPath = undefined
      await $.state.set(REVEALED, '')
      await $.store.delete(PATH_KEY)
      await $.state.set(LOGINS, [])
      return { text: 'Forgot the imported passwords. Delete the CSV file itself too if you no longer need it.' }
    }

    if (!(await ensureLoaded($))) await scan($)
    await $.ui.open({ id: PANE, title: 'Chrome passwords', focus: true })
    return { text: 'Passwords pane opened.' }
  })

  // Keep the export away from the model: deny any tool call that names it.
  on('tool.call', ($, e, next) => {
    const input = norm(textOf(e))
    const hit =
      CHROME_EXPORT.test(input) ||
      (guardedPath !== undefined &&
        (input.includes(norm(guardedPath)) || input.includes(baseName(guardedPath))))
    return hit
      ? { deny: `${$.plugin.name}: the Chrome passwords export is private to the person; use /passwords.` }
      : next(e)
  }).catch(($, e, next) =>
    next.called ? next(e) : { deny: `${$.plugin.name}: its guard failed.` },
  )

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const Input = 'Input' in els ? els.Input : undefined
    const all = (await $.state.get(LOGINS)).value ?? []
    const typed = (await $.state.get(QUERY)).value ?? ''
    const q = typed.toLowerCase()
    const note = (await $.state.get(MESSAGE)).value ?? ''
    const hidden = (await $.state.get(HIDDEN)).value ?? false
    lastDrawn = Date.now()

    const setHidden = async (value: boolean) => {
      await $.state.set(HIDDEN, value)
      await $.store.set(HIDE_KEY, value)
    }
    // The show/hide switch sits in the controls, so nothing is drawn above Clawd.
    const clawdToggle = (
      <Button key="buddy-toggle" plain onPress={() => void setHidden(!hidden)}>
        {hidden ? 'Show Clawd' : 'Hide Clawd'}
      </Button>
    )
    let buddy: ReturnType<typeof Box> | undefined
    const Svg = 'Svg' in els ? els.Svg : undefined
    if (!hidden && Svg) {
      // CSS moves his legs and claws: no tick is read, so the pane is not redrawn for it.
      buddy = (
        <Svg
          key="clawd"
          source={buddySvg()}
          alt="Clawd in an incognito hat, holding a magnifying glass"
          width={BUDDY_SVG_WIDTH}
          height={BUDDY_SVG_HEIGHT}
        />
      )
    } else if (!hidden) {
      const tick = (await $.state.get(TICK)).value ?? 0
      buddy = (
        <Box key="buddy" flexDirection="column">
          {buddyRows(tick).map((row, i) => (
            <Box key={`b${i}`} flexDirection="row">
              {row.map((run, j) => (
                <Text key={`b${i}:${j}`} color={run.color}>{run.text}</Text>
              ))}
            </Box>
          ))}
        </Box>
      )
    }
    const room = Math.max(1, (e.viewport?.rows ?? 24) - 6 - (hidden ? 0 : Svg ? 3 : BUDDY_HEIGHT))
    const shown = q
      ? all.filter(l => `${l.name} ${l.url} ${l.username}`.toLowerCase().includes(q))
      : all

    const copy = async (surface: Parameters<typeof $.ui.copy>[0]['surface'], text: string, what: string) => {
      const res = await $.ui.copy({ text, surface })
      $.ui.toast(res.isCopied ? `${what} copied` : `Copy failed: ${res.reason}`)
    }
    const copyPassword = async (surface: Parameters<typeof $.ui.copy>[0]['surface'], id: string) => {
      await ensureLoaded($)
      const pw = secrets.get(id)
      if (pw === undefined) $.ui.toast('Password unavailable; import again')
      else {
        await copy(surface, pw, 'Password')
      }
    }

    const pick = async () => {
      $.ui.toast('Opening the file dialog…')
      try {
        const msg = await browse($)
        if (msg) $.ui.toast(msg)
      } catch (err) {
        await $.state.set(MESSAGE, `Import failed: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    if (all.length === 0) {
      const found = (await $.state.get(FOUND)).value ?? []
      const tryImport = async (path: string) => {
        try {
          $.ui.toast(await importPath($, path))
        } catch (err) {
          await $.state.set(MESSAGE, `Import failed: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
      return (
        <Box flexDirection="column" gap={1}>
          {buddy}
          <Box flexDirection="row" gap={1}>
            <Text>No passwords imported yet.</Text>
            {clawdToggle}
          </Box>
          <Button key="browse" variant="primary" onPress={() => void pick()}>
            Browse for CSV file…
          </Button>
          {Input && (
            <Input
              key="path"
              label="Path "
              placeholder="paste a CSV file or folder path, then Enter"
              submitLabel="import"
              autoFocus
              onSubmit={(v: string) => void tryImport(v)}
            />
          )}
          <Text dimColor>Or type: {USAGE}</Text>
          <Box flexDirection="column">
            <Box flexDirection="row" gap={1}>
              <Text>
                {found.length > 0 ? 'Found on Desktop / Downloads / Documents:' : 'No password CSV found on Desktop / Downloads / Documents.'}
              </Text>
              <Button key="rescan" onPress={() => void scan($)}>Rescan</Button>
            </Box>
            {found.map((path, i) => (
              <Box key={`found:${i}`} flexDirection="row" gap={1}>
                <Button key={`import:${i}`} variant="primary" onPress={() => void tryImport(path)}>
                  Import
                </Button>
                <Text>{path}</Text>
              </Box>
            ))}
          </Box>
          {note !== '' && <Text dimColor>{note}</Text>}
        </Box>
      )
    }

    const groupBy = (await $.state.get(GROUP_BY)).value ?? 'health'
    const expanded = new Set((await $.state.get(EXPANDED)).value ?? [])
    const setGroupBy = async (by: GroupBy) => {
      await $.state.set(GROUP_BY, by)
      await $.state.set(EXPANDED, [])
      await $.store.set(GROUP_KEY, by)
    }
    const toggle = async (key: string) => {
      const next = new Set((await $.state.get(EXPANDED)).value ?? [])
      if (next.has(key)) next.delete(key)
      else next.add(key)
      await $.state.set(EXPANDED, [...next])
    }

    // At most one password is on screen at a time, for REVEAL_MS. Only its id
    // is in state; the password itself is read from memory while drawing.
    const revealed = (await $.state.get(REVEALED)).value ?? ''
    const toggleReveal = async (id: string) => {
      revealTimer?.cancel()
      if (revealed === id) {
        await $.state.set(REVEALED, '')
        return
      }
      await ensureLoaded($)
      await $.state.set(REVEALED, id)
      revealTimer = $.clock.after(REVEAL_MS, () => void $.state.set(REVEALED, ''))
    }

    const row = (l: Login) => {
      const shown = revealed === l.id ? secrets.get(l.id) : undefined
      return (
        <Box key={`row:${l.id}`} flexDirection="row" gap={1} flexWrap="wrap">
          <Button key={`user:${l.id}`} onPress={p => void copy(p.surface, l.username, 'Username')}>
            user
          </Button>
          <Button key={`pass:${l.id}`} variant="primary" onPress={p => void copyPassword(p.surface, l.id)}>
            pass
          </Button>
          <Button key={`show:${l.id}`} plain onPress={() => void toggleReveal(l.id)}>
            {shown === undefined ? '👁 show' : '🙈 hide'}
          </Button>
          {groupBy !== 'health' && <Text color={STRENGTH_COLOR[l.strength]}>●</Text>}
          <Text>{l.name}</Text>
          <Text dimColor>{l.username}</Text>
          {shown !== undefined && (
            <Text key={`pw:${l.id}`} bold color="#f59e0b">
              {shown === '' ? '(empty password)' : shown}
            </Text>
          )}
        </Box>
      )
    }

    // A search shows every match unfolded; otherwise groups open on a press.
    const groups = groupLogins(shown, groupBy)
    const lines: ReturnType<typeof row>[] = []
    let budget = room - 1
    let hiddenCount = 0
    for (const g of groups) {
      const open = groupBy === 'none' || q !== '' || expanded.has(g.key)
      if (groupBy !== 'none') {
        if (budget <= 0) { hiddenCount += g.items.length; continue }
        budget -= 1
        lines.push(
          <Box key={`gh:${g.key}`} flexDirection="row" gap={1}>
            <Button key={`g:${g.key}`} onPress={() => void toggle(g.key)}>
              {`${open ? '▾' : '▸'} ${g.label}`}
            </Button>
            <Text color={g.color} dimColor={!g.color}>{g.items.length}</Text>
          </Box>,
        )
      }
      if (!open) continue
      const fit = g.items.slice(0, Math.max(0, budget))
      budget -= fit.length
      hiddenCount += g.items.length - fit.length
      lines.push(...fit.map(row))
    }

    return (
      <Box flexDirection="column">
        {buddy}
        {Input && (
          <Input
            key="search"
            label="Search "
            placeholder="site or username"
            value={typed}
            autoFocus
            onInput={(v: string) => void $.state.set(QUERY, v)}
            onSubmit={(v: string) => void $.state.set(QUERY, v)}
          />
        )}
        <Box flexDirection="row" gap={1}>
          <Text dimColor>
            {shown.length} of {all.length}{note !== '' ? ` · ${note}` : ''}
          </Text>
          <Button
            key="change"
            onPress={() => void pick()}
          >
            Change file…
          </Button>
        </Box>
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          <Text dimColor>Group by</Text>
          {GROUP_MODES.map(m => (
            <Button
              key={`by:${m.by}`}
              variant={m.by === groupBy ? 'primary' : undefined}
              onPress={() => void setGroupBy(m.by)}
            >
              {m.label}
            </Button>
          ))}
          {clawdToggle}
        </Box>
        {lines}
        {hiddenCount > 0 && <Text dimColor>…{hiddenCount} more; fold a group or search</Text>}
      </Box>
    )
  })
}
