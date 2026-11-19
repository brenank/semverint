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
    [10, 'a.1', '2380011100', []],
    [10, 'a.1.a', '2380011124', [precisionLoss]],
    [10, '0.1', '1101110000', []],
    [10, '0.2', '1101120000', []],
    [10, 'rc.1', '2554000111', []],
    [10, 'rc.1.1', '2554000111', [precisionLoss]],
    [16, 'rc.1', '2554000111000000', []],
    [16, 'rc.1.1', '2554000111111000', []],
    [16, 'rc.1.2', '2554000111112000', []],
    [16, '1', '1110000000000000', []],
    [16, '1.1', '1111110000000000', []],
    [16, '1.2', '1111120000000000', []],
  ])('%s prerelease digits: %s encodes its prerelease as %s', (digits, prerelease, expected, errors) => {
    const converter = new SemverIntConverter({ numPrereleaseDigits: digits })
    const result = converter.semverToInt('1', '2', '3', prerelease)
    expect(result.versionStr).toBe(`10203${expected}`)
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual(errors)
  })
})

describe('prerelease identifier processing', () => {
  it.each([
    ['1e2', '203420400'],
    ['0x10', '20261030200'],
    ['01a', '202033800'],
    ['00-', '202020100'],
  ])('encodes numeric-looking identifier %s as text', (prerelease, expected) => {
    const converter = new SemverIntConverter({ numPrereleaseDigits: 20, numPrereleaseComponentDigits: 16 })
    expect(converter.semverToInt('1', '2', '3', prerelease)).toEqual({
      versionStr: `10203${expected.padEnd(20, '0')}`,
      errs: [],
    })
  })

  it.each([
    ['1.alpha', '1112384953', [componentOverflow]],
    ['1.alpha.z', '1112384953', [componentOverflow, precisionLoss]],
    ['1.2.alpha', '1111122385', [componentOverflow, precisionLoss]],
    ['a.1.b', '2380011124', [precisionLoss]],
    ['a.b.c', '2380023900', [precisionLoss]],
    ['1a.2.z', '2033800112', [precisionLoss]],
    ['0a', '2023800000', []],
  ])('encodes mixed identifiers in %s as %s', (prerelease, expected, errors) => {
    const result = prereleaseToInt(prerelease, 10, 6)
    expect(result.strNum).toBe(expected)
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual(errors)
  })

  it.each([
    [7, '23839400026300', []],
    [6, '23839400026300', []],
    [5, '23839499999999', [componentOverflow, precisionLoss]],
  ])('fits or clamps the six-digit abc payload within a component budget of %s digits', (digits, expected, errors) => {
    const result = prereleaseToInt('abc.z', 14, digits)
    expect(result.strNum).toBe(expected)
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual(errors)
  })

  it.each([
    ['a.b.c', 14, '23800239002400', [precisionLoss]],
    ['a.b.c', 15, '238002390024000', []],
    ['a.b.c', 16, '2380023900240000', []],
    ['abc.z', 8, '23839400', [precisionLoss]],
    ['abc.z', 9, '238394000', [precisionLoss]],
    ['abc.z', 10, '2383940003', [precisionLoss]],
    ['abc.1.z', 9, '238394000', [precisionLoss]],
  ])('total-budget handling for %s with %s digits, including unprocessed identifiers', (prerelease, digits, expected, errors) => {
    const result = prereleaseToInt(prerelease, digits, 6)
    expect(result.strNum).toBe(expected)
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual(errors)
  })

  it('reports component overflow before total precision loss', () => {
    const result = prereleaseToInt('abcd.z', 5, 6)
    expect(result.strNum).toBe('23839')
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual([componentOverflow, precisionLoss])
  })
})

describe('first prerelease identifier mapping', () => {
  it.each([
    ['alpha', '1000000000'],
    ['beta', '2000000000'],
    ['last', '9000000000'],
    ['unknown', '0000000000'],
    ['unknown.1', '0111000000'],
    ['alpha.1.z', '1111263000'],
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
    expect(prereleaseToInt('1.2', 10, 6, numericMapping)).toEqual({ strNum: '2112000000', errs: [] })
    expect(prereleaseToInt('2.1', 10, 6, numericMapping)).toEqual({ strNum: '0111000000', errs: [] })
  })

  it('does not apply the component budget to a mapped first identifier', () => {
    expect(prereleaseToInt('alpha', 4, 1, mapping)).toEqual({ strNum: '1000', errs: [] })
  })

  it.each([
    [3, '124', [precisionLoss]],
    [5, '12380', [precisionLoss]],
    [6, '123800', []],
    [7, '1238000', []],
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

  it('reserves the stable release value when the ninth mapping entry fills a one-digit budget', () => {
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
    [0, '0', '1099999999', [componentOverflow]],
    [1, '9', '1190000000', []],
    [1, '10', '1199999999', [componentOverflow]],
    [2, '99', '1299000000', []],
    [2, '100', '1299999999', [componentOverflow]],
    [6, '999999', '1699999900', []],
    [6, '1000000', '1699999999', [componentOverflow]],
  ])('encodes numeric %s-digit component %s as %s with clamp diagnostics', (digits, input, expected, errors) => {
    const result = prereleaseToInt(input, 10, digits)
    expect(result.strNum).toBe(expected)
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual(errors)
  })

  it('diagnoses numeric clamping even for strings too large for a finite Number', () => {
    const result = prereleaseToInt('9'.repeat(309), 10, 6)
    expect(result.strNum).toBe('1699999999')
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual([componentOverflow])
  })

  it.each([
    [9, '123456789', '1912345678900000'],
    [10, '123456789', '1091234567890000'],
    [10, '1234567890', '1101234567890000'],
  ])('frames numeric identifier %s-width %s with the configured length prefix', (digits, input, expected) => {
    expect(prereleaseToInt(input, 16, digits)).toEqual({ strNum: expected, errs: [] })
  })

  it.each([
    ['9007199254740992', '11690071992547409920'],
    ['9007199254740993', '11690071992547409930'],
  ])('preserves numeric identifier %s beyond the safe integer range', (input, expected) => {
    expect(prereleaseToInt(input, 20, 18)).toEqual({ strNum: expected, errs: [] })
  })

  it.each([
    ['999999999999999999999', '121999999999999999999999'],
    ['1000000000000000000000', '1221000000000000000000000'],
    ['999999999999999900000', '121999999999999999900000'],
  ])('preserves decimal digits for numeric identifier %s around the Number exponent boundary', (input, expected) => {
    expect(prereleaseToInt(input, 30, 22)).toEqual({ strNum: expected.padEnd(30, '0'), errs: [] })
  })

  it('returns a decimal public version string beyond the Number exponent boundary', () => {
    const converter = new SemverIntConverter({ numPrereleaseDigits: 30, numPrereleaseComponentDigits: 22 })
    expect(converter.semverToInt('1', '2', '3', '1000000000000000000000')).toEqual({
      versionStr: '10203122100000000000000000000000000',
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
    const result = prereleaseToInt('9'.repeat(21), 24, 20)
    expect(result.strNum).toBe(`120${'9'.repeat(21)}`)
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual([componentOverflow])
  })
})

describe('distinct prerelease boundaries', () => {
  it.each([
    ['0', '110'],
    ['0.0', '110110'],
    ['0.0.0', '110110110'],
    ['a', '23800'],
    ['a.0', '23800110'],
    ['a.0.0', '23800110110'],
    ['a.b.c', '238002390024000'],
    ['a.bc', '238002394000'],
    ['ab.c', '238390024000'],
    ['abc', '238394000'],
  ])('encodes the identifier boundaries of %s independently of padding', (prerelease, expected) => {
    expect(prereleaseToInt(prerelease, 24, 6)).toEqual({ strNum: expected.padEnd(24, '0'), errs: [] })
  })

  it.each([
    ['alpha', '1000000000'],
    ['alpha.0', '1110000000'],
    ['alpha.0.0', '1110110000'],
  ])('distinguishes %s after mapping from versions with different trailing zero identifiers', (prerelease, expected) => {
    expect(prereleaseToInt(prerelease, 10, 6, mapping)).toEqual({ strNum: expected, errs: [] })
  })
})
