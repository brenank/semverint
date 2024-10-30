import { it, expect } from 'vitest'

import { fmtFixedSizeNumeric, fmtLimitSizeNumeric } from './numericUtils'

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
