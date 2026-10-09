import type { GroupBy, Login, Strength } from '../types'

/** Weak: short, or fewer than three of lower / upper / digit / symbol. */
export function strengthOf(password: string): 'weak' | 'strong' {
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(r => r.test(password)).length
  return password.length < 10 || classes < 3 ? 'weak' : 'strong'
}

/** Rates every password: reused beats weak beats strong. Empty passwords count as weak. */
export function rate(passwords: string[]): Strength[] {
  const uses = new Map<string, number>()
  for (const p of passwords) if (p) uses.set(p, (uses.get(p) ?? 0) + 1)
  return passwords.map(p => (p && (uses.get(p) ?? 0) > 1 ? 'reused' : strengthOf(p)))
}

/** The registrable part of a host: accounts.google.com → google.com, x.co.uk → x.co.uk. */
export function siteOf(host: string): string {
  const parts = host.replace(/^www\./, '').split('.').filter(Boolean)
  if (parts.length <= 2) return parts.join('.') || host
  const [sld, tld] = parts.slice(-2) as [string, string]
  const take = tld.length === 2 && sld.length <= 3 ? 3 : 2
  return parts.slice(-take).join('.')
}

export const STRENGTH_LABEL: Record<Strength, string> = { reused: 'Reused', weak: 'Weak', strong: 'Strong' }
export const STRENGTH_COLOR: Record<Strength, string> = { reused: '#ef4444', weak: '#f59e0b', strong: '#22c55e' }

export type Group = { key: string; label: string; color?: string; items: Login[] }

export function groupLogins(list: Login[], by: GroupBy): Group[] {
  if (by === 'none') return [{ key: 'all', label: 'All', items: list }]
  if (by === 'health') {
    return (['reused', 'weak', 'strong'] as const)
      .map(s => ({ key: s, label: STRENGTH_LABEL[s], color: STRENGTH_COLOR[s], items: list.filter(l => l.strength === s) }))
      .filter(g => g.items.length > 0)
  }
  const map = new Map<string, Login[]>()
  for (const l of list) {
    const k = by === 'site' ? l.site : l.username || '(no username)'
    map.set(k, [...(map.get(k) ?? []), l])
  }
  return [...map.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([k, items]) => ({ key: `${by}:${k}`, label: k, items }))
}
