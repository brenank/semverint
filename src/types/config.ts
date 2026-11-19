interface SemverIntConfig {
  numMajorDigits: number
  numMinorDigits: number
  numPatchDigits: number
  // Total prerelease width, including identifier markers, numeric lengths, and text terminators.
  numPrereleaseDigits: number
  // Payload limit: decimal digits for numbers or two digits per text character.
  numPrereleaseComponentDigits: number

  majorVersionErrors: 'error' | 'ignore'
  minorVersionErrors: 'error' | 'ignore'
  patchVersionErrors: 'error' | 'ignore'
  prereleaseErrors: 'error' | 'ignore'
  prereleaseNumericComponentErrors: 'error' | 'ignore'
  // Nonnegative capacity of the destination system; applies to every conversion result.
  maxSemverInt?: bigint

  // Override mapping of the first prerelease component to a single digit
  // semver digit will be the index+1 of the matching string
  // semver digit will be 0 if no matches
  // Further identifiers retain their numeric/text markers and boundaries.
  // Note: this may not adhere to semver spec depending on what is passed in
  firstPrereleaseComponentToDigit?: [string, string, string, string, string, string, string, string, string]
}

const DefaultConfig: SemverIntConfig = {
  numMajorDigits: 2,
  numMinorDigits: 2,
  numPatchDigits: 2,
  numPrereleaseDigits: 10,
  numPrereleaseComponentDigits: 6,

  majorVersionErrors: 'error',
  minorVersionErrors: 'error',
  patchVersionErrors: 'error',
  prereleaseErrors: 'error',
  prereleaseNumericComponentErrors: 'error',
}

export { SemverIntConfig, DefaultConfig }
