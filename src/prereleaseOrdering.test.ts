import semver from 'semver'
import { describe, expect, it } from 'vitest'

import { SemverIntConverter } from './converter.js'
import { convertVersion } from './test/convertVersion.js'
import type { SemverIntConfig } from './types/config.js'

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
    versions: ['1.2.3-a', '1.2.3-a0', '1.2.3-aa', '1.2.3-ab', '1.2.3-b'],
  },
  {
    name: 'the first text identifier decides precedence before later identifiers',
    config: { numPrereleaseDigits: 10, numPrereleaseComponentDigits: 6 },
    versions: ['1.2.3-a.z', '1.2.3-aa'],
  },
  {
    name: 'a hyphen sorts before digits in text prerelease identifiers',
    config: { numPrereleaseDigits: 10, numPrereleaseComponentDigits: 6 },
    versions: ['1.2.3--', '1.2.3-0a'],
  },
  {
    name: 'core versions compare by major, then minor, then patch',
    config: {},
    versions: ['1.2.3', '1.2.4', '1.3.0', '2.0.0', '10.0.0'],
  },
  {
    name: 'stable and prerelease versions preserve precedence across core carries',
    config: { numPrereleaseDigits: 16 },
    versions: ['0.99.99', '1.0.0-0', '1.0.0-a', '1.0.0', '1.0.1-0', '1.1.0-0', '2.0.0-0'],
  },
]

function expectVersionsInOrder(config: Partial<SemverIntConfig>, versions: string[]) {
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
}

describe('SemVer precedence within digit budgets', () => {
  for (const { name, config, versions } of orderingCases) {
    it(name, () => {
      expectVersionsInOrder(config, versions)
    })
  }

  it('distinguishes adjacent prerelease values beyond safe Number precision', () => {
    const converter = new SemverIntConverter({})
    const zeroVersion = '99.0.0-rc.0'
    const earlierVersion = '99.0.0-rc.1'
    const laterVersion = '99.0.0-rc.2'
    const zero = convertVersion(converter, zeroVersion)
    const earlier = convertVersion(converter, earlierVersion)
    const later = convertVersion(converter, laterVersion)
    expect(zero, zeroVersion).toEqual({ versionStr: '9900002554000110', errs: [] })
    expect(earlier, earlierVersion).toEqual({ versionStr: '9900002554000111', errs: [] })
    expect(later, laterVersion).toEqual({ versionStr: '9900002554000112', errs: [] })
    expect(
      BigInt(zero.versionStr),
      `${zeroVersion} (${zero.versionStr}) should precede ${earlierVersion} (${earlier.versionStr}) with config {}`,
    ).toBeLessThan(BigInt(earlier.versionStr))
    // Keep the pair sensitive to accidentally comparing as Numbers.
    expect(Number(earlier.versionStr)).toBe(Number(later.versionStr))
    expect(
      BigInt(earlier.versionStr),
      `${earlierVersion} (${earlier.versionStr}) should precede ${laterVersion} (${later.versionStr}) with config {}`,
    ).toBeLessThan(BigInt(later.versionStr))
  })
})

it('matches SemVer order for mixed identifier sequences within both budgets', () => {
  const identifiers = ['0', '2', '9', '10', '100', '-', '0a', 'A', 'a', 'aa']
  const versions = ['1.2.3']
  for (const first of identifiers) {
    versions.push(`1.2.3-${first}`)
    for (const second of identifiers) {
      versions.push(`1.2.3-${first}.${second}`)
      versions.push(`1.2.3-${first}.${second}.0`, `1.2.3-${first}.${second}.z`)
    }
  }

  const config = { numPrereleaseComponentDigits: 8, numPrereleaseDigits: 64 }
  expectVersionsInOrder(config, versions.sort(semver.compare))
})
