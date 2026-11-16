import { isStrictInt } from './numericUtils.js'
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
  const firstDiscardedDigit = strNumIn[desiredDigits]
  if (firstDiscardedDigit >= '5') {
    // BigInt keeps rounding exact even when the digits exceed Number's precision.
    const roundedNumber = BigInt(strNum) + 1n
    const roundedDigits = roundedNumber.toString()
    if (roundedDigits.length > desiredDigits) {
      // Rounding 999 to 1000 must not make the result wider than its digit budget.
      strNum = '9'.repeat(desiredDigits)
    } else {
      strNum = roundedDigits.padStart(desiredDigits, '0')
    }
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
      if (!Number.isInteger(desiredComponentDigits) || desiredComponentDigits < 0) {
        throw new Error(`desiredLength must be an integer >= 0, got ${desiredComponentDigits}`)
      }
      if (desiredComponentDigits == 0) {
        hasComponentOverflow = true
      } else {
        // Numeric identifiers must stay below the character codes. Keep the existing
        // limit calculation, including odd widths, so stored encodings stay compatible.
        const lowestCharacterCode = prereleaseCharToPrecedence['0']
        const numCharacterCodes = Math.max(1, Math.floor(desiredComponentDigits / 2))
        const repeatedCharacterCodes = lowestCharacterCode.repeat(numCharacterCodes)
        const minTextComponent = repeatedCharacterCodes.slice(0, desiredComponentDigits)
        const maxNumericComponent = (BigInt(minTextComponent) - 1n).toString()

        // Compare decimal strings without converting large identifiers to Number.
        // More digits means a larger number; equal-length strings can be compared directly.
        if (component.length > maxNumericComponent.length) {
          hasComponentOverflow = true
        } else if (component.length == maxNumericComponent.length) {
          hasComponentOverflow = component > maxNumericComponent
        }

        let numericDigits = component
        if (hasComponentOverflow) {
          numericDigits = maxNumericComponent
        }
        prereleaseNumber += numericDigits.padStart(desiredComponentDigits, '0')
      }
    } else {
      let asciiComponent = ''
      for (const char of component) {
        asciiComponent += prereleaseCharToPrecedence[char]
      }
      hasComponentOverflow = asciiComponent.length > desiredComponentDigits
      if (hasComponentOverflow) {
        asciiComponent = asciiComponent.slice(0, desiredComponentDigits)
      }
      prereleaseNumber += asciiComponent
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
  // Versions without a prerelease label use all nines in this field.
  const digitsForStableRelease = '9'.repeat(desiredDigits)
  const matchesStableReleaseDigits = prereleaseResult.strNum == digitsForStableRelease
  if (matchesStableReleaseDigits) {
    // A prerelease must sort below the same version without a prerelease label.
    const largestPrereleaseNumber = BigInt(digitsForStableRelease) - 1n
    prereleaseResult.strNum = largestPrereleaseNumber.toString()
  }
  if (prereleaseResult.hasPrecisionLoss || hasUnprocessedComponents || matchesStableReleaseDigits) {
    errs.push(new PrecisionLossError(SemverComponent.Prerelease, prerelease))
  }
  return { strNum: prereleaseResult.strNum, errs }
}

export { prereleaseToInt, fmtFixedSizePrerelease }
