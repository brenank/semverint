import semverint = require('semverint')

const config: Partial<semverint.SemverIntConfig> = { ...semverint.DefaultConfig, maxSemverInt: 100n }
semverint.setGlobalConfig(config)

const converter = new semverint.SemverIntConverter(config)
export const result: semverint.SemverIntResult = converter.semverToInt('1', '2', '3', '')
export const errors: semverint.SemverIntError[] = semverint.semverToInt('1', '2', '3', '').errs
