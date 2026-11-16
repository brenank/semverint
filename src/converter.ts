import { fmtFixedSizeNumeric, fmtLimitSizeNumeric, isStrictInt } from './numericUtils.js'
import { prereleaseToInt } from './prereleaseUtils.js'
import { SemverIntConfig, DefaultConfig } from './types/config.js'
import { OverflowError, SemverComponent, SemverIntError } from './types/errors.js'

interface SemverIntResult {
  versionStr: string
  errs: SemverIntError[]
}

class SemverIntConverter {
  public cfg: SemverIntConfig

  constructor(newConfig: Partial<SemverIntConfig>) {
    const newCfg = { ...DefaultConfig, ...newConfig }
    const digitFields = [
      'numMajorDigits',
      'numMinorDigits',
      'numPatchDigits',
      'numPrereleaseDigits',
      'numPrereleaseComponentDigits',
    ] as const
    for (const field of digitFields) {
      if (!Number.isInteger(newCfg[field]) || newCfg[field] < 0) {
        throw new Error(`${field} must be an integer greater than or equal to zero.`)
      }
    }
    if (newCfg.maxSemverInt !== undefined && (typeof newCfg.maxSemverInt !== 'bigint' || newCfg.maxSemverInt < 0n)) {
      throw new Error('maxSemverInt must be a bigint greater than or equal to zero.')
    }

    this.cfg = newCfg
  }

  public semverToInt(majorStr: string, minorStr: string, patchStr: string, prerelease: string): SemverIntResult {
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
    const coreComponents = [
      { value: majorStr, digits: this.cfg.numMajorDigits, component: SemverComponent.Major, errors: this.cfg.majorVersionErrors },
      { value: minorStr, digits: this.cfg.numMinorDigits, component: SemverComponent.Minor, errors: this.cfg.minorVersionErrors },
      { value: patchStr, digits: this.cfg.numPatchDigits, component: SemverComponent.Patch, errors: this.cfg.patchVersionErrors },
    ]
    let hasCoreOverflow = false
    for (const [index, component] of coreComponents.entries()) {
      const result =
        index == 0
          ? fmtLimitSizeNumeric(component.value, component.digits)
          : fmtFixedSizeNumeric(component.value, component.digits)
      versionStr += result.strNum
      if (result.hasOverflow) {
        if (component.errors == 'error') {
          errs.push(new OverflowError(component.component, component.value))
        }
        const remainingCoreDigits = coreComponents.slice(index + 1).reduce((total, remaining) => total + remaining.digits, 0)
        versionStr += '9'.repeat(remainingCoreDigits + this.cfg.numPrereleaseDigits)
        hasCoreOverflow = true
        break
      }
    }

    if (!hasCoreOverflow) {
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
    }

    versionStr = versionStr || '0'
    if (this.cfg.maxSemverInt !== undefined && BigInt(versionStr) > this.cfg.maxSemverInt) {
      errs.push(new OverflowError(SemverComponent.SemverInt, versionStr))
      versionStr = String(this.cfg.maxSemverInt)
    }

    return { versionStr, errs }
  }
}

export { SemverIntConverter, SemverIntResult }
