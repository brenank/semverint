import { fmtFixedSizeNumeric, fmtLimitSizeNumeric, isStrictInt } from './numericUtils'
import { prereleaseToInt } from './prereleaseUtils'
import { SemverIntConfig, DefaultConfig } from './types/config'
import { OverflowError, SemverComponent, SemverIntError } from './types/errors'

interface SemverIntResult {
  versionStr: string
  errs: SemverIntError[]
}

class SemverIntConverter {
  public cfg: SemverIntConfig

  constructor(newConfig: Partial<SemverIntConfig>) {
    const newCfg = { ...DefaultConfig, ...newConfig }

    if (newCfg.numMajorDigits < 0) {
      throw new Error('numMajorDigits must be greater than or equal to zero.')
    }
    if (newCfg.numMinorDigits < 0) {
      throw new Error('numMinorDigits must be greater than or equal to zero.')
    }
    if (newCfg.numPatchDigits < 0) {
      throw new Error('numPatchDigits must be greater than or equal to zero.')
    }
    if (newCfg.numPrereleaseDigits < 0) {
      throw new Error('numPrereleaseDigits must be greater than or equal to zero.')
    }
    if (newCfg.numPrereleaseComponentDigits < 0) {
      throw new Error('numPrereleaseNumericComponentDigits must be greater than or equal to zero.')
    }

    this.cfg = newCfg
  }

  public semverToInt(majorStr: string, minorStr: string, patchStr: string, prerelease: string): SemverIntResult {
    const major = Number(majorStr)
    const minor = Number(minorStr)
    const patch = Number(patchStr)
    if (!isStrictInt(majorStr) || major < 0) {
      throw new Error(`major version must be an integer >= 0, got: ${majorStr}`)
    }
    if (!isStrictInt(minorStr) || minor < 0) {
      throw new Error(`minor version must be an integer >= 0`)
    }
    if (!isStrictInt(patchStr) || patch < 0) {
      throw new Error(`patch version must be an integer >= 0`)
    }

    let versionStr = ''
    const errs: SemverIntError[] = []
    const majorResult = fmtLimitSizeNumeric(majorStr, this.cfg.numMajorDigits)
    versionStr += majorResult.strNum
    if (majorResult.hasOverflow) {
      if (this.cfg.majorVersionErrors == 'error') {
        errs.push(new OverflowError(SemverComponent.Major, majorStr))
      }
      versionStr += '9'.repeat(this.cfg.numMinorDigits + this.cfg.numPatchDigits + this.cfg.numPrereleaseDigits)
      return { versionStr, errs }
    }

    const minorResult = fmtFixedSizeNumeric(minorStr, this.cfg.numMinorDigits)
    versionStr += minorResult.strNum
    if (minorResult.hasOverflow) {
      if (this.cfg.minorVersionErrors == 'error') {
        errs.push(new OverflowError(SemverComponent.Minor, minorStr))
      }
      versionStr += '9'.repeat(this.cfg.numPatchDigits + this.cfg.numPrereleaseDigits)
      return { versionStr, errs }
    }

    const patchResult = fmtFixedSizeNumeric(patchStr, this.cfg.numPatchDigits)
    versionStr += patchResult.strNum
    if (patchResult.hasOverflow) {
      if (this.cfg.patchVersionErrors == 'error') {
        errs.push(new OverflowError(SemverComponent.Patch, patchStr))
      }
      versionStr += '9'.repeat(this.cfg.numPrereleaseDigits)
      return { versionStr, errs }
    }

    const prereleaseResult = prereleaseToInt(
      prerelease,
      this.cfg.numPrereleaseDigits,
      this.cfg.numPrereleaseComponentDigits,
      this.cfg.firstPrereleaseComponentToDigit,
    )
    versionStr += prereleaseResult.strNum
    errs.push(
      ...prereleaseResult.errs.filter(
        err =>
          (this.cfg.prereleaseErrors == 'error' && err.componentName == SemverComponent.Prerelease) ||
          (this.cfg.prereleaseNumericComponentErrors == 'error' && err.componentName == SemverComponent.PrereleaseComponent),
      ),
    )

    if (this.cfg.maxSemverInt && BigInt(versionStr) > this.cfg.maxSemverInt) {
      errs.push(new OverflowError(SemverComponent.SemverInt, versionStr))
      versionStr = String(this.cfg.maxSemverInt)
    }

    return { versionStr, errs }
  }
}

export { SemverIntConverter, SemverIntResult }
