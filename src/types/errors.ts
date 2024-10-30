enum SemverComponent {
  SemverInt = 'semverint',
  Major = 'major',
  Minor = 'minor',
  Patch = 'patch',
  Prerelease = 'prerelease',
  PrereleaseComponent = 'prereleaseNumericComponent',
}

class OverflowError extends Error {
  constructor(
    public componentName: SemverComponent,
    strNum: string,
  ) {
    super(`${componentName} overflow of ${strNum}`)
    this.name = 'OverflowError'
  }
}

class PrecisionLossError extends Error {
  constructor(
    public componentName: SemverComponent,
    strNum: string,
  ) {
    super(`${componentName} precision loss of ${strNum}`)
    this.name = 'PrecisionLossError'
  }
}

type SemverIntError = PrecisionLossError | OverflowError

export { SemverComponent, SemverIntError, OverflowError, PrecisionLossError }
