import { fmtFixedSizeNumeric, isStrictInt } from './numericUtils.js'
import { OverflowError, PrecisionLossError, SemverComponent, SemverIntError } from './types/errors.js'

const prereleaseCharToPrecedence: Record<string, string> = {
  '0': '36',
  '1': '37',
  '2': '38',
  '3': '39',
  '4': '40',
  '5': '41',
  '6': '42',
  '7': '43',
  '8': '44',
  '9': '45',
  '-': '46',
  A: '47',
  B: '48',
  C: '49',
  D: '50',
  E: '51',
  F: '52',
  G: '53',
  H: '54',
  I: '55',
  J: '56',
  K: '57',
  L: '58',
  M: '59',
  N: '60',
  O: '61',
  P: '62',
  Q: '63',
  R: '64',
  S: '65',
  T: '66',
  U: '67',
  V: '68',
  W: '69',
  X: '70',
  Y: '71',
  Z: '72',
  a: '73',
  b: '74',
  c: '75',
  d: '76',
  e: '77',
  f: '78',
  g: '79',
  h: '80',
  i: '81',
  j: '82',
  k: '83',
  l: '84',
  m: '85',
  n: '86',
  o: '87',
  p: '88',
  q: '89',
  r: '90',
  s: '91',
  t: '92',
  u: '93',
  v: '94',
  w: '95',
  x: '96',
  y: '97',
  z: '98',
}

function fmtFixedSizePrerelease(strNumIn: string, desiredDigits: number): { strNum: string; hasPrecisionLoss: boolean } {
  if (!Number.isInteger(desiredDigits) || desiredDigits <= 0) {
    throw new Error(`desiredLength must be an integer > 0, got ${desiredDigits}`)
  }

  if (!/^\d+$/.test(strNumIn)) {
    throw new Error(`strNum must be an integer >= 0, got: ${strNumIn}`)
  }

  if (strNumIn.length <= desiredDigits) {
    return { strNum: strNumIn.padEnd(desiredDigits, '0'), hasPrecisionLoss: false }
  }

  let strNum = strNumIn.slice(0, desiredDigits)
  if (strNumIn[desiredDigits] >= '5') {
    const rounded = String(BigInt(strNum) + 1n)
    strNum = rounded.length > desiredDigits ? '9'.repeat(desiredDigits) : rounded.padStart(desiredDigits, '0')
  }
  return { strNum, hasPrecisionLoss: true }
}

function prereleaseToInt(
  prerelease: string,
  desiredDigits: number,
  desiredComponentDigits: number,
  firstPrereleaseComponentToDigit?: [string, string, string, string, string, string, string, string, string],
): {
  strNum: string
  errs: SemverIntError[]
} {
  let prereleaseNumber = ''
  const errs: SemverIntError[] = []

  if (!prerelease || prerelease == '') {
    return { strNum: '9'.repeat(desiredDigits), errs }
  }

  if (desiredDigits == 0) {
    if (prerelease.length > 0) {
      errs.push(new OverflowError(SemverComponent.Prerelease, prerelease))
    }
    return { strNum: '', errs }
  }

  const components = prerelease.split('.')
  let hasUnprocessedComponents = false
  for (const [i, component] of components.entries()) {
    let hasComponentOverflow = false
    if (i == 0 && firstPrereleaseComponentToDigit !== undefined) {
      const firstDigit = firstPrereleaseComponentToDigit.findIndex(v => v == component) + 1
      prereleaseNumber += firstDigit
    } else if (isStrictInt(component)) {
      if (desiredComponentDigits == 0) {
        hasComponentOverflow = true
      } else {
        // Preserve the v2 range, including its shorter ceiling for odd component widths.
        const minAsciiComponent = prereleaseCharToPrecedence['0']
          .repeat(Math.max(1, desiredComponentDigits / 2))
          .slice(0, desiredComponentDigits)
        const maxNumericComponent = String(BigInt(minAsciiComponent) - 1n)
        hasComponentOverflow =
          component.length > maxNumericComponent.length ||
          (component.length == maxNumericComponent.length && component > maxNumericComponent)
        const limitedComponent = hasComponentOverflow ? maxNumericComponent : component
        prereleaseNumber += fmtFixedSizeNumeric(limitedComponent, desiredComponentDigits).strNum
      }
    } else {
      let asciiComponent = ''
      for (const char of component) {
        asciiComponent += prereleaseCharToPrecedence[char]
      }
      hasComponentOverflow = asciiComponent.length > desiredComponentDigits
      prereleaseNumber += asciiComponent.slice(0, desiredComponentDigits)
    }

    if (hasComponentOverflow) {
      prereleaseNumber = prereleaseNumber.padEnd(desiredDigits, '9')
      errs.push(new OverflowError(SemverComponent.PrereleaseComponent, component))
    }

    if (hasComponentOverflow || prereleaseNumber.length >= desiredDigits) {
      hasUnprocessedComponents = i < components.length - 1
      break
    }
  }

  const prereleaseResult = fmtFixedSizePrerelease(prereleaseNumber, desiredDigits)
  const stableSentinel = '9'.repeat(desiredDigits)
  const reachesStableSentinel = prereleaseResult.strNum == stableSentinel
  if (reachesStableSentinel) {
    // A nonempty prerelease must remain below the corresponding stable release.
    prereleaseResult.strNum = `${'9'.repeat(desiredDigits - 1)}8`
  }
  if (prereleaseResult.hasPrecisionLoss || hasUnprocessedComponents || reachesStableSentinel) {
    errs.push(new PrecisionLossError(SemverComponent.Prerelease, prerelease))
  }
  return { strNum: prereleaseResult.strNum, errs }
}

export { prereleaseToInt, fmtFixedSizePrerelease }
