# Semver Integer Converter

A TypeScript utility for converting [semantic versioning (SemVer)](https://semver.org) strings into integer representations. This
can be used for version comparison in systems that do not natively support semver.

## Features

- Configurable number of digits for each SemVer component (major, minor, patch, prerelease).
- Error handling for overflow scenarios for each version component.
- Supports mapping common prerelease tags (like "alpha", "beta") to a specific digit.
- Converts additional prerelease components to two-digit ASCII codes.
- Provides flexible error handling for different version components.

## Installation

```bash
npm install semverint
```

## Usage

### Importing

```typescript
import { semverToInt, setGlobalConfig, SemverIntConfig, DefaultConfig, SemverIntConverter, SemverIntError } from 'semverint'
```

### Convert a SemVer String to an Integer

```typescript
const result = semverToInt('1', '2', '3', 'alpha.1')
console.log(result.versionStr) // The integer representation as a string
result.errs.forEach(error => {
  console.error(error.message)
})
```

### Set Global Configuration

You can adjust the global configuration for all conversions:

```typescript
setGlobalConfig({
  numMajorDigits: 2,
  numMinorDigits: 2,
  numPatchDigits: 2,
  numPrereleaseDigits: 4,
})
```

## Configuration

The converter uses a configuration object (`SemverIntConfig`) to customize how version strings are converted. This includes:

- `numMajorDigits`, `numMinorDigits`, `numPatchDigits`, `numPrereleaseDigits`, `numPrereleaseComponentDigits`: The number of
  digits allowed for each component.
- `majorVersionErrors`, `minorVersionErrors`, `patchVersionErrors`, `prereleaseErrors`, `prereleaseNumericComponentErrors`: Define
  the error handling strategy for each component (`'error'` or `'ignore'`).
- `firstPrereleaseComponentToDigit`: A mapping of the first prerelease component to a specific digit (e.g.,
  `["alpha", "beta", "rc"]`).
  - No
- `maxSemverInt`: Optional maximum integer limit for the entire converted SemVer.

You can create a custom configuration by passing a partial config to the `setGlobalConfig` function or directly to the
`SemverIntConverter` constructor.

### Note on `firstPrereleaseComponentToDigit`

This configuration allows mapping the first prerelease component to a single-digit number. The digit will be the index+1 of the
matching string in the array. If a component doesn't match any string in the array, it will be assigned a digit of 0. Subsequent
prerelease components are converted to ASCII codes, two digits per character.

Important: Depending on what is passed in firstPrereleaseComponentToDigit, this mapping may not adhere strictly to the standard
SemVer specification. Custom mappings can introduce behaviors that diverge from the conventional ordering and interpretation of
prerelease tags. Use this feature carefully if adhering strictly to SemVer precedence rules is required for your application.

### Example of Custom Configuration

```typescript
const customConfig: Partial<SemverIntConfig> = {
  numMajorDigits: 2,
  numMinorDigits: 2,
  numPatchDigits: 2,
  firstPrereleaseComponentToDigit: ['alpha', 'beta', 'rc', 'pre', 'snapshot', 'dev', 'build'],
  maxSemverInt: 999999999999n, // Example maximum integer
}
setGlobalConfig(customConfig)
```

## Creating a Local Converter Instance

While the provided `semverToInt` function uses a global configuration, you can also create an instance of the `SemverIntConverter`
locally with custom settings:

### Example

```typescript
import { SemverIntConverter, SemverIntConfig } from 'semver-int-converter'

const localConfig: Partial<SemverIntConfig> = {
  numMajorDigits: 2,
  numMinorDigits: 2,
  numPatchDigits: 2,
  numPrereleaseDigits: 4,
}

const localConverter = new SemverIntConverter(localConfig)

const result = localConverter.semverToInt('1', '2', '3', 'beta.1')
console.log(result.versionStr) // Output will depend on the local configuration
```

By creating a local instance, you can control configurations for specific tasks or threads, isolating them from the global
converter.

## Warning: Consistency in Integer Settings

**Important:** When using multiple instances of `SemverIntConverter` or modifying the global configuration, ensure that all
instances use the same integer settings (`numMajorDigits`, `numMinorDigits`, `numPatchDigits`, and `numPrereleaseDigits`).

### Why This Matters

If different instances of `SemverIntConverter` use varying digit lengths or mappings, the resulting integer values for the same
version string will differ. This will cause inconsistencies in comparisons and equality checks, making it impossible to reliably
compare version integers across differently configured converters.

**Example Issue:** If one converter is configured to use 3 digits for the major version while another uses 2, converting `"1.0.0"`
might yield `"001000000"` in one case and `"1000000"` in the other. Such inconsistencies will lead to incorrect comparisons and
potentially erroneous version management behavior.

### Best Practice

To avoid this issue, define a common configuration object and reuse it across all converter instances. Alternatively, use the
global converter (`setGlobalConfig`) for all version conversion tasks if you require consistency throughout your application.
