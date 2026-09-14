import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../..')
const src = (p: string) => readFileSync(resolve(ROOT, 'src', p), 'utf8')

/**
 * Responsive-audit suite.
 *
 * Guards the mobile adaptations that live in the source files: pages that
 * render a wide desktop table MUST also ship a mobile card list, and rows
 * that contain long content (addresses, names, pills) MUST be protected
 * against overflowing their container on narrow viewports.
 *
 * These are source-scan assertions (no DOM) — cheap, deterministic, and
 * they fail loudly the moment someone strips the mobile layouts.
 */

describe('mobile responsive audit', () => {
  describe('page helper primitives', () => {
    it('table primitive scrolls horizontally instead of overflowing', () => {
      const table = src('components/ui/table.tsx')
      expect(table).toContain('overflow-x-auto')
    })

    it('FullDropdown trigger truncates on narrow screens', () => {
      const dd = src('components/custom/FullDropdown.tsx')
      expect(dd).toContain('max-w-full')
      expect(dd).toContain('truncate')
      expect(dd).toContain('min-w-0')
    })

    it('split AppPageHeader wraps title and action on mobile', () => {
      const header = src('components/custom/AppPageHeader.tsx')
      expect(header).toContain('flex-wrap')
      expect(header).toContain('truncate')
      expect(header).toContain('min-w-0')
    })

    it('centered AppPageHeader back button never collapses', () => {
      const header = src('components/custom/AppPageHeader.tsx')
      expect(header).toContain('shrink-0')
    })
  })

  describe('offer list pages', () => {
    const pages = [
      ['OffersPage', 'pages/OffersPage.tsx'],
      ['ProfilePage (user offers)', 'pages/ProfilePage.tsx'],
    ] as const

    it.each(pages)('%s ships both a desktop table and a mobile card list', (_name, path) => {
      const page = src(path)
      // Desktop table is hidden on mobile…
      expect(page).toContain('hidden md:block')
      expect(page).toContain('md:hidden')
      // …and the mobile list is a stack of tappable cards.
      expect(page).toContain('space-y-3')
      expect(page).toContain('rounded-2xl')
    })
  })

  describe('offer detail page — trader header overflow', () => {
    const page = src('pages/OpenOfferPage.tsx')

    it('trader header stacks vertically on mobile, row on desktop', () => {
      expect(page).toContain('flex-col')
      expect(page).toContain('sm:flex-row')
    })

    it('trader metadata rows wrap instead of overflowing', () => {
      expect(page).toContain('flex-wrap')
      expect(page).toContain('gap-y-2')
    })

    it('long names/addresses truncate and avatars never squash', () => {
      expect(page).toContain('min-w-0')
      expect(page).toContain('truncate')
      expect(page).toContain('shrink-0')
    })
  })

  describe('profile page header centering', () => {
    const page = src('pages/ProfilePage.tsx')

    it('header stacks and centers on mobile, left-aligns on desktop', () => {
      expect(page).toContain('flex-col')
      expect(page).toContain('items-center')
      expect(page).toContain('md:flex-row')
      expect(page).toContain('md:items-start')
      expect(page).toContain('md:text-left')
    })

    it('avatar + name + address column shrink safely on narrow screens', () => {
      expect(page).toContain('shrink-0')
      expect(page).toContain('min-w-0')
      expect(page).toContain('truncate')
    })
  })

  describe('trades / disputes list cards', () => {
    it('TradePage seller header wraps long names', () => {
      const page = src('pages/TradePage.tsx')
      expect(page).toContain('flex-wrap')
      expect(page).toContain('min-w-0')
      expect(page).toContain('truncate')
    })

    it('TradesPage counter-party rows truncate on narrow screens', () => {
      const page = src('pages/TradesPage.tsx')
      expect(page).toContain('truncate')
      expect(page).toContain('grid-cols-1')
    })

    it('DisputesListPage meta grid stacks to two columns on mobile', () => {
      const page = src('pages/DisputesListPage.tsx')
      expect(page).toContain('grid-cols-2 md:grid-cols-3')
      expect(page).toContain('truncate')
    })
  })

  describe('detail page safety nets', () => {
    it('TradeDetailPage escrow address never overflows', () => {
      const page = src('pages/TradeDetailPage.tsx')
      expect(page).toContain('break-all')
    })

    it('DisputeDetailPage evidence rows wrap', () => {
      const page = src('pages/DisputeDetailPage.tsx')
      expect(page).toContain('flex-wrap')
      expect(page).toContain('truncate')
    })

    it('edit pages use single-column mobile form grids', () => {
      const create = src('pages/CreateOfferPage.tsx')
      const edit = src('pages/EditOfferPage.tsx')
      for (const p of [create, edit]) {
        expect(p).toContain('grid grid-cols-1 md:grid-cols-3')
        expect(p).toContain('grid grid-cols-1 md:grid-cols-2')
      }
    })
  })
})