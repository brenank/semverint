import { readFileSync } from 'fs'
import * as path from 'path'
import { describe, it, expect } from 'vitest'

import { SemverIntConverter, SemverIntResult } from './index.js'

const testPath: string = path.join(__dirname, 'test')
const expectedTestPath: string = path.join(testPath, 'expected')

function testSemverToIntWithTestName(converter: SemverIntConverter, inputFileName: string, testname: string) {
  // Read and parse the input file line-by-line
  const inputFilePath = path.join(testPath, 'input', inputFileName)
  const inputLines = readFileSync(inputFilePath, 'utf-8').split('\n')

  // Process each line using semverToInt
  const semverRegex = RegExp(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/,
  )

  const actuals: SemverIntResult[] = []
  for (const [i, line] of inputLines.entries()) {
    it(`convert ${i + 1} ${line}`, () => {
      const result = semverRegex.exec(line)
      if (!result) {
        throw new Error(`failed to parse semver`)
      }
      var actual = converter.semverToInt(result[1], result[2], result[3], result[4])
      actuals[i] = actual
    })
  }

  let previousNumber = -1
  for (const [i, line] of inputLines.entries()) {
    it(`precedence ${i + 1} ${line}`, () => {
      const actualNum = Number(actuals[i].versionStr)
      expect(actualNum).toBeGreaterThanOrEqual(previousNumber)
      previousNumber = actualNum
    })
  }

  it(`expected values are correct`, async () => {
    const expectedFilePath = path.join(expectedTestPath, `${testname}.txt`)
    await expect(actuals.map(r => JSON.stringify(r)).join('\n')).toMatchFileSnapshot(expectedFilePath)
  })
}

describe('when', () => {
  const converter = new SemverIntConverter({})
  testSemverToIntWithTestName(converter, 'semvers.txt', 'default')
})

describe('when custom_digits', () => {
  const converter = new SemverIntConverter({ numMajorDigits: 2, numMinorDigits: 5, numPatchDigits: 1, numPrereleaseDigits: 7 })
  testSemverToIntWithTestName(converter, 'semvers.txt', 'custom_digits')
})

describe('when prerelease_errors', () => {
  const converter = new SemverIntConverter({
    numPrereleaseComponentDigits: 1,
    prereleaseNumericComponentErrors: 'error',
    prereleaseErrors: 'error',
  })
  testSemverToIntWithTestName(converter, 'semvers.txt', 'prerelease_errors')
})

describe('when no_all', () => {
  const converter = new SemverIntConverter({ numMajorDigits: 0, numMinorDigits: 0, numPatchDigits: 0, numPrereleaseDigits: 0 })
  testSemverToIntWithTestName(converter, 'semvers.txt', 'no_all')
})

describe('when no_major', () => {
  const converter = new SemverIntConverter({ numMajorDigits: 0 })
  testSemverToIntWithTestName(converter, 'semvers.txt', 'no_major')
})

describe('when no_minor', () => {
  const converter = new SemverIntConverter({ numMinorDigits: 0 })
  testSemverToIntWithTestName(converter, 'semvers.txt', 'no_minor')
})

describe('when no_patch', () => {
  const converter = new SemverIntConverter({ numPatchDigits: 0 })
  testSemverToIntWithTestName(converter, 'semvers.txt', 'no_patch')
})

describe('when no_prerelease', () => {
  const converter = new SemverIntConverter({ numPrereleaseDigits: 0, prereleaseErrors: 'error' })
  testSemverToIntWithTestName(converter, 'semvers.txt', 'no_prerelease')
})

describe('when semvers_simple', () => {
  const converter = new SemverIntConverter({
    firstPrereleaseComponentToDigit: ['alpha', 'alpha-a', 'alpha0', 'beta', 'DEV-SNAPSHOT', 'rc', 'rc12', 'rc3', 'prerelease'],
  })
  testSemverToIntWithTestName(converter, 'semvers_simple.txt', 'semvers_simple')
})

describe('when max_semverint', () => {
  const converter = new SemverIntConverter({
    maxSemverInt: 9223372036854775807n,
    numMajorDigits: 3,
    numMinorDigits: 3,
    numPatchDigits: 13,
    numPrereleaseDigits: 0,
    prereleaseErrors: 'ignore',
    prereleaseNumericComponentErrors: 'ignore',
  })
  testSemverToIntWithTestName(converter, 'semvers.txt', 'max_semverint')
})
