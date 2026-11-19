import { afterEach, describe, expect, it } from 'vitest'

import { DefaultConfig, SemverIntConverter, SemverIntConfig, semverToInt, setGlobalConfig } from './index.js'
import { prereleaseToInt } from './prereleaseUtils.js'
import { convertVersion } from './test/convertVersion.js'

const componentOverflow = { name: 'OverflowError', componentName: 'prereleaseNumericComponent' }
const precisionLoss = { name: 'PrecisionLossError', componentName: 'prerelease' }
const integerOverflow = { name: 'OverflowError', componentName: 'semverint' }

describe('conversion output widths', () => {
  it.each([
    ['0.0.0', '000009999999999'],
    ['1.0.0', '100009999999999'],
    ['9.0.0', '900009999999999'],
    ['10.0.0', '1000009999999999'],
    ['99.0.0', '9900009999999999'],
  ])('encodes %s as %s with an unpadded major component and a stable suffix', (version, expected) => {
    expect(convertVersion(new SemverIntConverter({}), version)).toEqual({ versionStr: expected, errs: [] })
  })

  it.each([
    ['1.2.3', '10203'],
    ['1.12.3', '11203'],
    ['10.2.3', '100203'],
  ])('encodes the core of %s as %s with zero prerelease digits', (version, expected) => {
    const converter = new SemverIntConverter({ numPrereleaseDigits: 0 })
    expect(convertVersion(converter, version)).toEqual({ versionStr: expected, errs: [] })
  })

  it('preserves a core integer beyond the safe Number range when it fits', () => {
    const converter = new SemverIntConverter({ numMajorDigits: 16 })
    expect(convertVersion(converter, '9007199254740993.0.0')).toEqual({
      versionStr: '900719925474099300009999999999',
      errs: [],
    })
  })

  it('saturates an overflowing core integer within a seventeen-digit field', () => {
    const converter = new SemverIntConverter({ numMajorDigits: 17 })
    const result = convertVersion(converter, '999999999999999999.2.3')
    expect(result.versionStr).toBe('9'.repeat(31))
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
    const result = convertVersion(converter, '1.2.3-abcd.z')
    expect(result.versionStr).toBe('1020323839')
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual(errors)
  })

  it.each([
    ['majorVersionErrors', '100.2.3-a', '9999999999999999', 'major'],
    ['minorVersionErrors', '1.100.3-a', '199999999999999', 'minor'],
    ['patchVersionErrors', '1.2.100-a', '102999999999999', 'patch'],
  ] as const)('saturates subsequent components even when %s is ignored', (flag, version, expected, component) => {
    for (const strategy of ['error', 'ignore'] as const) {
      const converter = new SemverIntConverter({ [flag]: strategy })
      const result = convertVersion(converter, version)
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
    const result = convertVersion(new SemverIntConverter({ [field]: 0 }), '1.2.3')
    expect(result.versionStr).toBe(expected)
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual([
      { name: 'OverflowError', componentName: component },
    ])
  })

  it('rejects a zero total output width', () => {
    expect(
      () =>
        new SemverIntConverter({
          numMajorDigits: 0,
          numMinorDigits: 0,
          numPatchDigits: 0,
          numPrereleaseDigits: 0,
        }),
    ).toThrow('Total output width must be a positive safe integer.')
  })

  it('omits a prerelease from the encoded integer and reports overflow by default with zero prerelease digits', () => {
    const converter = new SemverIntConverter({ numPrereleaseDigits: 0 })
    const result = convertVersion(converter, '1.2.3-a')
    expect(result.versionStr).toBe('10203')
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual([
      { name: 'OverflowError', componentName: 'prerelease' },
    ])
    const ignoringPrereleaseOverflow = new SemverIntConverter({ numPrereleaseDigits: 0, prereleaseErrors: 'ignore' })
    expect(convertVersion(ignoringPrereleaseOverflow, '1.2.3-a')).toEqual({ versionStr: '10203', errs: [] })
  })

  it.each([
    ['0', '1099999999'],
    ['1', '1099999999'],
    ['a', '2999999999'],
  ])('reserves stable precedence when %s has a zero prerelease component budget', (prerelease, expected) => {
    const result = prereleaseToInt(prerelease, 10, 0)
    expect(result.strNum).toBe(expected)
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual([componentOverflow])
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
    const result = convertVersion(converter, '1.2.3')
    expect(result.versionStr).toBe(expected)
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual(errors)
  })

  it.each([
    [9900002554000110n, '9900002554000110', [integerOverflow]],
    [9900002554000111n, '9900002554000111', []],
    [9900002554000112n, '9900002554000111', []],
  ])('compares adjacent integers exactly beyond the safe Number range at maximum %s', (maximum, expected, errors) => {
    const converter = new SemverIntConverter({ maxSemverInt: maximum })
    const result = convertVersion(converter, '99.0.0-rc.1')
    expect(result.versionStr).toBe(expected)
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual(errors)
  })

  it('retains prerelease errors before the unconditional overall overflow diagnostic', () => {
    const converter = new SemverIntConverter({ numPrereleaseDigits: 5, maxSemverInt: 100n })
    const result = convertVersion(converter, '1.2.3-abcd')
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
    const result = convertVersion(converter, '1.2.3')
    expect(result.versionStr).toBe('100')
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual([integerOverflow])
  })

  it.each([
    ['10.0.0', 'major', 'majorVersionErrors'],
    ['1.10.0', 'minor', 'minorVersionErrors'],
    ['1.0.10', 'patch', 'patchVersionErrors'],
  ] as const)('applies maxSemverInt after core overflow for %s', (version, component, flag) => {
    for (const strategy of ['error', 'ignore'] as const) {
      const converter = new SemverIntConverter({
        numMajorDigits: 1,
        numMinorDigits: 1,
        numPatchDigits: 1,
        numPrereleaseDigits: 2,
        maxSemverInt: 5n,
        [flag]: strategy,
      })
      const result = convertVersion(converter, version)
      expect(result.versionStr).toBe('5')
      expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual(
        strategy === 'error' ? [{ name: 'OverflowError', componentName: component }, integerOverflow] : [integerOverflow],
      )
    }
  })

  it('clamps a positive result to a zero maximum', () => {
    const result = convertVersion(new SemverIntConverter({ maxSemverInt: 0n }), '1.2.3')
    expect(result.versionStr).toBe('0')
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual([integerOverflow])
  })

  it('preserves a zero result at a zero maximum', () => {
    const converter = new SemverIntConverter({ numPrereleaseDigits: 0, maxSemverInt: 0n })
    expect(convertVersion(converter, '0.0.0')).toEqual({ versionStr: '00000', errs: [] })
  })

  it.each([-1n, 0, 10, '10', NaN, Infinity])('rejects invalid maximum %s', invalidMaximum => {
    expect(() => new SemverIntConverter({ maxSemverInt: invalidMaximum as bigint })).toThrow(
      'maxSemverInt must be a nonnegative bigint.',
    )
  })
})

describe('component and configuration validation', () => {
  it.each(['numMajorDigits', 'numMinorDigits', 'numPatchDigits', 'numPrereleaseDigits', 'numPrereleaseComponentDigits'] as const)(
    'rejects invalid %s at construction',
    field => {
      for (const width of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
        expect(() => new SemverIntConverter({ [field]: width })).toThrow(`${field} must be a nonnegative safe integer.`)
      }
    },
  )

  it('rejects an unsafe total output width even when each field is safe', () => {
    expect(() => new SemverIntConverter({ numMajorDigits: Number.MAX_SAFE_INTEGER })).toThrow(
      'Total output width must be a positive safe integer.',
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

  it('saturates core numeric strings too large for a finite Number before applying the maximum', () => {
    const converter = new SemverIntConverter({ numMajorDigits: 22, maxSemverInt: 10n })
    const result = convertVersion(converter, `${'9'.repeat(309)}.0.0`)
    expect(result.versionStr).toBe('10')
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual([
      { name: 'OverflowError', componentName: 'major' },
      integerOverflow,
    ])
  })
})

describe('public converter configuration', () => {
  it('uses inherited options when the public configuration is replaced', () => {
    const converter = new SemverIntConverter({})
    const inherited: SemverIntConfig = Object.create({
      ...DefaultConfig,
      numPrereleaseDigits: 2,
      firstPrereleaseComponentToDigit: ['a', '', '', '', '', '', '', '', ''],
    })
    converter.cfg = inherited
    expect(convertVersion(converter, '1.2.3-a')).toEqual({ versionStr: '1020310', errs: [] })

    inherited.maxSemverInt = 3n
    const result = convertVersion(converter, '1.2.3')
    expect(result.versionStr).toBe('3')
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual([integerOverflow])
  })

  it('uses digit widths changed after construction', () => {
    const converter = new SemverIntConverter({})
    converter.cfg.numPrereleaseDigits = 2
    expect(convertVersion(converter, '1.2.3')).toEqual({ versionStr: '1020399', errs: [] })
  })

  it.each([5n, 0n])('uses a maximum of %s set after construction', maximum => {
    const converter = new SemverIntConverter({})
    converter.cfg.maxSemverInt = maximum
    const result = convertVersion(converter, '1.2.3')
    expect(result.versionStr).toBe(maximum.toString())
    expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual([integerOverflow])
  })

  it('rejects a negative maximum set after construction', () => {
    const converter = new SemverIntConverter({})
    converter.cfg.maxSemverInt = -1n
    expect(() => convertVersion(converter, '1.2.3')).toThrow('maxSemverInt must be a nonnegative bigint.')
  })

  it.each([
    ['numPrereleaseDigits', 1.5],
    ['numPrereleaseComponentDigits', -1],
  ] as const)('rejects invalid %s set after construction', (field, width) => {
    const converter = new SemverIntConverter({})
    converter.cfg[field] = width
    expect(() => convertVersion(converter, '1.2.3')).toThrow(`${field} must be a nonnegative safe integer.`)
  })

  it('rejects a zero total output width set after construction', () => {
    const converter = new SemverIntConverter({})
    Object.assign(converter.cfg, { numMajorDigits: 0, numMinorDigits: 0, numPatchDigits: 0, numPrereleaseDigits: 0 })
    expect(() => convertVersion(converter, '1.2.3')).toThrow('Total output width must be a positive safe integer.')
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
    expect(convertVersion(local, '1.2.3')).toEqual({ versionStr: '1020399', errs: [] })
    setGlobalConfig({ numPatchDigits: 3 } satisfies Partial<SemverIntConfig>)
    expect(semverToInt('1', '2', '3', '')).toEqual({ versionStr: '1020039999999999', errs: [] })
  })

  it('retains the previous singleton configuration when a replacement is invalid', () => {
    setGlobalConfig({ numPrereleaseDigits: 2 })
    expect(() => setGlobalConfig({ numPrereleaseDigits: -1 })).toThrow('numPrereleaseDigits must be a nonnegative safe integer.')
    expect(semverToInt('1', '2', '3', '')).toEqual({ versionStr: '1020399', errs: [] })
  })
})
