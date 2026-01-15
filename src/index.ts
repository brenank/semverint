import { SemverIntConverter, SemverIntResult } from './converter.js'
import { SemverIntConfig, DefaultConfig } from './types/config.js'
import { SemverIntError } from './types/errors.js'

let singleton: SemverIntConverter = new SemverIntConverter(DefaultConfig)

function setGlobalConfig(newConfig: Partial<SemverIntConfig>) {
  singleton = new SemverIntConverter(newConfig)
}

function semverToInt(majorStr: string, minorStr: string, patchStr: string, prerelease: string): SemverIntResult {
  return singleton.semverToInt(majorStr, minorStr, patchStr, prerelease)
}

export { semverToInt, setGlobalConfig, SemverIntConfig, DefaultConfig, SemverIntConverter, SemverIntResult, SemverIntError }
