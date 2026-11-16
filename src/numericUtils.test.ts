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

it('preserves exact numeric digits beyond Number precision and exponent formatting limits', () => {
  expect(fmtLimitSizeNumeric('9007199254740993', 16)).toEqual({ strNum: '9007199254740993', hasOverflow: false })
  expect(fmtFixedSizeNumeric('1000000000000000000000', 22)).toEqual({ strNum: '1000000000000000000000', hasOverflow: false })
  expect(fmtLimitSizeNumeric('1000000000000000000000', 21)).toEqual({ strNum: '999999999999999999999', hasOverflow: true })
  expect(fmtLimitSizeNumeric('9'.repeat(309), 309)).toEqual({ strNum: '9'.repeat(309), hasOverflow: false })
  expect(fmtFixedSizeNumeric('9'.repeat(309), 308)).toEqual({ strNum: '9'.repeat(308), hasOverflow: true })
})

it('saturates core numeric overflow to the exact decimal width', () => {
  expect(fmtLimitSizeNumeric('999999999999999999', 17)).toEqual({ strNum: '99999999999999999', hasOverflow: true })
  expect(fmtFixedSizeNumeric('99999999999999999999999', 22)).toEqual({ strNum: '9999999999999999999999', hasOverflow: true })
})

it('normalizes leading zeros before applying numeric width limits', () => {
  expect(fmtLimitSizeNumeric('000123', 3)).toEqual({ strNum: '123', hasOverflow: false })
  expect(fmtFixedSizeNumeric('000123', 4)).toEqual({ strNum: '0123', hasOverflow: false })
  expect(fmtLimitSizeNumeric('0000', 1)).toEqual({ strNum: '0', hasOverflow: false })
})

it('rejects nondecimal numeric helper inputs', () => {
  for (const input of ['', '-1', '1.5', '1e21', ' 1']) {
    expect(() => fmtLimitSizeNumeric(input, 2)).toThrow('strNum must be an integer >= 0')
    expect(() => fmtFixedSizeNumeric(input, 2)).toThrow('strNum must be an integer >= 0')
  }
})

it('preserves empty overflow results at zero numeric width', () => {
  expect(fmtLimitSizeNumeric('0', 0)).toEqual({ strNum: '', hasOverflow: true })
  expect(fmtFixedSizeNumeric('0', 0)).toEqual({ strNum: '', hasOverflow: true })
})
