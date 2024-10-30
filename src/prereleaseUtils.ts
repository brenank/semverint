import { fmtFixedSizeNumeric, isStrictInt } from './numericUtils'
import { OverflowError, PrecisionLossError, SemverComponent, SemverIntError } from './types/errors'

const prereleaseCharToPrecedence: Record<string, string> = {
  '0': '37',
  '1': '38',
  '2': '39',
  '3': '40',
  '4': '41',
  '5': '42',
  '6': '43',
  '7': '44',
  '8': '45',
  '9': '46',
  '-': '47',
  A: '48',
  B: '49',
  C: '50',
  D: '51',
  E: '52',
  F: '53',
  G: '54',
  H: '55',
  I: '56',
  J: '57',
  K: '58',
  L: '59',
  M: '60',
  N: '61',
  O: '62',
  P: '63',
  Q: '64',
  R: '65',
  S: '66',
  T: '67',
  U: '68',
  V: '69',
  W: '70',
  X: '71',
  Y: '72',
  Z: '73',
  a: '74',
  b: '75',
  c: '76',
  d: '77',
  e: '78',
  f: '79',
  g: '80',
  h: '81',
  i: '82',
  j: '83',
  k: '84',
  l: '85',
  m: '86',
  n: '87',
  o: '88',
  p: '89',
  q: '90',
  r: '91',
  s: '92',
  t: '93',
  u: '94',
  v: '95',
  w: '96',
  x: '97',
  y: '98',
  z: '99',
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
