import { describe, expect, it } from 'vitest'

import { SemverIntConverter } from './converter.js'
import { prereleaseToInt } from './prereleaseUtils.js'
import { SemverIntConfig } from './types/config.js'

const mapping: SemverIntConfig['firstPrereleaseComponentToDigit'] = [
  'alpha',
  'beta',
  'rc',
  'delta',
  'epsilon',
  'zeta',
  'eta',
  'theta',
  'last',
]

const componentOverflow = { name: 'OverflowError', componentName: 'prereleaseNumericComponent' }
const precisionLoss = { name: 'PrecisionLossError', componentName: 'prerelease' }

describe('issue #10: process numeric identifier tails and diagnose insufficient total space', () => {
  it.each([
    [10, 'a.1', '102037300000100', []],
    [10, 'a.1.a', '102037300000173', []],
    [10, '0.1', '102030000000000', [precisionLoss]],
    [10, '0.2', '102030000000000', [precisionLoss]],
    [10, 'rc.1', '102039075000001', []],
    [10, 'rc.1.1', '102039075000001', [precisionLoss]],
    [16, 'rc.1', '102039075000001000000', []],
    [16, 'rc.1.1', '102039075000001000001', []],
    [16, 'rc.1.2', '102039075000001000002', []],
    [16, '1', '102030000010000000000', []],
    [16, '1.1', '102030000010000010000', []],
    [16, '1.2', '102030000010000020000', []],
  ])('%s prerelease digits: %s returns %s', (digits, prerelease, expected, errors) => {
    const converter = new SemverIntConverter({ numPrereleaseDigits: digits })
    const result = converter.semverToInt('1', '2', '3', prerelease)
    expect(result.versionStr).toBe(expected)
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual(errors)
  })
})

describe('prerelease identifier processing', () => {
  it.each([
    ['1.alpha', '0000017385', [componentOverflow, precisionLoss]],
    ['1.2.alpha', '0000010000', [precisionLoss]],
    ['a.1.b', '7300000174', []],
    ['a.b.1.z', '7374000001', [precisionLoss]],
    ['a.b.1.2', '7374000001', [precisionLoss]],
    ['a.b.c', '7374750000', []],
    ['1a.2.z', '3773000002', [precisionLoss]],
    ['0a', '3673000000', []],
  ])('encodes mixed identifiers in %s as %s', (prerelease, expected, errors) => {
    const result = prereleaseToInt(prerelease, 10, 6)
    expect(result.strNum).toBe(expected)
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual(errors)
  })

  it.each([
    [7, '737475980000', []],
    [6, '737475980000', []],
    [5, '737479999999', [componentOverflow, precisionLoss]],
  ])('component budget %s is one above, exactly at, or one below the six-digit abc encoding', (digits, expected, errors) => {
    const result = prereleaseToInt('abc.z', 12, digits)
    expect(result.strNum).toBe(expected)
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual(errors)
  })

  it.each([
    ['a.b.c', 5, '73748', [precisionLoss]],
    ['a.b.c', 6, '737475', []],
    ['a.b.c', 7, '7374750', []],
    ['abc.z', 5, '73748', [precisionLoss]],
    ['abc.z', 6, '737475', [precisionLoss]],
    ['abc.z', 7, '7374760', [precisionLoss]],
    ['abc.1.z', 6, '737475', [precisionLoss]],
  ])('total-budget handling for %s with %s digits, including unprocessed identifiers', (prerelease, digits, expected, errors) => {
    const result = prereleaseToInt(prerelease, digits, 6)
    expect(result.strNum).toBe(expected)
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual(errors)
  })

  it('reports component overflow before total precision loss', () => {
    const result = prereleaseToInt('abcd.z', 5, 6)
    expect(result.strNum).toBe('73748')
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual([componentOverflow, precisionLoss])
  })
})

describe('first prerelease identifier mapping', () => {
  it.each([
    ['alpha', '1000000000'],
    ['beta', '2000000000'],
    ['last', '9000000000'],
    ['unknown', '0000000000'],
    ['unknown.1', '0000001000'],
    ['alpha.1.z', '1000001980'],
    ['', '9999999999'],
  ])('maps %s to %s and processes following numeric and text identifiers', (prerelease, expected) => {
    expect(prereleaseToInt(prerelease, 10, 6, mapping)).toEqual({ strNum: expected, errs: [] })
  })

  it('uses the first matching duplicate mapping entry', () => {
    const duplicates: NonNullable<SemverIntConfig['firstPrereleaseComponentToDigit']> = [...mapping]
    duplicates[1] = 'alpha'
    expect(prereleaseToInt('alpha', 3, 6, duplicates)).toEqual({ strNum: '100', errs: [] })
  })

  it('maps a numeric first identifier before numeric processing', () => {
    const numericMapping: NonNullable<SemverIntConfig['firstPrereleaseComponentToDigit']> = [...mapping]
    numericMapping[1] = '1'
    expect(prereleaseToInt('1.2', 10, 6, numericMapping)).toEqual({ strNum: '2000002000', errs: [] })
    expect(prereleaseToInt('2.1', 10, 6, numericMapping)).toEqual({ strNum: '0000001000', errs: [] })
  })

  it('does not apply the component budget to a mapped first identifier', () => {
    expect(prereleaseToInt('alpha', 4, 1, mapping)).toEqual({ strNum: '1000', errs: [] })
  })

  it.each([
    [2, '17', [precisionLoss]],
    [3, '173', []],
    [4, '1730', []],
  ])('uses the mapped first digit in the total budget of %s', (digits, expected, errors) => {
    const result = prereleaseToInt('alpha.a', digits, 6, mapping)
    expect(result.strNum).toBe(expected)
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual(errors)
  })

  it('diagnoses remaining identifiers after a mapping exactly fills the budget', () => {
    const result = prereleaseToInt('alpha.a', 1, 6, mapping)
    expect(result.strNum).toBe('1')
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual([precisionLoss])
  })

  it('reserves the stable sentinel when the ninth mapping entry fills a one-digit budget', () => {
    const result = prereleaseToInt('last', 1, 6, mapping)
    expect(result.strNum).toBe('8')
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual([precisionLoss])
    expect(prereleaseToInt('', 1, 6, mapping)).toEqual({ strNum: '9', errs: [] })
    expect(prereleaseToInt('last', 2, 6, mapping)).toEqual({ strNum: '90', errs: [] })
    expect(prereleaseToInt('', 2, 6, mapping)).toEqual({ strNum: '99', errs: [] })
  })
})

describe('exact numeric prerelease limits', () => {
  it.each([
    [1, '1', '1000000000', []],
    [1, '2', '2000000000', []],
    [1, '3', '2999999999', [componentOverflow]],
    [2, '34', '3400000000', []],
    [2, '35', '3500000000', []],
    [2, '36', '3599999999', [componentOverflow]],
    [3, '35', '0350000000', []],
    [3, '36', '0359999999', [componentOverflow]],
    [4, '3634', '3634000000', []],
    [4, '3635', '3635000000', []],
    [4, '3636', '3635999999', [componentOverflow]],
    [6, '363634', '3636340000', []],
    [6, '363635', '3636350000', []],
    [6, '363636', '3636359999', [componentOverflow]],
  ])('encodes numeric %s-digit component %s as %s with clamp diagnostics', (digits, input, expected, errors) => {
    const result = prereleaseToInt(input, 10, digits)
    expect(result.strNum).toBe(expected)
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual(errors)
  })

  it('diagnoses numeric clamping even for strings too large for a finite Number', () => {
    const result = prereleaseToInt('9'.repeat(309), 10, 6)
    expect(result.strNum).toBe('3636359999')
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual([componentOverflow])
  })

  it.each([
    ['9007199254740992', '00900719925474099200'],
    ['9007199254740993', '00900719925474099300'],
  ])('preserves numeric identifier %s beyond the safe integer range', (input, expected) => {
    expect(prereleaseToInt(input, 20, 18)).toEqual({ strNum: expected, errs: [] })
  })

  it.each([
    ['999999999999999999999', '099999999999999999999900000000'],
    ['1000000000000000000000', '100000000000000000000000000000'],
    ['999999999999999900000', '099999999999999990000000000000'],
  ])('preserves decimal digits for numeric identifier %s around the Number exponent boundary', (input, expected) => {
    const result = prereleaseToInt(input, 30, 22)
    expect(result).toEqual({ strNum: expected, errs: [] })
    expect(result.strNum).toMatch(/^\d{30}$/)
  })

  it('returns a decimal public version string beyond the Number exponent boundary', () => {
    const converter = new SemverIntConverter({ numPrereleaseDigits: 30, numPrereleaseComponentDigits: 22 })
    expect(converter.semverToInt('1', '2', '3', '1000000000000000000000')).toEqual({
      versionStr: '10203100000000000000000000000000000',
      errs: [],
    })
  })

  it('compares and caps a numeric identifier beyond the Number exponent boundary exactly', () => {
    const converter = new SemverIntConverter({
      numPrereleaseDigits: 30,
      numPrereleaseComponentDigits: 22,
      maxSemverInt: 10203099999999999999999999999999999n,
    })
    const result = converter.semverToInt('1', '2', '3', '1000000000000000000000')
    expect(result.versionStr).toBe('10203099999999999999999999999999999')
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual([
      { name: 'OverflowError', componentName: 'semverint' },
    ])
  })

  it('computes the numeric ceiling exactly beyond the safe integer range', () => {
    const result = prereleaseToInt('99999999999999999999', 20, 20)
    expect(result.strNum).toBe('36363636363636363635')
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual([componentOverflow])
  })
})

// These collisions are implementation defects, not intended SemVer equivalences.
describe('current collisions without overflow diagnostics', () => {
  it.each([
    [['0', '0.0', '0.0.0'], '000000000000000000000000'],
    [['a', 'a.0', 'a.0.0'], '730000000000000000000000'],
    [['ab', 'a.b', 'ab.0', 'ab.0.0'], '737400000000000000000000'],
    [['abc', 'a.bc', 'ab.c', 'a.b.c'], '737475000000000000000000'],
  ])('currently aliases %j', (prereleases, expected) => {
    for (const prerelease of prereleases) {
      expect(prereleaseToInt(prerelease, 24, 6)).toEqual({ strNum: expected, errs: [] })
    }
  })

  it('currently aliases absent and trailing zero identifiers after mapping', () => {
    for (const prerelease of ['alpha', 'alpha.0', 'alpha.0.0']) {
      expect(prereleaseToInt(prerelease, 24, 6, mapping)).toEqual({ strNum: '100000000000000000000000', errs: [] })
    }
  })
})
