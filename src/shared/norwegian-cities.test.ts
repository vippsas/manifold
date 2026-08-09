import { describe, expect, it } from 'vitest'
import {
  NORWEGIAN_CITY_NAMES,
  pickRandomNorwegianCityName,
  pickUnusedNorwegianCityName,
} from './norwegian-cities'

describe('NORWEGIAN_CITY_NAMES', () => {
  it('contains about 50 city names', () => {
    expect(NORWEGIAN_CITY_NAMES).toHaveLength(50)
  })

  it('uses unique names', () => {
    expect(new Set(NORWEGIAN_CITY_NAMES).size).toBe(NORWEGIAN_CITY_NAMES.length)
  })
})

describe('pickRandomNorwegianCityName', () => {
  it('returns the first city for a zero random value', () => {
    expect(pickRandomNorwegianCityName(() => 0)).toBe('Oslo')
  })

  it('returns the last city for a high random value', () => {
    expect(pickRandomNorwegianCityName(() => 0.999999)).toBe('Stjørdal')
  })
})

describe('pickUnusedNorwegianCityName', () => {
  it('skips the names already in use', () => {
    expect(pickUnusedNorwegianCityName(['Oslo'], () => 0)).toBe('Bergen')
  })

  it('ignores the case a name is stored in', () => {
    expect(pickUnusedNorwegianCityName(['oslo', 'BERGEN'], () => 0)).toBe('Trondheim')
  })

  it('picks freely when nothing is taken', () => {
    expect(pickUnusedNorwegianCityName([], () => 0)).toBe('Oslo')
  })

  // ~50 live workspaces. The suffix is honest here: the list really has run out.
  it('numbers a city once every name is taken', () => {
    const name = pickUnusedNorwegianCityName(NORWEGIAN_CITY_NAMES, () => 0)
    expect(name).toBe('Oslo 2')
  })

  it('keeps counting past a numbered name that is also taken', () => {
    const name = pickUnusedNorwegianCityName([...NORWEGIAN_CITY_NAMES, 'Oslo 2'], () => 0)
    expect(name).toBe('Oslo 3')
  })
})
