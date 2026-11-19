import semver from 'semver'
import { describe, expect, it } from 'vitest'

import { SemverIntConverter } from './converter.js'
import { prereleaseToInt } from './prereleaseUtils.js'

describe('ordering within budgets, compared as exact integers', () => {
  it('distinguishes adjacent prerelease values beyond safe Number precision', () => {
    const converter = new SemverIntConverter({})
    const lower = converter.semverToInt('99', '0', '0', 'rc.0')
    const higher = converter.semverToInt('99', '0', '0', 'rc.1')
    expect(lower).toEqual({ versionStr: '9900002554000110', errs: [] })
    expect(higher).toEqual({ versionStr: '9900002554000111', errs: [] })
    expect(BigInt(lower.versionStr)).toBeLessThan(BigInt(higher.versionStr))
  })

  it('preserves numeric magnitude, numeric-before-text, ASCII case, and text prefix order for these non-overflowing identifiers', () => {
    const cases = [
      ['0', '110'],
      ['1', '111'],
      ['2', '112'],
      ['9', '119'],
      ['10', '1210'],
      ['35', '1235'],
      ['100', '13100'],
      ['999999', '16999999'],
      ['-', '20100'],
      ['0a', '2023800'],
      ['A', '21200'],
      ['Z', '23700'],
      ['a', '23800'],
      ['a0', '2380200'],
      ['aa', '2383800'],
      ['ab', '2383900'],
      ['b', '23900'],
      ['z', '26300'],
      ['', '9999999999999999'],
    ]
    let previous = -1n
    for (const [prerelease, expected] of cases) {
      const result = prereleaseToInt(prerelease, 16, 6)
      expect(result).toEqual({ strNum: expected.padEnd(16, '0'), errs: [] })
      const value = BigInt(result.strNum)
      expect(value).toBeGreaterThan(previous)
      previous = value
    }
  })

  it('preserves stable release, patch, minor, and major carry hierarchy without overflow', () => {
    const converter = new SemverIntConverter({ numPrereleaseDigits: 16 })
    const cases = [
      { version: ['0', '99', '99', ''], expected: '099999999999999999999' },
      { version: ['1', '0', '0', '0'], expected: '100001100000000000000' },
      { version: ['1', '0', '0', 'a'], expected: '100002380000000000000' },
      { version: ['1', '0', '0', ''], expected: '100009999999999999999' },
      { version: ['1', '0', '1', '0'], expected: '100011100000000000000' },
      { version: ['1', '1', '0', '0'], expected: '101001100000000000000' },
      { version: ['2', '0', '0', '0'], expected: '200001100000000000000' },
    ]
    let previous = -1n
    for (const { version, expected } of cases) {
      const result = converter.semverToInt(version[0], version[1], version[2], version[3])
      expect(result).toEqual({ versionStr: expected, errs: [] })
      const value = BigInt(result.versionStr)
      expect(value).toBeGreaterThan(previous)
      previous = value
    }
  })
})

it('sorts a.z below aa because the first identifier establishes precedence', () => {
  const lower = prereleaseToInt('a.z', 10, 6)
  const higher = prereleaseToInt('aa', 10, 6)
  expect(lower).toEqual({ strNum: '2380026300', errs: [] })
  expect(higher).toEqual({ strNum: '2383800000', errs: [] })
  expect(BigInt(lower.strNum)).toBeLessThan(BigInt(higher.strNum))
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

  const converter = new SemverIntConverter({ numPrereleaseComponentDigits: 8, numPrereleaseDigits: 64 })
  let previous = -1n
  for (const version of versions.sort(semver.compare)) {
    const prerelease = version.slice('1.2.3-'.length)
    const result = converter.semverToInt('1', '2', '3', prerelease)
    const value = BigInt(result.versionStr)
    expect(result.errs, version).toEqual([])
    expect(value, version).toBeGreaterThan(previous)
    previous = value
  }
})
