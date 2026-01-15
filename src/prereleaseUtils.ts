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

  const num = Number(strNumIn)
  if (!Number.isInteger(num) || num < 0) {
    throw new Error(`strNum must be an integer >= 0, got: ${strNumIn}`)
  }

  if (strNumIn.length < desiredDigits) {
    // Pad with trailing nines (v1.0.0-beta > v1.0.0-betatest)
    return { strNum: strNumIn.padEnd(desiredDigits, '0'), hasPrecisionLoss: false }
  }

  if (strNumIn.length > desiredDigits) {
    const digitsInNum = Math.floor(Math.log10(Math.abs(num))) + 1

    // if strNumIn has leading zeros, preserve them
    const numLeadingZeros = strNumIn.match(/^0*/)?.[0].length || 0
    const scaleFactorForDigits = Math.pow(10, digitsInNum + numLeadingZeros)
    const decimalNum = num / scaleFactorForDigits
    return { strNum: decimalNum.toFixed(desiredDigits).slice(2), hasPrecisionLoss: true }
  }

  return { strNum: strNumIn, hasPrecisionLoss: false }
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

  for (const [i, component] of prerelease.split('.').entries()) {
    if (i == 0 && firstPrereleaseComponentToDigit !== undefined) {
      // firstPrereleaseComponentToDigit 0 index is reserved for no match
      const firstDigit = firstPrereleaseComponentToDigit.findIndex(v => v == component) + 1
      prereleaseNumber += firstDigit
      continue
    }

    if (isStrictInt(component)) {
      let num = Number(component)

      // limit numeric component to avoid overlapping with ascii
      const minAsciiComponent = prereleaseCharToPrecedence['0']
        .repeat(Math.max(1, desiredComponentDigits / 2))
        .slice(0, desiredComponentDigits)
      const maxNumericComponentNum = Number(minAsciiComponent) - 1
      if (num > maxNumericComponentNum) {
        num = maxNumericComponentNum
      }

      const result = fmtFixedSizeNumeric(String(num), desiredComponentDigits)
      prereleaseNumber += result.strNum
      if (result.hasOverflow) {
        const remainingDigits = desiredDigits - prereleaseNumber.length
        if (remainingDigits > 0) {
          prereleaseNumber += '9'.repeat(remainingDigits)
        }
        errs.push(new OverflowError(SemverComponent.PrereleaseComponent, component))
      }
      break
    }

    let asciiComponentNum = ''
    for (const char of component) {
      asciiComponentNum += prereleaseCharToPrecedence[char]
    }

    if (asciiComponentNum.length > desiredComponentDigits) {
      asciiComponentNum = asciiComponentNum.slice(0, desiredComponentDigits)
      prereleaseNumber += asciiComponentNum
      const remainingDigits = desiredDigits - prereleaseNumber.length
      if (remainingDigits > 0) {
        prereleaseNumber += '9'.repeat(remainingDigits)
      }
      errs.push(new OverflowError(SemverComponent.PrereleaseComponent, component))
      break
    }

    prereleaseNumber += asciiComponentNum
    if (prereleaseNumber.length >= desiredDigits) {
      break
    }
  }

  const prereleaseResult = fmtFixedSizePrerelease(prereleaseNumber, desiredDigits)
  if (prereleaseResult.hasPrecisionLoss) {
    errs.push(new PrecisionLossError(SemverComponent.Prerelease, prerelease))
  }
  return { strNum: prereleaseResult.strNum, errs }
}

export { prereleaseToInt, fmtFixedSizePrerelease }
