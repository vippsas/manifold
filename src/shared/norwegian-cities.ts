export const NORWEGIAN_CITY_NAMES = [
  'Oslo',
  'Bergen',
  'Trondheim',
  'Stavanger',
  'Tromsø',
  'Kristiansand',
  'Drammen',
  'Fredrikstad',
  'Sarpsborg',
  'Skien',
  'Ålesund',
  'Sandnes',
  'Tønsberg',
  'Moss',
  'Bodø',
  'Arendal',
  'Hamar',
  'Larvik',
  'Halden',
  'Molde',
  'Lillestrøm',
  'Hønefoss',
  'Kongsberg',
  'Gjøvik',
  'Harstad',
  'Narvik',
  'Alta',
  'Hammerfest',
  'Sortland',
  'Svolvær',
  'Fauske',
  'Levanger',
  'Namsos',
  'Steinkjer',
  'Florø',
  'Førde',
  'Kristiansund',
  'Voss',
  'Jessheim',
  'Elverum',
  'Porsgrunn',
  'Sandefjord',
  'Kongsvinger',
  'Notodden',
  'Lillehammer',
  'Egersund',
  'Farsund',
  'Mandal',
  'Mo i Rana',
  'Stjørdal',
] as const

export function pickRandomNorwegianCityName(random: () => number = Math.random): string {
  const index = Math.floor(random() * NORWEGIAN_CITY_NAMES.length)
  return NORWEGIAN_CITY_NAMES[index] ?? NORWEGIAN_CITY_NAMES[0]
}

/**
 * A city name none of `taken` already uses.
 *
 * For naming a new place to work that must not read as a version of an old one:
 * a ` 2` suffix says "second draft of that thing", which is exactly what a new
 * workspace over the same folders is *not* — it shares no branch and no commits
 * with the workspace it was started from. A city says "somewhere else", the
 * vocabulary Manifold already uses for an unnamed unit of work.
 *
 * Falls back to numbering a city once every name is taken, which needs ~50 live
 * workspaces; the suffix is honest there, since the list has genuinely run out.
 */
export function pickUnusedNorwegianCityName(
  taken: Iterable<string>,
  random: () => number = Math.random,
): string {
  const used = new Set(Array.from(taken, (name) => name.toLowerCase()))
  const free = NORWEGIAN_CITY_NAMES.filter((city) => !used.has(city.toLowerCase()))
  if (free.length > 0) {
    return free[Math.floor(random() * free.length)] ?? free[0]
  }
  const base = pickRandomNorwegianCityName(random)
  let counter = 2
  while (used.has(`${base} ${counter}`.toLowerCase())) counter += 1
  return `${base} ${counter}`
}
