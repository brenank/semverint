function isStrictInt(input: string): boolean {
  const integerPattern = /^(0|[1-9]\d*)$/
  return integerPattern.test(input)
}

function fmtFixedSizeNumeric(strNumIn: string, desiredDigits: number): { strNum: string; hasOverflow: boolean } {
  const result = fmtLimitSizeNumeric(strNumIn, desiredDigits)
  if (result.strNum.length < desiredDigits) {
    return { strNum: result.strNum.padStart(desiredDigits, '0'), hasOverflow: false }
  }
  return result
}

function fmtLimitSizeNumeric(strNumIn: string, desiredDigits: number): { strNum: string; hasOverflow: boolean } {
  if (!Number.isSafeInteger(desiredDigits) || desiredDigits < 0) {
    throw new Error(`desiredDigits must be a nonnegative safe integer, got ${desiredDigits}`)
  }

  if (!/^\d+$/.test(strNumIn)) {
    throw new Error(`strNum must be an integer >= 0, got: ${strNumIn}`)
  }

  if (strNumIn.length > desiredDigits) {
    return { strNum: '9'.repeat(desiredDigits), hasOverflow: true }
  }

  return { strNum: strNumIn, hasOverflow: false }
}

export { fmtLimitSizeNumeric, fmtFixedSizeNumeric, isStrictInt }
