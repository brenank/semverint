function isStrictInt(input: string): boolean {
  const integerPattern = /^(0|[1-9]\d*)$/
  return integerPattern.test(input)
}

function fmtFixedSizeNumeric(strNumIn: string, desiredDigits: number): { strNum: string; hasOverflow: boolean } {
  const result = fmtLimitSizeNumeric(strNumIn, desiredDigits)
  return { strNum: result.strNum.padStart(desiredDigits, '0'), hasOverflow: result.hasOverflow }
}

function fmtLimitSizeNumeric(strNumIn: string, desiredDigits: number): { strNum: string; hasOverflow: boolean } {
  if (!Number.isInteger(desiredDigits) || desiredDigits < 0) {
    throw new Error(`desiredLength must be an integer >= 0, got ${desiredDigits}`)
  }

  if (desiredDigits == 0) {
    return { strNum: '', hasOverflow: true }
  }

  if (!/^\d+$/.test(strNumIn)) {
    throw new Error(`strNum must be an integer >= 0, got: ${strNumIn}`)
  }

  const strNum = strNumIn.replace(/^0+/, '') || '0'
  if (strNum.length > desiredDigits) {
    return { strNum: '9'.repeat(desiredDigits), hasOverflow: true }
  }

  return { strNum, hasOverflow: false }
}

export { fmtLimitSizeNumeric, fmtFixedSizeNumeric, isStrictInt }
