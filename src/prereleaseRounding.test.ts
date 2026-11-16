import { describe, expect, it } from 'vitest'

import { SemverIntConverter } from './converter.js'
import { fmtFixedSizePrerelease, prereleaseToInt } from './prereleaseUtils.js'

describe('prerelease decimal formatting', () => {
  it.each([
    ['0', 2, '00', false],
    ['0000', 4, '0000', false],
    ['0000', 6, '000000', false],
    ['00123', 5, '00123', false],
    ['00123', 7, '0012300', false],
    ['00012345', 4, '0001', true],
    ['00009995', 4, '0001', true],
    ['0014', 3, '001', true],
    ['0015', 3, '002', true],
    ['0016', 3, '002', true],
    ['12344', 4, '1234', true],
    ['12345', 4, '1235', true],
    ['12346', 4, '1235', true],
    ['99994', 4, '9999', true],
  ])('formats %s to %s digits with leading zeros, padding, and half-threshold rounding', (input, digits, expected, loss) => {
    expect(fmtFixedSizePrerelease(input, digits)).toEqual({ strNum: expected, hasPrecisionLoss: loss })
  })

  it.each([
    ['00', 1],
    ['0000', 1],
    ['000', 2],
  ])('preserves zeros and reports precision loss when %s exceeds a budget of %s', (input, digits) => {
    expect(fmtFixedSizePrerelease(input, digits)).toEqual({ strNum: '0'.repeat(digits), hasPrecisionLoss: true })
  })

  it.each([
    ['999', 1, '9'],
    ['99995', 4, '9999'],
    ['99996', 4, '9999'],
  ])('saturates rounding carry for %s to %s digits', (input, digits, expected) => {
    expect(fmtFixedSizePrerelease(input, digits)).toEqual({ strNum: expected, hasPrecisionLoss: true })
  })

  it('preserves unsafe integer digits and rounds an exact decimal half upward', () => {
    expect(fmtFixedSizePrerelease('9007199254740993', 16)).toEqual({
      strNum: '9007199254740993',
      hasPrecisionLoss: false,
    })
    expect(fmtFixedSizePrerelease('90071992547409935', 16)).toEqual({
      strNum: '9007199254740994',
      hasPrecisionLoss: true,
    })
  })

  it('rounds exactly beyond sixteen digits', () => {
    expect(fmtFixedSizePrerelease('123456789012345678901', 20)).toEqual({
      strNum: '12345678901234567890',
      hasPrecisionLoss: true,
    })
  })

  it('rounds exactly at a width of one hundred digits', () => {
    expect(fmtFixedSizePrerelease('1'.repeat(101), 100)).toEqual({
      strNum: '1'.repeat(100),
      hasPrecisionLoss: true,
    })
  })

  it('supports padding, exact fits, and rounding above one hundred digits', () => {
    expect(fmtFixedSizePrerelease('1', 101)).toEqual({ strNum: '1'.padEnd(101, '0'), hasPrecisionLoss: false })
    expect(fmtFixedSizePrerelease('1'.repeat(101), 101)).toEqual({ strNum: '1'.repeat(101), hasPrecisionLoss: false })
    expect(fmtFixedSizePrerelease('1'.repeat(102), 101)).toEqual({ strNum: '1'.repeat(101), hasPrecisionLoss: true })
  })

  it('rounds arbitrarily large decimal input without converting to Number', () => {
    expect(fmtFixedSizePrerelease('1'.repeat(309), 10)).toEqual({ strNum: '1111111111', hasPrecisionLoss: true })
  })

  it('saturates a huge all-nine decimal string without wrapping', () => {
    expect(fmtFixedSizePrerelease('9'.repeat(309), 4)).toEqual({ strNum: '9999', hasPrecisionLoss: true })
  })

  it.each([-1, 0, 1.5, NaN, Infinity])('rejects a non-positive or non-integer width %s', digits => {
    expect(() => fmtFixedSizePrerelease('123', digits)).toThrow('desiredLength must be an integer > 0')
  })

  it.each(['', '-1', '1.5', 'abc', '1e21'])('rejects input outside decimal digit strings: %s', input => {
    expect(() => fmtFixedSizePrerelease(input, 4)).toThrow('strNum must be an integer >= 0')
  })
})

describe('zero rounding through conversion APIs', () => {
  it('returns decimal zeros with a precision-loss descriptor when a numeric zero component exceeds the total budget', () => {
    const result = prereleaseToInt('0', 2, 6)
    expect(result.strNum).toBe('00')
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual([
      { name: 'PrecisionLossError', componentName: 'prerelease' },
    ])
  })

  it('produces a decimal version string for truncated numeric zero', () => {
    const converter = new SemverIntConverter({ numPrereleaseDigits: 2 })
    const result = converter.semverToInt('1', '2', '3', '0')
    expect(result.versionStr).toBe('1020300')
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual([
      { name: 'PrecisionLossError', componentName: 'prerelease' },
    ])
  })

  it('applies maxSemverInt to a truncated numeric zero result', () => {
    const converter = new SemverIntConverter({ numPrereleaseDigits: 2, maxSemverInt: 999999n })
    const result = converter.semverToInt('1', '2', '3', '0')
    expect(result.versionStr).toBe('999999')
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual([
      { name: 'PrecisionLossError', componentName: 'prerelease' },
      { name: 'OverflowError', componentName: 'semverint' },
    ])
  })
})
