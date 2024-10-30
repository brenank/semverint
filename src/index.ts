import { SemverIntConverter, SemverIntResult } from './converter'
import { SemverIntConfig, DefaultConfig } from './types/config'
import { SemverIntError } from './types/errors'

let singleton: SemverIntConverter = new SemverIntConverter(DefaultConfig)

function setGlobalConfig(newConfig: Partial<SemverIntConfig>) {
  singleton = new SemverIntConverter(newConfig)
}

function semverToInt(majorStr: string, minorStr: string, patchStr: string, prerelease: string): SemverIntResult {
  return singleton.semverToInt(majorStr, minorStr, patchStr, prerelease)
}

export { semverToInt, setGlobalConfig, SemverIntConfig, DefaultConfig, SemverIntConverter, SemverIntResult, SemverIntError }
