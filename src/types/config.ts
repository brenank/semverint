interface SemverIntConfig {
  numMajorDigits: number
  numMinorDigits: number
  numPatchDigits: number
  numPrereleaseDigits: number
  numPrereleaseComponentDigits: number

  majorVersionErrors: 'error' | 'ignore'
  minorVersionErrors: 'error' | 'ignore'
  patchVersionErrors: 'error' | 'ignore'
  prereleaseErrors: 'error' | 'ignore'
  prereleaseNumericComponentErrors: 'error' | 'ignore'
  maxSemverInt?: bigint

  // Override mapping of the first prerelease component to a single digit
  // semver digit will be the index+1 of the matching string
  // semver digit will be 0 if no matches
  // further prerelease components are converted to ascii codes (2 digits per character)
  // Note: this may not adhere to semver spec depending on what is passed in
  firstPrereleaseComponentToDigit?: [string, string, string, string, string, string, string, string, string]
}

const DefaultConfig: SemverIntConfig = {
  numMajorDigits: 3,
  numMinorDigits: 3,
  numPatchDigits: 3,
  numPrereleaseDigits: 6,
  numPrereleaseComponentDigits: 4,

  majorVersionErrors: 'error',
  minorVersionErrors: 'error',
  patchVersionErrors: 'error',
  prereleaseErrors: 'error',
  prereleaseNumericComponentErrors: 'error',
}

export { SemverIntConfig, DefaultConfig }
