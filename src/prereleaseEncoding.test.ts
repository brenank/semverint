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

describe('issue #10 current behavior: the first numeric identifier discards the tail without errors', () => {
  it.each([
    [10, 'a.1', '102037300000100'],
    [10, 'a.1.a', '102037300000100'],
    [10, '0.1', '102030000000000'],
    [10, '0.2', '102030000000000'],
    [10, 'rc.1', '102039075000001'],
    [10, 'rc.1.1', '102039075000001'],
    [16, 'rc.1', '102039075000001000000'],
    [16, 'rc.1.1', '102039075000001000000'],
    [16, 'rc.1.2', '102039075000001000000'],
    [16, '1', '102030000010000000000'],
    [16, '1.1', '102030000010000000000'],
    [16, '1.2', '102030000010000000000'],
  ])('%s prerelease digits: %s currently returns %s', (digits, prerelease, expected) => {
    const converter = new SemverIntConverter({ numPrereleaseDigits: digits })
    expect(converter.semverToInt('1', '2', '3', prerelease)).toEqual({ versionStr: expected, errs: [] })
  })
})

describe('current prerelease identifier processing', () => {
  it.each([
    ['1.alpha', '0000010000'],
    ['1.2.alpha', '0000010000'],
    ['a.1.b', '7300000100'],
    ['a.b.1.z', '7374000001'],
    ['a.b.1.2', '7374000001'],
    ['a.b.c', '7374750000'],
    ['1a.2.z', '3773000002'],
    ['0a', '3673000000'],
  ])('currently encodes %s as %s, stopping after a numeric identifier', (prerelease, expected) => {
    expect(prereleaseToInt(prerelease, 10, 6)).toEqual({ strNum: expected, errs: [] })
  })

  it.each([
    [7, '737475980000', []],
    [6, '737475980000', []],
    [5, '737479999999', [componentOverflow]],
  ])('component budget %s is one above, exactly at, or one below the six-digit abc encoding', (digits, expected, errors) => {
    const result = prereleaseToInt('abc.z', 12, digits)
    expect(result.strNum).toBe(expected)
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual(errors)
  })

  it.each([
    ['a.b.c', 5, '73747', [precisionLoss]],
    ['a.b.c', 6, '737475', []],
    ['a.b.c', 7, '7374750', []],
    ['abc.z', 5, '73747', [precisionLoss]],
    ['abc.z', 6, '737475', []],
    ['abc.z', 7, '7374760', [precisionLoss]],
    ['abc.1.z', 6, '737475', []],
  ])(
    'current total-budget behavior for %s with %s digits, including unprocessed identifiers',
    (prerelease, digits, expected, errors) => {
      const result = prereleaseToInt(prerelease, digits, 6)
      expect(result.strNum).toBe(expected)
      expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual(errors)
    },
  )

  it('currently reports component overflow before total precision loss', () => {
    const result = prereleaseToInt('abcd.z', 5, 6)
    expect(result.strNum).toBe('73747')
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
    ['alpha.1.z', '1000001000'],
    ['', '9999999999'],
  ])('currently maps %s to %s and ignores a tail after a numeric identifier', (prerelease, expected) => {
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

  it('currently processes an extra identifier after a mapping exactly fills the budget', () => {
    const result = prereleaseToInt('alpha.a', 1, 6, mapping)
    expect(result.strNum).toBe('2')
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual([precisionLoss])
  })

  it('currently collides the ninth mapping entry with stable releases at a one-digit budget', () => {
    expect(prereleaseToInt('last', 1, 6, mapping)).toEqual({ strNum: '9', errs: [] })
    expect(prereleaseToInt('', 1, 6, mapping)).toEqual({ strNum: '9', errs: [] })
    expect(prereleaseToInt('last', 2, 6, mapping)).toEqual({ strNum: '90', errs: [] })
    expect(prereleaseToInt('', 2, 6, mapping)).toEqual({ strNum: '99', errs: [] })
  })
})

describe('current silent numeric clamping and Number precision loss', () => {
  it.each([
    [1, '1', '1000000000'],
    [1, '2', '2000000000'],
    [1, '3', '2000000000'],
    [2, '34', '3400000000'],
    [2, '35', '3500000000'],
    [2, '36', '3500000000'],
    [3, '35', '0350000000'],
    [3, '36', '0350000000'],
    [4, '3634', '3634000000'],
    [4, '3635', '3635000000'],
    [4, '3636', '3635000000'],
    [6, '363634', '3636340000'],
    [6, '363635', '3636350000'],
    [6, '363636', '3636350000'],
  ])('currently encodes numeric %s-digit component %s as %s without errors', (digits, input, expected) => {
    expect(prereleaseToInt(input, 10, digits)).toEqual({ strNum: expected, errs: [] })
  })

  it('currently clamps even numeric strings too large for a finite Number without errors', () => {
    expect(prereleaseToInt('9'.repeat(309), 10, 6)).toEqual({ strNum: '3636350000', errs: [] })
  })

  it.each(['9007199254740992', '9007199254740993'])(
    'currently aliases %s through Number even though the component budget is sufficient',
    input => {
      expect(prereleaseToInt(input, 20, 18)).toEqual({ strNum: '00900719925474099200', errs: [] })
    },
  )

  it.each(['999999999999999999999', '1000000000000000000000'])(
    'currently emits exponent notation without errors for numeric identifier %s near the Number formatting boundary',
    input => {
      expect(prereleaseToInt(input, 30, 22)).toEqual({ strNum: '000000000000000001e+2100000000', errs: [] })
    },
  )

  it('currently emits decimal digits for a representable Number just below the exponent formatting boundary', () => {
    expect(prereleaseToInt('999999999999999900000', 30, 22)).toEqual({
      strNum: '099999999999999990000000000000',
      errs: [],
    })
  })

  it('currently returns a nondecimal public version string without errors at the exponent formatting boundary', () => {
    const converter = new SemverIntConverter({ numPrereleaseDigits: 30, numPrereleaseComponentDigits: 22 })
    expect(converter.semverToInt('1', '2', '3', '1000000000000000000000')).toEqual({
      versionStr: '10203000000000000000001e+2100000000',
      errs: [],
    })
  })

  it('currently throws when maxSemverInt parses the exponent notation produced by a numeric identifier', () => {
    const converter = new SemverIntConverter({
      numPrereleaseDigits: 30,
      numPrereleaseComponentDigits: 22,
      maxSemverInt: 10n ** 40n,
    })
    expect(() => converter.semverToInt('1', '2', '3', '1000000000000000000000')).toThrow(SyntaxError)
  })

  it('currently loses precision when computing a numeric ceiling wider than the safe integer range', () => {
    expect(prereleaseToInt('99999999999999999999', 20, 20)).toEqual({
      strNum: '36363636363636363000',
      errs: [],
    })
  })
})

// These collisions are implementation defects, not intended SemVer equivalences.
describe('current collisions without overflow diagnostics', () => {
  it.each([
    [['0', '0.0', '0.1'], '0000000000'],
    [['a', 'a.0', 'a.0.0'], '7300000000'],
    [['ab', 'a.b', 'ab.0', 'ab.0.0'], '7374000000'],
    [['abc', 'a.bc', 'ab.c', 'a.b.c'], '7374750000'],
  ])('currently aliases %j', (prereleases, expected) => {
    for (const prerelease of prereleases) {
      expect(prereleaseToInt(prerelease, 10, 6)).toEqual({ strNum: expected, errs: [] })
    }
  })

  it('currently aliases absent and trailing zero identifiers after mapping', () => {
    for (const prerelease of ['alpha', 'alpha.0', 'alpha.0.0', 'alpha.0.1']) {
      expect(prereleaseToInt(prerelease, 10, 6, mapping)).toEqual({ strNum: '1000000000', errs: [] })
    }
  })
})
