function isStrictInt(input: string): boolean {
  const integerPattern = /^(0|[1-9]\d*)$/
  return integerPattern.test(input)
}

function fmtFixedSizeNumeric(strNumIn: string, desiredDigits: number): { strNum: string; hasOverflow: boolean } {
  const result = fmtLimitSizeNumeric(strNumIn, desiredDigits)
  if (result.strNum.length < desiredDigits) {
    return { strNum: strNumIn.padStart(desiredDigits, '0'), hasOverflow: false }
  }
  return result
}

function fmtLimitSizeNumeric(strNumIn: string, desiredDigits: number): { strNum: string; hasOverflow: boolean } {
  if (!Number.isInteger(desiredDigits) || desiredDigits < 0) {
    throw new Error(`desiredLength must be an integer >= 0, got ${desiredDigits}`)
  }

  if (desiredDigits == 0) {
    return { strNum: '', hasOverflow: true }
  }

  const num = Number(strNumIn)
  if (!Number.isInteger(num) || num < 0) {
    throw new Error(`strNum must be an integer >= 0, got: ${strNumIn}`)
  }

  if (strNumIn.length > desiredDigits) {
    const digitsInNum = Math.floor(Math.log10(Math.abs(num))) + 1
    const scaleFactorForDesiredLength = Math.pow(10, digitsInNum - desiredDigits)
    const roundedValue = Math.round(num / scaleFactorForDesiredLength) * scaleFactorForDesiredLength
    const maxValuePossible = Math.pow(10, desiredDigits) - 1
    if (roundedValue <= maxValuePossible) {
      return { strNum: String(roundedValue), hasOverflow: false }
    }

    return { strNum: String(maxValuePossible), hasOverflow: true }
  }

  return { strNum: strNumIn, hasOverflow: false }
}

export { fmtLimitSizeNumeric, fmtFixedSizeNumeric, isStrictInt }
