import { describe, it, expect } from 'vitest'

import { semverint } from './index'

describe('greet function', () => {
  it('should greet the name correctly', () => {
    expect(semverint.greet('Alice')).toBe('Hello, Alice!')
  })
})
