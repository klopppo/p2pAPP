/**
 * Single source of truth for offer locations / regions. `available_regions`
 * stores ISO 3166-1 alpha-2 codes (empty = Global); `tags` carries the picker
 * label so labels, codes and rendered names never drift.
 */

export const LOCATIONS = [
  'Global',
  'United States',
  'European Union',
  'United Kingdom',
  'Brazil',
  'Turkey',
  'Argentina',
  'India',
  'Nigeria',
  'Canada',
  'Australia',
  'Mexico',
  'Colombia',
  'Switzerland',
  'Japan',
  'Philippines',
  'Vietnam',
  'United Arab Emirates',
  'Italy',
  'Germany',
  'France',
  'Spain',
]

const REGION_CODES: Record<string, string> = {
  'United States': 'US',
  'European Union': 'EU',
  'United Kingdom': 'GB',
  'Brazil': 'BR',
  'Turkey': 'TR',
  'Argentina': 'AR',
  'India': 'IN',
  'Nigeria': 'NG',
  'Canada': 'CA',
  'Australia': 'AU',
  'Mexico': 'MX',
  'Colombia': 'CO',
  'Switzerland': 'CH',
  'Japan': 'JP',
  'Philippines': 'PH',
  'Vietnam': 'VN',
  'United Arab Emirates': 'AE',
  'Italy': 'IT',
  'Germany': 'DE',
  'France': 'FR',
  'Spain': 'ES',
}

export const REGION_NAMES: Record<string, string> = Object.fromEntries(
  Object.entries(REGION_CODES).map(([name, code]) => [code, name]),
)

/** Picker label → `available_regions` array as persisted on an offer. */
export function locationToRegions(location: string): string[] {
  if (!location || location === 'Global') return []
  return [REGION_CODES[location] ?? location.slice(0, 2).toUpperCase()]
}

/** Region code → picker label ("Global" when unset, fallback to the code). */
export function regionToLocation(code: string | undefined): string {
  if (!code) return 'Global'
  return REGION_NAMES[code] ?? code
}

/**
 * True when an offer (persisted regions + tags) matches a market filter
 * selection ('all' or a picker label). "Global" matches offers with no region.
 */
export function offerMatchesLocation(
  regions: string[] | null | undefined,
  tags: string[] | null | undefined,
  selection: string,
): boolean {
  if (selection === 'all') return true
  const regs = regions ?? []
  if (selection === 'Global') return regs.length === 0 || regs.includes('Global')
  const code = REGION_CODES[selection]
  return (code !== undefined && regs.includes(code)) || (tags ?? []).includes(selection)
}
