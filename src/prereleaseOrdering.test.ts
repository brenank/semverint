import { describe, expect, it } from 'vitest'

import { SemverIntConverter } from './converter.js'
import { convertVersion } from './test/convertVersion.js'

const orderingCases = [
  {
    name: 'additional prerelease identifiers increase precedence before the stable release',
    config: { numPrereleaseDigits: 32, numPrereleaseComponentDigits: 12 },
    versions: ['1.2.3-alpha', '1.2.3-alpha.1', '1.2.3'],
  },
  {
    name: 'numeric prerelease identifiers compare by magnitude',
    config: { numPrereleaseDigits: 24, numPrereleaseComponentDigits: 8 },
    versions: ['1.2.3-rc.2', '1.2.3-rc.10', '1.2.3-rc.100'],
  },
  {
    name: 'numeric prerelease identifiers precede text identifiers',
    config: { numPrereleaseDigits: 24, numPrereleaseComponentDigits: 8 },
    versions: ['1.2.3-100', '1.2.3-0a', '1.2.3-a'],
  },
  {
    name: 'text prerelease identifiers compare by ASCII case',
    config: { numPrereleaseDigits: 24, numPrereleaseComponentDigits: 8 },
    versions: ['1.2.3-A', '1.2.3-Z', '1.2.3-a', '1.2.3-z'],
  },
  {
    name: 'a text prerelease identifier precedes a longer identifier with the same prefix',
    config: { numPrereleaseDigits: 24, numPrereleaseComponentDigits: 8 },
    versions: ['1.2.3-a', '1.2.3-aa', '1.2.3-ab', '1.2.3-b'],
  },
  {
    name: 'core versions compare by major, then minor, then patch',
    config: {},
    versions: ['1.2.3', '1.2.4', '1.3.0', '2.0.0', '10.0.0'],
  },
]

describe('SemVer precedence within digit budgets', () => {
  for (const { name, config, versions } of orderingCases) {
    it(name, () => {
      const converter = new SemverIntConverter(config)
      const configDescription = JSON.stringify(config)
      const results = versions.map(version => {
        const result = convertVersion(converter, version)
        expect(result.errs, `${version} encodes as ${result.versionStr} with config ${configDescription}`).toEqual([])
        return { version, integer: result.versionStr }
      })

      for (let i = 1; i < results.length; i++) {
        const earlier = results[i - 1]
        const later = results[i]
        expect(
          BigInt(earlier.integer),
          `${earlier.version} (${earlier.integer}) should precede ${later.version} (${later.integer}) with config ${configDescription}`,
        ).toBeLessThan(BigInt(later.integer))
      }
    })
  }

  it('distinguishes adjacent prerelease values beyond safe Number precision', () => {
    const converter = new SemverIntConverter({})
    const lower = convertVersion(converter, '99.0.0-rc.0')
    const higher = convertVersion(converter, '99.0.0-rc.1')
    expect(lower).toEqual({ versionStr: '9900009075000000', errs: [] })
    expect(higher).toEqual({ versionStr: '9900009075000001', errs: [] })
    expect(BigInt(lower.versionStr)).toBeLessThan(BigInt(higher.versionStr))
  })
})

describe('current ordering inversions without overflow diagnostics', () => {
  const config = { numPrereleaseDigits: 10, numPrereleaseComponentDigits: 6 }

  it('currently places a.z above aa even though a has lower precedence than aa', () => {
    const converter = new SemverIntConverter(config)
    const lower = convertVersion(converter, '1.2.3-a.z')
    const higher = convertVersion(converter, '1.2.3-aa')
    expect(lower).toEqual({ versionStr: '102037398000000', errs: [] })
    expect(higher).toEqual({ versionStr: '102037373000000', errs: [] })
    expect(BigInt(lower.versionStr)).toBeGreaterThan(BigInt(higher.versionStr))
  })

  it('currently places - above 0a despite the lower ASCII value of the hyphen', () => {
    const converter = new SemverIntConverter(config)
    const lower = convertVersion(converter, '1.2.3--')
    const higher = convertVersion(converter, '1.2.3-0a')
    expect(lower).toEqual({ versionStr: '102034600000000', errs: [] })
    expect(higher).toEqual({ versionStr: '102033673000000', errs: [] })
    expect(BigInt(lower.versionStr)).toBeGreaterThan(BigInt(higher.versionStr))
  })
})
