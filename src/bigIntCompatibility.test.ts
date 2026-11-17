import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import ts from 'typescript'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { SemverIntConfig } from './types/config.js'

type Version = [string, string, string, string]
type Config = Partial<Omit<SemverIntConfig, 'maxSemverInt'>>

interface CompatibilityCase {
  name: string
  config: Config
  version: Version
  operation?: 'construct'
  maximum?: string
  exceptionName?: string
  legacyExceptionName?: string
  expectedVersion?: string
}

interface ConversionOutcome {
  versionStr: string
  errs: { name: string; componentName: string; message: string }[]
}

type Outcome = ConversionOutcome | { exception: { name: string; message: string } } | { constructed: true }

interface ModeResult {
  format: 'cjs' | 'esm'
  bigIntAvailable: boolean
  bigIntType: string
  cases: { singleton: Outcome; local: Outcome }[]
  isolation: {
    firstGlobal: Outcome
    firstLocal: Outcome
    secondGlobal: Outcome
    secondLocal: Outcome
    failedUpdate: Outcome
    globalAfterFailedUpdate: Outcome
    localAfterFailedUpdate: Outcome
  }
}

const mapping: NonNullable<Config['firstPrereleaseComponentToDigit']> = [
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
const duplicateMapping: typeof mapping = [...mapping]
duplicateMapping[1] = 'alpha'
const numericMapping: typeof mapping = [...mapping]
numericMapping[1] = '1'

const compatibilityCases: CompatibilityCase[] = [
  { name: 'default stable', config: {}, version: ['1', '2', '3', ''], expectedVersion: '102039999999999' },
  { name: 'default text', config: {}, version: ['1', '2', '3', 'a'], expectedVersion: '102037300000000' },
  { name: 'default rc.1', config: {}, version: ['1', '2', '3', 'rc.1'], expectedVersion: '102039075000001' },
  { name: 'zero core', config: {}, version: ['0', '0', '0', ''], expectedVersion: '000009999999999' },
  { name: 'core at width limits', config: {}, version: ['99', '99', '99', ''] },
  { name: 'major overflow', config: {}, version: ['100', '2', '3', 'a'] },
  { name: 'minor overflow', config: {}, version: ['1', '100', '3', 'a'] },
  { name: 'patch overflow', config: {}, version: ['1', '2', '100', 'a'] },
  { name: 'unsafe core integer', config: { numMajorDigits: 16 }, version: ['9007199254740993', '0', '0', ''] },
  { name: 'wide core ceiling', config: { numMajorDigits: 17 }, version: ['999999999999999999', '2', '3', ''] },
  {
    name: 'core beyond finite Number range',
    config: { numMajorDigits: 309 },
    version: ['9'.repeat(309), '0', '0', ''],
    exceptionName: 'Error',
  },
  { name: 'mapped known', config: { firstPrereleaseComponentToDigit: mapping }, version: ['1', '2', '3', 'alpha.1.z'] },
  { name: 'mapped unknown', config: { firstPrereleaseComponentToDigit: mapping }, version: ['1', '2', '3', 'unknown.1'] },
  {
    name: 'mapped duplicate uses first match',
    config: { firstPrereleaseComponentToDigit: duplicateMapping },
    version: ['1', '2', '3', 'alpha'],
  },
  { name: 'mapped numeric first', config: { firstPrereleaseComponentToDigit: numericMapping }, version: ['1', '2', '3', '1.2'] },
  {
    name: 'unmapped numeric first',
    config: { firstPrereleaseComponentToDigit: numericMapping },
    version: ['1', '2', '3', '2.1'],
  },
  {
    name: 'mapped ninth entry at one digit',
    config: { firstPrereleaseComponentToDigit: mapping, numPrereleaseDigits: 1 },
    version: ['1', '2', '3', 'last'],
  },
  {
    name: 'mapping exactly fills total before text tail',
    config: { firstPrereleaseComponentToDigit: mapping, numPrereleaseDigits: 1 },
    version: ['1', '2', '3', 'alpha.a'],
  },
  {
    name: 'mapping bypasses zero component budget',
    config: { firstPrereleaseComponentToDigit: mapping, numPrereleaseComponentDigits: 0 },
    version: ['1', '2', '3', 'alpha'],
  },
  { name: 'zero rounding', config: { numPrereleaseDigits: 2 }, version: ['1', '2', '3', '0'] },
  { name: 'leading zero rounding below half', config: { numPrereleaseDigits: 5 }, version: ['1', '2', '3', '14'] },
  { name: 'leading zero rounding at half', config: { numPrereleaseDigits: 5 }, version: ['1', '2', '3', '15'] },
  { name: 'leading zero rounding above half', config: { numPrereleaseDigits: 5 }, version: ['1', '2', '3', '16'] },
  {
    name: 'rounding carry across mapped prefix',
    config: { firstPrereleaseComponentToDigit: mapping, numPrereleaseDigits: 1 },
    version: ['1', '2', '3', 'last.z'],
  },
  { name: 'huge numeric identifier clamps', config: {}, version: ['1', '2', '3', '9'.repeat(309)] },
  {
    name: 'huge numeric identifier with huge component budget',
    config: { numPrereleaseDigits: 310, numPrereleaseComponentDigits: 310 },
    version: ['1', '2', '3', '9'.repeat(309)],
    legacyExceptionName: 'Error',
  },
  {
    name: 'one hundred digit rounding',
    config: { numPrereleaseDigits: 100, numPrereleaseComponentDigits: 120 },
    version: ['1', '2', '3', 'a'.repeat(60)],
  },
  {
    name: 'over one hundred digits without rounding',
    config: { numPrereleaseDigits: 120, numPrereleaseComponentDigits: 120 },
    version: ['1', '2', '3', 'a'.repeat(60)],
  },
  {
    name: 'over one hundred digits requiring rounding',
    config: { numPrereleaseDigits: 101, numPrereleaseComponentDigits: 120 },
    version: ['1', '2', '3', 'a'.repeat(60)],
    legacyExceptionName: 'RangeError',
  },
]

for (const [prerelease, expectedVersion] of [
  ['1e2', '1020337773800000000000000'],
  ['0x10', '1020336963736000000000000'],
  ['01a', '1020336377300000000000000'],
  ['00-', '1020336364600000000000000'],
]) {
  compatibilityCases.push({
    name: `numeric-looking text identifier ${prerelease}`,
    config: { numPrereleaseDigits: 20, numPrereleaseComponentDigits: 16 },
    version: ['1', '2', '3', prerelease],
    expectedVersion,
  })
}

for (const prerelease of ['0', '1', '123', 'a', 'abc', 'a.b.c', '1.alpha', '1.2.alpha', 'a.1.b', '1a.2.z', '0a']) {
  compatibilityCases.push({ name: `default prerelease ${prerelease}`, config: {}, version: ['1', '2', '3', prerelease] })
}

for (const digits of [0, 1, 5, 6, 7]) {
  for (const prerelease of ['', 'abc.z', 'a.b.c', '0']) {
    compatibilityCases.push({
      name: `total budget ${digits}, prerelease ${prerelease || '(stable)'}`,
      config: { numPrereleaseDigits: digits },
      version: ['1', '2', '3', prerelease],
    })
  }
}

for (const digits of [0, 1, 2, 3, 5, 6, 7]) {
  for (const prerelease of ['', '0', 'abc.z']) {
    compatibilityCases.push({
      name: `component budget ${digits}, prerelease ${prerelease || '(stable)'}`,
      config: { numPrereleaseComponentDigits: digits },
      version: ['1', '2', '3', prerelease],
    })
  }
}

for (const [digits, identifiers] of [
  [1, ['1', '2', '3']],
  [2, ['34', '35', '36']],
  [4, ['3634', '3635', '3636']],
  [6, ['363634', '363635', '363636']],
  [18, ['9007199254740992', '9007199254740993']],
  [22, ['999999999999999900000', '999999999999999999999', '1000000000000000000000']],
] as const) {
  for (const prerelease of identifiers) {
    compatibilityCases.push({
      name: `numeric ceiling and Number boundary: ${digits} digits, ${prerelease}`,
      config: { numPrereleaseComponentDigits: digits, numPrereleaseDigits: 30 },
      version: ['1', '2', '3', prerelease],
    })
  }
}

const widthFields = [
  'numMajorDigits',
  'numMinorDigits',
  'numPatchDigits',
  'numPrereleaseDigits',
  'numPrereleaseComponentDigits',
] as const
for (const field of widthFields) {
  compatibilityCases.push(
    { name: `zero ${field}`, config: { [field]: 0 }, version: ['1', '2', '3', 'a'] },
    {
      name: `negative ${field} rejects construction`,
      config: { [field]: -1 },
      version: ['1', '2', '3', ''],
      exceptionName: 'Error',
    },
    {
      name: `fractional ${field} accepts construction`,
      config: { [field]: 1.5 },
      version: ['1', '2', '3', ''],
      operation: 'construct',
    },
  )
}
compatibilityCases.push({
  name: 'all conversion budgets zero',
  config: { numMajorDigits: 0, numMinorDigits: 0, numPatchDigits: 0, numPrereleaseDigits: 0 },
  version: ['0', '0', '0', ''],
})

for (const input of ['', '-1', '01', '+1', '1.0', '1e2', ' 1', '1 ', 'NaN']) {
  for (const component of [0, 1, 2]) {
    const version: Version = ['1', '2', '3', '']
    version[component] = input
    compatibilityCases.push({
      name: `invalid core component ${component}: ${JSON.stringify(input)}`,
      config: {},
      version,
      exceptionName: 'Error',
    })
  }
}

// Each field doubles the list, producing all 32 combinations without hiding the error policies.
let errorPolicies: Config[] = [{}]
for (const field of [
  'majorVersionErrors',
  'minorVersionErrors',
  'patchVersionErrors',
  'prereleaseErrors',
  'prereleaseNumericComponentErrors',
] as const) {
  const nextPolicies: Config[] = []
  for (const policy of errorPolicies) {
    nextPolicies.push({ ...policy, [field]: 'error' }, { ...policy, [field]: 'ignore' })
  }
  errorPolicies = nextPolicies
}
const overflowInputs: Version[] = [
  ['100', '2', '3', 'a'],
  ['1', '100', '3', 'a'],
  ['1', '2', '100', 'a'],
  ['1', '2', '3', 'abcd.z'],
]
for (const policies of errorPolicies) {
  const label = Object.values(policies).join('/')
  for (const version of overflowInputs) {
    compatibilityCases.push({
      name: `policies ${label}, version ${version.join('.')}`,
      config: { ...policies, numPrereleaseDigits: 5 },
      version,
    })
  }
}

const smallWidths: Config = { numMajorDigits: 1, numMinorDigits: 1, numPatchDigits: 1, numPrereleaseDigits: 2 }
interface CapCase extends CompatibilityCase {
  requiresBigInt: boolean
  expectedOverflow?: 'semverint' | 'major' | 'minor' | 'patch'
}
const capCases: CapCase[] = [
  {
    name: 'cap distinguishes adjacent integers beyond Number precision',
    config: {},
    version: ['99', '0', '0', 'rc.1'],
    maximum: '9900009075000000',
    expectedVersion: '9900009075000000',
    requiresBigInt: true,
    expectedOverflow: 'semverint',
  },
  {
    name: 'cap below result',
    config: smallWidths,
    version: ['1', '2', '3', ''],
    maximum: '12398',
    expectedVersion: '12398',
    requiresBigInt: true,
    expectedOverflow: 'semverint',
  },
  {
    name: 'cap equal to result',
    config: smallWidths,
    version: ['1', '2', '3', ''],
    maximum: '12399',
    expectedVersion: '12399',
    requiresBigInt: true,
  },
  {
    name: 'cap above result',
    config: smallWidths,
    version: ['1', '2', '3', ''],
    maximum: '12400',
    expectedVersion: '12399',
    requiresBigInt: true,
  },
  {
    name: 'zero cap is disabled',
    config: {},
    version: ['1', '2', '3', ''],
    maximum: '0',
    expectedVersion: '102039999999999',
    requiresBigInt: false,
  },
  {
    name: 'negative cap accepted',
    config: {},
    version: ['1', '2', '3', ''],
    maximum: '-1',
    expectedVersion: '-1',
    requiresBigInt: true,
    expectedOverflow: 'semverint',
  },
  {
    name: 'major overflow bypasses cap',
    config: smallWidths,
    version: ['10', '0', '0', ''],
    maximum: '5',
    expectedVersion: '99999',
    requiresBigInt: false,
    expectedOverflow: 'major',
  },
  {
    name: 'minor overflow bypasses cap',
    config: smallWidths,
    version: ['1', '10', '0', ''],
    maximum: '5',
    expectedVersion: '19999',
    requiresBigInt: false,
    expectedOverflow: 'minor',
  },
  {
    name: 'patch overflow bypasses cap',
    config: smallWidths,
    version: ['1', '0', '10', ''],
    maximum: '5',
    expectedVersion: '10999',
    requiresBigInt: false,
    expectedOverflow: 'patch',
  },
]
const allCases = [...compatibilityCases, ...capCases]

let temporaryRoot = ''
let results: ModeResult[] = []
const emittedFiles: string[] = []

function collectJavaScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filename = path.join(directory, entry.name)
    if (entry.isDirectory()) return collectJavaScriptFiles(filename)
    return filename.endsWith('.js') ? [filename] : []
  })
}

beforeAll(() => {
  const repositoryRoot = path.resolve(__dirname, '..')
  temporaryRoot = mkdtempSync(path.join(tmpdir(), 'semverint-compatibility-'))
  const packageJson = JSON.parse(readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8')) as {
    exports: { '.': { require: string; import: string } }
  }
  const entrypoints = { cjs: '', esm: '' }

  for (const format of ['cjs', 'esm'] as const) {
    const outputDirectory = path.join(temporaryRoot, 'dist', format)
    const project = format === 'cjs' ? 'tsconfig.cjs.json' : 'tsconfig.json'
    execFileSync(
      process.execPath,
      [
        require.resolve('typescript/bin/tsc'),
        '--project',
        project,
        '--outDir',
        outputDirectory,
        '--declarationDir',
        path.join(temporaryRoot, 'types', format),
      ],
      { cwd: repositoryRoot, encoding: 'utf8' },
    )
    const exportPath = format === 'cjs' ? packageJson.exports['.'].require : packageJson.exports['.'].import
    entrypoints[format] = path.resolve(temporaryRoot, exportPath)
    emittedFiles.push(...collectJavaScriptFiles(outputDirectory))
  }

  const output = execFileSync(
    process.execPath,
    ['--experimental-vm-modules', path.join(__dirname, 'test', 'runPackageCompatibility.mjs')],
    {
      input: JSON.stringify({ entrypoints, cases: allCases }),
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    },
  )
  results = JSON.parse(output) as ModeResult[]
}, 30_000)

afterAll(() => {
  if (temporaryRoot) rmSync(temporaryRoot, { recursive: true, force: true })
})

describe('public package conversion without an optional maximum', () => {
  it.each(compatibilityCases.map((testCase, index) => ({ ...testCase, index })))('$name', testCase => {
    const baseline = results[0].cases[testCase.index].local
    for (const mode of results) {
      for (const api of ['singleton', 'local'] as const) {
        const outcome = mode.cases[testCase.index][api]
        const label = `${mode.format}, BigInt=${mode.bigIntAvailable}, ${api}`
        expect(outcome, label).toEqual(baseline)
        if (testCase.exceptionName) {
          expect(outcome, label).toMatchObject({ exception: { name: testCase.exceptionName } })
        } else if (testCase.legacyExceptionName && 'exception' in outcome) {
          // Compatibility permits fixing these known Number limitations, provided both modes agree.
          expect(outcome.exception.name, label).toBe(testCase.legacyExceptionName)
        } else if (testCase.operation === 'construct') {
          expect(outcome, label).toEqual({ constructed: true })
        } else {
          expect(outcome, label).toMatchObject({ versionStr: expect.any(String), errs: expect.any(Array) })
          if (testCase.expectedVersion !== undefined)
            expect(outcome, label).toEqual({ versionStr: testCase.expectedVersion, errs: [] })
        }
      }
    }
  })
})

describe('the optional maximum retains its existing BigInt requirement', () => {
  it.each(capCases.map((testCase, index) => ({ ...testCase, index: compatibilityCases.length + index })))('$name', testCase => {
    for (const mode of results) {
      for (const api of ['singleton', 'local'] as const) {
        const outcome = mode.cases[testCase.index][api]
        if (!mode.bigIntAvailable && testCase.requiresBigInt) {
          expect(outcome).toEqual({ exception: { name: 'TypeError', message: 'BigInt is not a function' } })
        } else {
          expect(outcome).toMatchObject({ versionStr: testCase.expectedVersion })
          expect(outcome).toEqual(results[0].cases[testCase.index].local)
          if (testCase.expectedOverflow) {
            expect(outcome).toMatchObject({ errs: [{ name: 'OverflowError', componentName: testCase.expectedOverflow }] })
          } else {
            expect(outcome).toMatchObject({ errs: [] })
          }
        }
      }
    }
  })
})

it('runs both package formats with BigInt present and absent in separate contexts', () => {
  expect(results.map(({ format, bigIntType }) => ({ format, bigIntType }))).toEqual([
    { format: 'cjs', bigIntType: 'function' },
    { format: 'cjs', bigIntType: 'undefined' },
    { format: 'esm', bigIntType: 'function' },
    { format: 'esm', bigIntType: 'undefined' },
  ])
})

it('keeps local converters independent and replaces global configuration against defaults in every mode', () => {
  for (const mode of results) {
    expect(mode.isolation).toEqual({
      firstGlobal: { versionStr: '100203', errs: [] },
      firstLocal: { versionStr: '1020399', errs: [] },
      secondGlobal: { versionStr: '1020039999999999', errs: [] },
      secondLocal: { versionStr: '1020399', errs: [] },
      failedUpdate: { exception: { name: 'Error', message: 'numPrereleaseDigits must be greater than or equal to zero.' } },
      globalAfterFailedUpdate: { versionStr: '1020399', errs: [] },
      localAfterFailedUpdate: { versionStr: '1020399', errs: [] },
    })
  }
})

it('emits no bigint literal syntax in either production module format', () => {
  // Hiding the constructor does not disable modern Node's parser support for literals such as 1n.
  // Inspect syntax too, including unreachable code, without banning the existing optional BigInt call.
  const literals: string[] = []
  for (const filename of emittedFiles) {
    const source = ts.createSourceFile(filename, readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
    function visit(node: ts.Node) {
      if (ts.isBigIntLiteral(node)) literals.push(`${path.relative(temporaryRoot, filename)}: ${node.getText(source)}`)
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  expect(emittedFiles.length).toBeGreaterThan(0)
  expect(literals).toEqual([])
})
