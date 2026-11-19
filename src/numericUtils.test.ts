import { it, expect } from 'vitest'

import { fmtFixedSizeNumeric, fmtLimitSizeNumeric } from './numericUtils.js'

it('fmtFixedSizeNumeric function', () => {
  expect(fmtFixedSizeNumeric('123456789', 1)).toEqual({ strNum: '9', hasOverflow: true })
  expect(fmtFixedSizeNumeric('123456789', 2)).toEqual({ strNum: '99', hasOverflow: true })
  expect(fmtFixedSizeNumeric('123456789', 3)).toEqual({ strNum: '999', hasOverflow: true })
  expect(fmtFixedSizeNumeric('123456789', 4)).toEqual({ strNum: '9999', hasOverflow: true })
  expect(fmtFixedSizeNumeric('123456789', 5)).toEqual({ strNum: '99999', hasOverflow: true })
  expect(fmtFixedSizeNumeric('123456789', 6)).toEqual({ strNum: '999999', hasOverflow: true })
  expect(fmtFixedSizeNumeric('123456789', 7)).toEqual({ strNum: '9999999', hasOverflow: true })
  expect(fmtFixedSizeNumeric('123456789', 8)).toEqual({ strNum: '99999999', hasOverflow: true })
  expect(fmtFixedSizeNumeric('123456789', 9)).toEqual({ strNum: '123456789', hasOverflow: false })
  expect(fmtFixedSizeNumeric('123456789', 10)).toEqual({ strNum: '0123456789', hasOverflow: false })
  expect(fmtFixedSizeNumeric('123456789', 11)).toEqual({ strNum: '00123456789', hasOverflow: false })
  expect(fmtFixedSizeNumeric('123456789', 12)).toEqual({ strNum: '000123456789', hasOverflow: false })
  expect(fmtFixedSizeNumeric('123456789', 22)).toEqual({ strNum: '0000000000000123456789', hasOverflow: false })
})

it('fmtLimitSizeNumeric function', () => {
  expect(fmtLimitSizeNumeric('123456789', 1)).toEqual({ strNum: '9', hasOverflow: true })
  expect(fmtLimitSizeNumeric('123456789', 2)).toEqual({ strNum: '99', hasOverflow: true })
  expect(fmtLimitSizeNumeric('123456789', 3)).toEqual({ strNum: '999', hasOverflow: true })
  expect(fmtLimitSizeNumeric('123456789', 4)).toEqual({ strNum: '9999', hasOverflow: true })
  expect(fmtLimitSizeNumeric('123456789', 5)).toEqual({ strNum: '99999', hasOverflow: true })
  expect(fmtLimitSizeNumeric('123456789', 6)).toEqual({ strNum: '999999', hasOverflow: true })
  expect(fmtLimitSizeNumeric('123456789', 7)).toEqual({ strNum: '9999999', hasOverflow: true })
  expect(fmtLimitSizeNumeric('123456789', 8)).toEqual({ strNum: '99999999', hasOverflow: true })
  expect(fmtLimitSizeNumeric('123456789', 9)).toEqual({ strNum: '123456789', hasOverflow: false })
  expect(fmtLimitSizeNumeric('123456789', 10)).toEqual({ strNum: '123456789', hasOverflow: false })
  expect(fmtLimitSizeNumeric('123456789', 11)).toEqual({ strNum: '123456789', hasOverflow: false })
  expect(fmtLimitSizeNumeric('123456789', 12)).toEqual({ strNum: '123456789', hasOverflow: false })
  expect(fmtLimitSizeNumeric('123456789', 22)).toEqual({ strNum: '123456789', hasOverflow: false })
})

it('preserves exact large decimal inputs at and below the width', () => {
  const input = '900719925474099312345'
  expect(fmtLimitSizeNumeric(input, 22)).toEqual({ strNum: input, hasOverflow: false })
  expect(fmtFixedSizeNumeric(input, 21)).toEqual({ strNum: input, hasOverflow: false })
  expect(fmtFixedSizeNumeric(input, 22)).toEqual({ strNum: `0${input}`, hasOverflow: false })
})

it('saturates large decimal inputs with exactly the requested number of digits', () => {
  const result = { strNum: '9'.repeat(21), hasOverflow: true }
  expect(fmtLimitSizeNumeric('1' + '0'.repeat(21), 21)).toEqual(result)
  expect(fmtFixedSizeNumeric('9'.repeat(309), 21)).toEqual(result)
})

it('reports an overflow for a zero-width field', () => {
  expect(fmtLimitSizeNumeric('0', 0)).toEqual({ strNum: '', hasOverflow: true })
  expect(fmtFixedSizeNumeric('1', 0)).toEqual({ strNum: '', hasOverflow: true })
})

it('counts leading zeros as digits in the requested width', () => {
  expect(fmtLimitSizeNumeric('001', 3)).toEqual({ strNum: '001', hasOverflow: false })
  expect(fmtLimitSizeNumeric('001', 2)).toEqual({ strNum: '99', hasOverflow: true })
})

it.each(['', '-1', '+1', '1.0', '1e2', ' 1', '1 '])('rejects non-digit input %j', input => {
  expect(() => fmtLimitSizeNumeric(input, 3)).toThrow('strNum must be an integer >= 0')
})

it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects an invalid width %s', width => {
  expect(() => fmtFixedSizeNumeric('1', width)).toThrow('desiredDigits must be a nonnegative safe integer')
})
