import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const [format, bigInt] = process.argv.slice(2)
if (bigInt === 'unavailable') globalThis.BigInt = undefined

let api
if (format === 'cjs') {
  const require = createRequire(import.meta.url)
  assert.equal(require.resolve('semverint'), fileURLToPath(new URL('./dist/cjs/index.js', import.meta.url)))
  api = require('semverint')
} else {
  assert.equal(import.meta.resolve('semverint'), new URL('./dist/esm/index.js', import.meta.url).href)
  api = await import('semverint')
}

const expectedBigIntType = bigInt === 'available' ? 'function' : 'undefined'
assert.equal(typeof globalThis.BigInt, expectedBigIntType)

const precisionLoss = { name: 'PrecisionLossError', componentName: 'prerelease' }
const majorOverflow = { name: 'OverflowError', componentName: 'major' }
const cases = [
  ['stable release', {}, ['1', '2', '3', ''], '102039999999999', []],
  ['omitted prerelease argument', {}, ['1', '2', '3'], '102039999999999', []],
  ['numeric prerelease', {}, ['1', '2', '3', '123'], '102031312300000', []],
  ['text prerelease', {}, ['1', '2', '3', 'a'], '102032380000000', []],
  ['rounds down', { numPrereleaseDigits: 5 }, ['1', '2', '3', '1234'], '1020314123', [precisionLoss]],
  ['rounds up', { numPrereleaseDigits: 5 }, ['1', '2', '3', '1236'], '1020314124', [precisionLoss]],
  ['core overflow', {}, ['100', '2', '3', 'a'], '9999999999999999', [majorOverflow]],
  ['large core integer', { numMajorDigits: 16 }, ['9007199254740993', '0', '0', ''], '900719925474099300009999999999', []],
]

if (bigInt === 'available') {
  const config = { maxSemverInt: 9900002554000110n }
  const integerOverflow = { name: 'OverflowError', componentName: 'semverint' }
  cases.push(['maximum cap', config, ['99', '0', '0', 'rc.1'], '9900002554000110', [integerOverflow]])
}

function describeResult({ versionStr, errs }) {
  return { versionStr, errs: errs.map(({ name, componentName }) => ({ name, componentName })) }
}

for (const [name, config, version, versionStr, errs] of cases) {
  const expected = { versionStr, errs }
  const converter = new api.SemverIntConverter(config)
  const local = converter.semverToInt(...version)
  assert.deepEqual(describeResult(local), expected, `${name}: local converter`)

  api.setGlobalConfig(config)
  const singleton = api.semverToInt(...version)
  assert.deepEqual(describeResult(singleton), expected, `${name}: singleton`)
}
