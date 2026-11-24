import { fmtFixedSizeNumeric, fmtLimitSizeNumeric, isStrictInt } from './numericUtils.js'
import { prereleaseToInt } from './prereleaseUtils.js'
import { SemverIntConfig, DefaultConfig } from './types/config.js'
import { OverflowError, SemverComponent, SemverIntError } from './types/errors.js'

interface SemverIntResult {
  versionStr: string
  errs: SemverIntError[]
}

const digitFields = [
  'numMajorDigits',
  'numMinorDigits',
  'numPatchDigits',
  'numPrereleaseDigits',
  'numPrereleaseComponentDigits',
] as const

function validateConfig(cfg: SemverIntConfig): void {
  for (const field of digitFields) {
    const width = cfg[field]
    if (!Number.isSafeInteger(width) || width < 0) {
      throw new Error(`${field} must be a nonnegative safe integer.`)
    }
  }

  const totalDigits = cfg.numMajorDigits + cfg.numMinorDigits + cfg.numPatchDigits + cfg.numPrereleaseDigits
  if (!Number.isSafeInteger(totalDigits) || totalDigits === 0) {
    throw new Error('Total output width must be a positive safe integer.')
  }

  const maximum = cfg.maxSemverInt
  if (maximum !== undefined && (typeof maximum !== 'bigint' || maximum < 0)) {
    throw new Error('maxSemverInt must be a nonnegative bigint.')
  }
}

function applyMaximum(result: SemverIntResult, maximum?: bigint): SemverIntResult {
  if (maximum === undefined || BigInt(result.versionStr) <= maximum) {
    return result
  }

  result.errs.push(new OverflowError(SemverComponent.SemverInt, result.versionStr))
  return { versionStr: maximum.toString(), errs: result.errs }
}

class SemverIntConverter {
  public cfg: SemverIntConfig

  constructor(newConfig: Partial<SemverIntConfig>) {
    const newCfg = { ...DefaultConfig, ...newConfig }
    validateConfig(newCfg)
    this.cfg = newCfg
  }

  public semverToInt(majorStr: string, minorStr: string, patchStr: string, prerelease: string): SemverIntResult {
    const configured = this.cfg
    // Public configuration can change after construction. Read each field once
    // so validation and encoding use the same values, including inherited options.
    const cfg: SemverIntConfig = {
      numMajorDigits: configured.numMajorDigits,
      numMinorDigits: configured.numMinorDigits,
      numPatchDigits: configured.numPatchDigits,
      numPrereleaseDigits: configured.numPrereleaseDigits,
      numPrereleaseComponentDigits: configured.numPrereleaseComponentDigits,
      majorVersionErrors: configured.majorVersionErrors,
      minorVersionErrors: configured.minorVersionErrors,
      patchVersionErrors: configured.patchVersionErrors,
      prereleaseErrors: configured.prereleaseErrors,
      prereleaseNumericComponentErrors: configured.prereleaseNumericComponentErrors,
      maxSemverInt: configured.maxSemverInt,
      firstPrereleaseComponentToDigit: configured.firstPrereleaseComponentToDigit,
    }
    validateConfig(cfg)

    if (!isStrictInt(majorStr)) {
      throw new Error(`major version must be an integer >= 0, got: ${majorStr}`)
    }
    if (!isStrictInt(minorStr)) {
      throw new Error(`minor version must be an integer >= 0`)
    }
    if (!isStrictInt(patchStr)) {
      throw new Error(`patch version must be an integer >= 0`)
    }

    let versionStr = ''
    const errs: SemverIntError[] = []
    const majorResult = fmtLimitSizeNumeric(majorStr, cfg.numMajorDigits)
    versionStr += majorResult.strNum
    if (majorResult.hasOverflow) {
      if (cfg.majorVersionErrors == 'error') {
        errs.push(new OverflowError(SemverComponent.Major, majorStr))
      }
      versionStr += '9'.repeat(cfg.numMinorDigits + cfg.numPatchDigits + cfg.numPrereleaseDigits)
      return applyMaximum({ versionStr, errs }, cfg.maxSemverInt)
    }

    const minorResult = fmtFixedSizeNumeric(minorStr, cfg.numMinorDigits)
    versionStr += minorResult.strNum
    if (minorResult.hasOverflow) {
      if (cfg.minorVersionErrors == 'error') {
        errs.push(new OverflowError(SemverComponent.Minor, minorStr))
      }
      versionStr += '9'.repeat(cfg.numPatchDigits + cfg.numPrereleaseDigits)
      return applyMaximum({ versionStr, errs }, cfg.maxSemverInt)
    }

    const patchResult = fmtFixedSizeNumeric(patchStr, cfg.numPatchDigits)
    versionStr += patchResult.strNum
    if (patchResult.hasOverflow) {
      if (cfg.patchVersionErrors == 'error') {
        errs.push(new OverflowError(SemverComponent.Patch, patchStr))
      }
      versionStr += '9'.repeat(cfg.numPrereleaseDigits)
      return applyMaximum({ versionStr, errs }, cfg.maxSemverInt)
    }

    const prereleaseResult = prereleaseToInt(
      prerelease,
      cfg.numPrereleaseDigits,
      cfg.numPrereleaseComponentDigits,
      cfg.firstPrereleaseComponentToDigit,
      cfg.prereleaseNumericComponentErrors == 'error',
      cfg.prereleaseErrors == 'error',
    )
    versionStr += prereleaseResult.strNum
    errs.push(...prereleaseResult.errs)

    return applyMaximum({ versionStr, errs }, cfg.maxSemverInt)
  }
}

export { SemverIntConverter, SemverIntResult }
