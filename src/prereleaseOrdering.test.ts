import { describe, expect, it } from 'vitest'

import { SemverIntConverter } from './converter.js'
import { prereleaseToInt } from './prereleaseUtils.js'

describe('ordering within budgets, compared as exact integers', () => {
  it('distinguishes adjacent prerelease values beyond safe Number precision', () => {
    const converter = new SemverIntConverter({})
    const lower = converter.semverToInt('99', '0', '0', 'rc.0')
    const higher = converter.semverToInt('99', '0', '0', 'rc.1')
    expect(lower).toEqual({ versionStr: '9900009075000000', errs: [] })
    expect(higher).toEqual({ versionStr: '9900009075000001', errs: [] })
    expect(BigInt(lower.versionStr)).toBeLessThan(BigInt(higher.versionStr))
  })

  it('preserves numeric magnitude, numeric-before-text, ASCII case, and text prefix order for these non-overflowing identifiers', () => {
    const cases = [
      ['0', '0000000000000000'],
      ['1', '0000010000000000'],
      ['2', '0000020000000000'],
      ['9', '0000090000000000'],
      ['10', '0000100000000000'],
      ['35', '0000350000000000'],
      ['100', '0001000000000000'],
      ['363635', '3636350000000000'],
      ['-', '4600000000000000'],
      ['A', '4700000000000000'],
      ['Z', '7200000000000000'],
      ['a', '7300000000000000'],
      ['a0', '7336000000000000'],
      ['aa', '7373000000000000'],
      ['ab', '7374000000000000'],
      ['b', '7400000000000000'],
      ['z', '9800000000000000'],
      ['', '9999999999999999'],
    ]
    let previous = -1n
    for (const [prerelease, expected] of cases) {
      const result = prereleaseToInt(prerelease, 16, 6)
      expect(result).toEqual({ strNum: expected, errs: [] })
      const value = BigInt(result.strNum)
      expect(value).toBeGreaterThan(previous)
      previous = value
    }
  })

  it('preserves stable release, patch, minor, and major carry hierarchy without overflow', () => {
    const converter = new SemverIntConverter({ numPrereleaseDigits: 16 })
    const cases = [
      { version: ['0', '99', '99', ''], expected: '099999999999999999999' },
      { version: ['1', '0', '0', '0'], expected: '100000000000000000000' },
      { version: ['1', '0', '0', 'a'], expected: '100007300000000000000' },
      { version: ['1', '0', '0', ''], expected: '100009999999999999999' },
      { version: ['1', '0', '1', '0'], expected: '100010000000000000000' },
      { version: ['1', '1', '0', '0'], expected: '101000000000000000000' },
      { version: ['2', '0', '0', '0'], expected: '200000000000000000000' },
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

describe('current ordering inversions without overflow diagnostics', () => {
  it('currently places a.z above aa even though its first identifier a has lower SemVer precedence', () => {
    const lower = prereleaseToInt('a.z', 10, 6)
    const higher = prereleaseToInt('aa', 10, 6)
    expect(lower).toEqual({ strNum: '7398000000', errs: [] })
    expect(higher).toEqual({ strNum: '7373000000', errs: [] })
    expect(BigInt(lower.strNum)).toBeGreaterThan(BigInt(higher.strNum))
  })

  it('currently places - above 0a despite the lower ASCII value of the hyphen', () => {
    const lower = prereleaseToInt('-', 10, 6)
    const higher = prereleaseToInt('0a', 10, 6)
    expect(lower).toEqual({ strNum: '4600000000', errs: [] })
    expect(higher).toEqual({ strNum: '3673000000', errs: [] })
    expect(BigInt(lower.strNum)).toBeGreaterThan(BigInt(higher.strNum))
  })
})
