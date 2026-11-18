import {
  DefaultConfig,
  SemverIntConverter,
  semverToInt,
  setGlobalConfig,
  type SemverIntConfig,
  type SemverIntError,
  type SemverIntResult,
} from 'semverint'

const config: Partial<SemverIntConfig> = { ...DefaultConfig, maxSemverInt: 100n }
setGlobalConfig(config)

const converter = new SemverIntConverter(config)
export const result: SemverIntResult = converter.semverToInt('1', '2', '3', '')
export const errors: SemverIntError[] = semverToInt('1', '2', '3', '').errs
