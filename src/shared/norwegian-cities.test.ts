import { describe, expect, it } from 'vitest'
import { NORWEGIAN_CITY_NAMES, pickRandomNorwegianCityName } from './norwegian-cities'

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
