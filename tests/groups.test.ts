import { describe, expect, test } from 'claude-code/testing'

import type { Login } from '../types'
import { groupLogins, rate, siteOf } from '../hooks/groups'

describe('grouping', () => {
  test('rates reused, weak and strong passwords', async () => {
    expect(rate(['abc', 'Tr0ub4dor&3x!', 'same-Pass-123', 'same-Pass-123'])).toEqual(['weak', 'strong', 'reused', 'reused'])
  })

  test('finds the registrable site', async () => {
    expect(siteOf('accounts.google.com')).toBe('google.com')
    expect(siteOf('admin.demo.acme.ice.global')).toBe('ice.global')
    expect(siteOf('shop.example.co.uk')).toBe('example.co.uk')
    expect(siteOf('www.albarqiq.com')).toBe('albarqiq.com')
  })

  test('groups by status in reused, weak, strong order and by site by size', async () => {
    const mk = (id: string, site: string, strength: Login['strength']): Login =>
      ({ id, name: site, url: '', username: 'u', site, strength })
    const list = [mk('1', 'a.com', 'strong'), mk('2', 'b.com', 'reused'), mk('3', 'b.com', 'weak')]
    expect(groupLogins(list, 'health').map(g => g.key)).toEqual(['reused', 'weak', 'strong'])
    expect(groupLogins(list, 'site').map(g => g.label)).toEqual(['b.com', 'a.com'])
  })
})
