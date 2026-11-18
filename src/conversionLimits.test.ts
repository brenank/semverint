import { afterEach, describe, expect, it } from 'vitest'

import { DefaultConfig, SemverIntConverter, SemverIntConfig, semverToInt, setGlobalConfig } from './index.js'
import { prereleaseToInt } from './prereleaseUtils.js'

const componentOverflow = { name: 'OverflowError', componentName: 'prereleaseNumericComponent' }
const precisionLoss = { name: 'PrecisionLossError', componentName: 'prerelease' }
const integerOverflow = { name: 'OverflowError', componentName: 'semverint' }

describe('conversion output widths', () => {
  it.each([
    ['0', '000009999999999'],
    ['1', '100009999999999'],
    ['9', '900009999999999'],
    ['10', '1000009999999999'],
    ['99', '9900009999999999'],
  ])('keeps the major component unpadded for major %s and pads minor, patch, and stable prerelease', (major, expected) => {
    expect(new SemverIntConverter({}).semverToInt(major, '0', '0', '')).toEqual({ versionStr: expected, errs: [] })
  })

  it('preserves a core integer beyond the safe Number range when no rounding is needed', () => {
    const converter = new SemverIntConverter({ numMajorDigits: 16 })
    expect(converter.semverToInt('9007199254740993', '0', '0', '')).toEqual({
      versionStr: '900719925474099300009999999999',
      errs: [],
    })
  })

  it('currently exceeds the reserved width when Number rounds a seventeen-digit overflow ceiling upward', () => {
    const converter = new SemverIntConverter({ numMajorDigits: 17 })
    const result = converter.semverToInt('999999999999999999', '2', '3', '')
    expect(result.versionStr).toBe('10000000000000000099999999999999')
    expect(result.versionStr).toHaveLength(32)
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual([
      { name: 'OverflowError', componentName: 'major' },
    ])
  })
})

describe('error suppression affects diagnostics independently of encoded output', () => {
  it.each([
    ['error', 'error', [componentOverflow, precisionLoss]],
    ['error', 'ignore', [precisionLoss]],
    ['ignore', 'error', [componentOverflow]],
    ['ignore', 'ignore', []],
  ] as const)('prereleaseErrors=%s and prereleaseNumericComponentErrors=%s', (prereleaseErrors, componentErrors, errors) => {
    const converter = new SemverIntConverter({
      numPrereleaseDigits: 5,
      numPrereleaseComponentDigits: 6,
      prereleaseErrors,
      prereleaseNumericComponentErrors: componentErrors,
    })
    const result = converter.semverToInt('1', '2', '3', 'abcd.z')
    expect(result.versionStr).toBe('1020373748')
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual(errors)
  })

  it.each([
    ['majorVersionErrors', ['100', '2', '3'], '9999999999999999', 'major'],
    ['minorVersionErrors', ['1', '100', '3'], '199999999999999', 'minor'],
    ['patchVersionErrors', ['1', '2', '100'], '102999999999999', 'patch'],
  ] as const)('currently saturates subsequent components even when %s is ignored', (flag, version, expected, component) => {
    for (const strategy of ['error', 'ignore'] as const) {
      const converter = new SemverIntConverter({ [flag]: strategy })
      const result = converter.semverToInt(version[0], version[1], version[2], 'a')
      expect(result.versionStr).toBe(expected)
      expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual(
        strategy === 'error' ? [{ name: 'OverflowError', componentName: component }] : [],
      )
    }
  })
})

describe('zero digit budgets', () => {
  it.each([
    ['numMajorDigits', '99999999999999', 'major'],
    ['numMinorDigits', '1999999999999', 'minor'],
    ['numPatchDigits', '1029999999999', 'patch'],
  ] as const)('currently treats %s=0 as overflow and saturates the remaining components', (field, expected, component) => {
    const result = new SemverIntConverter({ [field]: 0 }).semverToInt('1', '2', '3', '')
    expect(result.versionStr).toBe(expected)
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual([
      { name: 'OverflowError', componentName: component },
    ])
  })

  it('currently returns an empty string and major overflow when every budget is zero', () => {
    const converter = new SemverIntConverter({
      numMajorDigits: 0,
      numMinorDigits: 0,
      numPatchDigits: 0,
      numPrereleaseDigits: 0,
    })
    const result = converter.semverToInt('0', '0', '0', '')
    expect(result.versionStr).toBe('')
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual([
      { name: 'OverflowError', componentName: 'major' },
    ])
  })

  it('distinguishes stable and prerelease diagnostics with no prerelease digits', () => {
    const converter = new SemverIntConverter({ numPrereleaseDigits: 0 })
    expect(converter.semverToInt('1', '2', '3', '')).toEqual({ versionStr: '10203', errs: [] })
    const result = converter.semverToInt('1', '2', '3', 'a')
    expect(result.versionStr).toBe('10203')
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual([
      { name: 'OverflowError', componentName: 'prerelease' },
    ])
    expect(
      new SemverIntConverter({ numPrereleaseDigits: 0, prereleaseErrors: 'ignore' }).semverToInt('1', '2', '3', 'a'),
    ).toEqual({ versionStr: '10203', errs: [] })
  })

  it.each(['0', '1', 'a'])('reserves stable precedence when %s has a zero prerelease component budget', prerelease => {
    const result = prereleaseToInt(prerelease, 10, 0)
    expect(result.strNum).toBe('9999999998')
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual([componentOverflow, precisionLoss])
  })

  it('keeps the stable release value with a zero prerelease component budget', () => {
    expect(prereleaseToInt('', 10, 0)).toEqual({ strNum: '9999999999', errs: [] })
  })
})

describe('maximum integer clamping', () => {
  it.each([
    [12398n, '12398', [integerOverflow]],
    [12399n, '12399', []],
    [12400n, '12399', []],
  ])('clamps a stable result just above, exactly at, or just below maximum %s', (maximum, expected, errors) => {
    const converter = new SemverIntConverter({
      numMajorDigits: 1,
      numMinorDigits: 1,
      numPatchDigits: 1,
      numPrereleaseDigits: 2,
      maxSemverInt: maximum,
    })
    const result = converter.semverToInt('1', '2', '3', '')
    expect(result.versionStr).toBe(expected)
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual(errors)
  })

  it.each([
    [9900009075000000n, '9900009075000000', [integerOverflow]],
    [9900009075000001n, '9900009075000001', []],
    [9900009075000002n, '9900009075000001', []],
  ])('compares adjacent integers exactly beyond the safe Number range at maximum %s', (maximum, expected, errors) => {
    const converter = new SemverIntConverter({ maxSemverInt: maximum })
    const result = converter.semverToInt('99', '0', '0', 'rc.1')
    expect(result.versionStr).toBe(expected)
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual(errors)
  })

  it('retains prerelease errors before the unconditional overall overflow diagnostic', () => {
    const converter = new SemverIntConverter({ numPrereleaseDigits: 5, maxSemverInt: 100n })
    const result = converter.semverToInt('1', '2', '3', 'abcd')
    expect(result.versionStr).toBe('100')
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual([
      componentOverflow,
      precisionLoss,
      integerOverflow,
    ])
  })

  it('reports overall overflow even when every configurable error category is ignored', () => {
    const converter = new SemverIntConverter({
      majorVersionErrors: 'ignore',
      minorVersionErrors: 'ignore',
      patchVersionErrors: 'ignore',
      prereleaseErrors: 'ignore',
      prereleaseNumericComponentErrors: 'ignore',
      maxSemverInt: 100n,
    })
    const result = converter.semverToInt('1', '2', '3', '')
    expect(result.versionStr).toBe('100')
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual([integerOverflow])
  })

  it.each([
    [['10', '0', '0'], '99999', 'major'],
    [['1', '10', '0'], '19999', 'minor'],
    [['1', '0', '10'], '10999', 'patch'],
  ])('currently bypasses maxSemverInt on core overflow for %j', (version, expected, component) => {
    const converter = new SemverIntConverter({
      numMajorDigits: 1,
      numMinorDigits: 1,
      numPatchDigits: 1,
      numPrereleaseDigits: 2,
      maxSemverInt: 5n,
    })
    const result = converter.semverToInt(version[0], version[1], version[2], '')
    expect(result.versionStr).toBe(expected)
    expect(BigInt(result.versionStr)).toBeGreaterThan(5n)
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual([
      { name: 'OverflowError', componentName: component },
    ])
  })

  it('currently treats a zero maximum as disabled', () => {
    expect(new SemverIntConverter({ maxSemverInt: 0n }).semverToInt('1', '2', '3', '')).toEqual({
      versionStr: '102039999999999',
      errs: [],
    })
  })

  it('currently accepts a negative maximum and returns it on clamping', () => {
    const result = new SemverIntConverter({ maxSemverInt: -1n }).semverToInt('1', '2', '3', '')
    expect(result.versionStr).toBe('-1')
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual([integerOverflow])
  })
})

describe('existing component and configuration validation', () => {
  it.each([
    ['numMajorDigits', 'numMajorDigits'],
    ['numMinorDigits', 'numMinorDigits'],
    ['numPatchDigits', 'numPatchDigits'],
    ['numPrereleaseDigits', 'numPrereleaseDigits'],
    ['numPrereleaseComponentDigits', 'numPrereleaseNumericComponentDigits'],
  ] as const)('rejects negative %s with the current diagnostic', (field, diagnostic) => {
    expect(() => new SemverIntConverter({ [field]: -1 })).toThrow(`${diagnostic} must be greater than or equal to zero.`)
  })

  it.each(['numMajorDigits', 'numMinorDigits', 'numPatchDigits', 'numPrereleaseDigits', 'numPrereleaseComponentDigits'] as const)(
    'currently accepts non-integer or non-finite %s at construction',
    field => {
      for (const width of [1.5, NaN, Infinity]) {
        const converter = new SemverIntConverter({ [field]: width })
        expect(converter.cfg[field]).toBe(width)
      }
    },
  )

  it.each([1.5, NaN, Infinity])('currently defers invalid major width %s rejection until conversion', width => {
    const converter = new SemverIntConverter({ numMajorDigits: width })
    expect(() => converter.semverToInt('1', '2', '3', '')).toThrow('desiredLength must be an integer >= 0')
  })

  it('currently truncates a fractional prerelease width on the stable path but rejects it for a prerelease', () => {
    const converter = new SemverIntConverter({ numPrereleaseDigits: 1.5 })
    expect(converter.semverToInt('1', '2', '3', '')).toEqual({ versionStr: '102039', errs: [] })
    expect(() => converter.semverToInt('1', '2', '3', 'a')).toThrow('desiredLength must be an integer > 0')
  })

  it.each(['', '-1', '01', '+1', '1.0', '1e2', ' 1', '1 ', 'NaN'])(
    'rejects noncanonical core numeric input %j in each component',
    input => {
      const converter = new SemverIntConverter({})
      expect(() => converter.semverToInt(input, '0', '0', '')).toThrow('major version must be an integer >= 0')
      expect(() => converter.semverToInt('0', input, '0', '')).toThrow('minor version must be an integer >= 0')
      expect(() => converter.semverToInt('0', '0', input, '')).toThrow('patch version must be an integer >= 0')
    },
  )

  it('validates later core inputs before returning for major overflow', () => {
    expect(() => new SemverIntConverter({}).semverToInt('100', 'invalid', '0', '')).toThrow(
      'minor version must be an integer >= 0',
    )
  })

  it('rejects a core numeric string too large for a finite Number', () => {
    expect(() => new SemverIntConverter({}).semverToInt('9'.repeat(309), '0', '0', '')).toThrow('strNum must be an integer >= 0')
  })
})

describe('public singleton configuration', () => {
  afterEach(() => {
    setGlobalConfig(DefaultConfig)
  })

  it('replaces partial configuration against defaults and keeps local converters independent', () => {
    const local = new SemverIntConverter({ numPrereleaseDigits: 2 })
    setGlobalConfig({ numMinorDigits: 3, numPrereleaseDigits: 0 })
    expect(semverToInt('1', '2', '3', '')).toEqual({ versionStr: '100203', errs: [] })
    expect(local.semverToInt('1', '2', '3', '')).toEqual({ versionStr: '1020399', errs: [] })
    setGlobalConfig({ numPatchDigits: 3 } satisfies Partial<SemverIntConfig>)
    expect(semverToInt('1', '2', '3', '')).toEqual({ versionStr: '1020039999999999', errs: [] })
  })

  it('retains the previous singleton configuration when a replacement is invalid', () => {
    setGlobalConfig({ numPrereleaseDigits: 2 })
    expect(() => setGlobalConfig({ numPrereleaseDigits: -1 })).toThrow(
      'numPrereleaseDigits must be greater than or equal to zero.',
    )
    expect(semverToInt('1', '2', '3', '')).toEqual({ versionStr: '1020399', errs: [] })
  })
})
