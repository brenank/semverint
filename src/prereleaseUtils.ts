import { isStrictInt } from './numericUtils.js'
import { OverflowError, PrecisionLossError, SemverComponent, SemverIntError } from './types/errors.js'

const prereleaseAlphabet = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
// Reserve 00 for the end of a text identifier so a prefix sorts before any extension.
const prereleaseCharToPrecedence: Record<string, string> = {}
for (let index = 0; index < prereleaseAlphabet.length; index++) {
  const char = prereleaseAlphabet[index]
  const rankDigits = String(index + 1).padStart(2, '0')
  prereleaseCharToPrecedence[char] = rankDigits
}

function incrementDecimalString(decimalDigits: string): string {
  let lastNonNineIndex = decimalDigits.length - 1
  while (lastNonNineIndex >= 0 && decimalDigits[lastNonNineIndex] == '9') {
    lastNonNineIndex -= 1
  }
  if (lastNonNineIndex < 0) {
    return '1' + '0'.repeat(decimalDigits.length)
  }

  // Carry through trailing nines: 1299 becomes 1300, preserving any leading zeros.
  const prefix = decimalDigits.slice(0, lastNonNineIndex)
  const incrementedDigit = Number(decimalDigits[lastNonNineIndex]) + 1
  const numTrailingNines = decimalDigits.length - lastNonNineIndex - 1
  return prefix + String(incrementedDigit) + '0'.repeat(numTrailingNines)
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
    const roundedDigits = incrementDecimalString(strNum)
    if (roundedDigits.length > desiredDigits) {
      // Rounding 999 to 1000 must not make the result wider than its digit budget.
      strNum = '9'.repeat(desiredDigits)
    } else {
      strNum = roundedDigits
    }
  }
  return { strNum, hasPrecisionLoss: true }
}

function prereleaseToInt(
  prerelease: string,
  desiredDigits: number,
  desiredComponentDigits: number,
  firstPrereleaseComponentToDigit?: [string, string, string, string, string, string, string, string, string],
  reportComponentErrors = true,
): {
  strNum: string
  errs: SemverIntError[]
} {
  let prereleaseNumber = ''
  const errs: SemverIntError[] = []

  if (!prerelease) {
    return { strNum: '9'.repeat(desiredDigits), errs }
  }

  if (desiredDigits == 0) {
    errs.push(new OverflowError(SemverComponent.Prerelease, prerelease))
    return { strNum: '', errs }
  }

  const numericLengthWidth = String(desiredComponentDigits).length
  const components = prerelease.split('.')
  let hasOmittedComponents = false
  for (const [i, component] of components.entries()) {
    let hasComponentOverflow = false
    if (i == 0 && firstPrereleaseComponentToDigit !== undefined) {
      const firstDigit = firstPrereleaseComponentToDigit.findIndex(v => v == component) + 1
      prereleaseNumber += firstDigit
    } else if (isStrictInt(component)) {
      hasComponentOverflow = component.length > desiredComponentDigits
      let numericDigits = component
      if (hasComponentOverflow) {
        numericDigits = '9'.repeat(desiredComponentDigits)
      }
      // Compare digit counts before payloads to preserve numeric magnitude without parsing the identifier.
      const digitCount = String(numericDigits.length).padStart(numericLengthWidth, '0')
      prereleaseNumber += '1' + digitCount + numericDigits
    } else {
      hasComponentOverflow = component.length * 2 > desiredComponentDigits
      const charsToEncode = Math.min(component.length, Math.ceil(desiredComponentDigits / 2))
      let textDigits = ''
      for (let charIndex = 0; charIndex < charsToEncode; charIndex++) {
        const char = component[charIndex]
        const rankDigits = prereleaseCharToPrecedence[char]
        if (rankDigits === undefined) {
          throw new Error(`prerelease identifier must contain only ASCII letters, digits, or hyphens, got: ${component}`)
        }
        textDigits += rankDigits
      }
      if (hasComponentOverflow) {
        textDigits = textDigits.slice(0, desiredComponentDigits)
      } else {
        textDigits += '00'
      }
      prereleaseNumber += '2' + textDigits
    }

    if (hasComponentOverflow) {
      prereleaseNumber = prereleaseNumber.padEnd(desiredDigits, '9')
      if (reportComponentErrors) {
        errs.push(new OverflowError(SemverComponent.PrereleaseComponent, component))
      }
    }

    if (hasComponentOverflow || prereleaseNumber.length >= desiredDigits) {
      hasOmittedComponents = i < components.length - 1
      break
    }
  }

  const prereleaseResult = fmtFixedSizePrerelease(prereleaseNumber, desiredDigits)
  // Versions without a prerelease label use all nines in this field.
  const matchesStableReleaseDigits = /^9+$/.test(prereleaseResult.strNum)
  if (matchesStableReleaseDigits) {
    // Stay below the stable release by replacing its final nine with eight: 999 becomes 998.
    prereleaseResult.strNum = prereleaseResult.strNum.slice(0, -1) + '8'
  }
  if (prereleaseResult.hasPrecisionLoss || hasOmittedComponents || matchesStableReleaseDigits) {
    errs.push(new PrecisionLossError(SemverComponent.Prerelease, prerelease))
  }
  return { strNum: prereleaseResult.strNum, errs }
}

export { prereleaseToInt, fmtFixedSizePrerelease }
