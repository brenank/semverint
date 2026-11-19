import { describe, expect, it } from 'vitest'

import { SemverIntConverter } from './index.js'
import { conversionScenarios } from './test/conversionCases.js'
import { convertVersion } from './test/convertVersion.js'

for (const { name, config, cases } of conversionScenarios) {
  describe(name, () => {
    for (const { version, expectedInteger, expectedErrors } of cases) {
      it(`converts ${version} to '${expectedInteger}'`, () => {
        const converter = new SemverIntConverter(config)
        const result = convertVersion(converter, version)
        expect(result.versionStr).toBe(expectedInteger)
        expect(result.errs.map(({ name, componentName }) => ({ name, componentName }))).toEqual(expectedErrors)
      })
    }
  })
}
