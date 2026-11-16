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

  it('saturates a seventeen-digit core component to exactly its reserved width', () => {
    const converter = new SemverIntConverter({ numMajorDigits: 17 })
    const result = converter.semverToInt('999999999999999999', '2', '3', '')
    expect(result.versionStr).toBe('9999999999999999999999999999999')
    expect(result.versionStr).toHaveLength(31)
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
  ] as const)('saturates subsequent components even when %s is ignored', (flag, version, expected, component) => {
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
  ] as const)('treats %s=0 as overflow and saturates the remaining components', (field, expected, component) => {
    const result = new SemverIntConverter({ [field]: 0 }).semverToInt('1', '2', '3', '')
    expect(result.versionStr).toBe(expected)
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual([
      { name: 'OverflowError', componentName: component },
    ])
  })

  it('returns zero and major overflow when every budget is zero', () => {
    const converter = new SemverIntConverter({
      numMajorDigits: 0,
      numMinorDigits: 0,
      numPatchDigits: 0,
      numPrereleaseDigits: 0,
    })
    const result = converter.semverToInt('0', '0', '0', '')
    expect(result.versionStr).toBe('0')
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

  it('keeps the stable sentinel with a zero prerelease component budget', () => {
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
    [['10', '0', '0'], 'major', 'majorVersionErrors'],
    [['1', '10', '0'], 'minor', 'minorVersionErrors'],
    [['1', '0', '10'], 'patch', 'patchVersionErrors'],
  ] as const)(
    'applies maxSemverInt after core overflow for %j, including ignored component errors',
    (version, component, flag) => {
      for (const strategy of ['error', 'ignore'] as const) {
        const converter = new SemverIntConverter({
          numMajorDigits: 1,
          numMinorDigits: 1,
          numPatchDigits: 1,
          numPrereleaseDigits: 2,
          maxSemverInt: 5n,
          [flag]: strategy,
        })
        const result = converter.semverToInt(version[0], version[1], version[2], '')
        expect(result.versionStr).toBe('5')
        expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual(
          strategy == 'error' ? [{ name: 'OverflowError', componentName: component }, integerOverflow] : [integerOverflow],
        )
      }
    },
  )

  it('applies a zero maximum', () => {
    const result = new SemverIntConverter({ maxSemverInt: 0n }).semverToInt('1', '2', '3', '')
    expect(result.versionStr).toBe('0')
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual([integerOverflow])
  })

  it('rejects a negative maximum at construction', () => {
    expect(() => new SemverIntConverter({ maxSemverInt: -1n })).toThrow(
      'maxSemverInt must be a bigint greater than or equal to zero.',
    )
  })

  it.each([1, -1, '1', false])('rejects a non-bigint maximum %j at construction', maximum => {
    expect(() => new SemverIntConverter({ maxSemverInt: maximum as unknown as bigint })).toThrow(
      'maxSemverInt must be a bigint greater than or equal to zero.',
    )
  })

  it('compares large core values and maximum integers exactly', () => {
    const converter = new SemverIntConverter({
      numMajorDigits: 22,
      numPrereleaseDigits: 0,
      maxSemverInt: 10000000000000000000000000n,
    })
    expect(converter.semverToInt('999999999999999999999', '99', '99', '')).toEqual({
      versionStr: '9999999999999999999999999',
      errs: [],
    })
    expect(converter.semverToInt('1000000000000000000000', '0', '0', '')).toEqual({
      versionStr: '10000000000000000000000000',
      errs: [],
    })
    const above = converter.semverToInt('1000000000000000000000', '0', '1', '')
    expect(above.versionStr).toBe('10000000000000000000000000')
    expect(above.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual([integerOverflow])
  })
})

describe('existing component and configuration validation', () => {
  it.each(['numMajorDigits', 'numMinorDigits', 'numPatchDigits', 'numPrereleaseDigits', 'numPrereleaseComponentDigits'] as const)(
    'rejects negative %s at construction',
    field => {
      expect(() => new SemverIntConverter({ [field]: -1 })).toThrow(`${field} must be an integer greater than or equal to zero.`)
    },
  )

  it.each(['numMajorDigits', 'numMinorDigits', 'numPatchDigits', 'numPrereleaseDigits', 'numPrereleaseComponentDigits'] as const)(
    'rejects non-integer or non-finite %s at construction',
    field => {
      for (const width of [1.5, NaN, Infinity]) {
        expect(() => new SemverIntConverter({ [field]: width })).toThrow(
          `${field} must be an integer greater than or equal to zero.`,
        )
      }
    },
  )

  it.each([1.5, NaN, Infinity])('rejects invalid major width %s before conversion', width => {
    expect(() => new SemverIntConverter({ numMajorDigits: width })).toThrow(
      'numMajorDigits must be an integer greater than or equal to zero.',
    )
  })

  it('rejects a fractional prerelease width at construction for both stable and prerelease usage', () => {
    expect(() => new SemverIntConverter({ numPrereleaseDigits: 1.5 })).toThrow(
      'numPrereleaseDigits must be an integer greater than or equal to zero.',
    )
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

  it('reports overflow for a core numeric string too large for a finite Number', () => {
    const result = new SemverIntConverter({}).semverToInt('9'.repeat(309), '0', '0', '')
    expect(result.versionStr).toBe('9999999999999999')
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual([
      { name: 'OverflowError', componentName: 'major' },
    ])
  })

  it('preserves a core numeric string too large for a finite Number when its budget is sufficient', () => {
    const converter = new SemverIntConverter({ numMajorDigits: 309 })
    expect(converter.semverToInt('9'.repeat(309), '0', '0', '')).toEqual({
      versionStr: `${'9'.repeat(309)}00009999999999`,
      errs: [],
    })
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
})
