# semverint

A TypeScript utility for converting [semantic versioning (SemVer)](https://semver.org) strings into integer representations. This
can be used for version comparison in systems that do not natively support SemVer.

## Features

- Produces an integer that adheres to SemVer precedence rules
- Configurable number of digits for each SemVer component (major, minor, patch, prerelease).
- Flexible error handling for each SemVer component.
- Properly handles any combination of numeric & non-numeric prerelease components.
- Supports mapping the first prerelease component (like "alpha", "beta") to a specific digit for compactness.

### Warning: Precision Loss and Overflow Impact

When converting semantic version strings to integers, precision loss or overflows can occur if the provided version components
exceed the configured number of digits. This can lead to incorrect integer representations, causing comparison operations to
signal SemVer equality, even when the original versions differ.

#### Why This Matters

- **Overflow**: Happens when a component exceeds the configured reserved digits for the integer representation. Overflowed
  components will return an error and fill the remaining SemVer components' digits with the maximum possible value.

- **Precision Loss**: Occurs when the remaining prerelease components exceed the configured reserved digits for the prerelease
  integer representation. An Precision Loss error means the excess digits were rounded.

Both scenarios distort the original version’s integer representation. This means that two versions that were different may now
appear equal when compared as integers.

**Recommendation:** Always carefully configure the number of digits for each version component to accommodate the largest expected
version values, and handle overflow errors as needed for your application.

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

You can use your own SemVer parsing library to extract the components (major, minor, patch, and prerelease) before passing them
into the utility. The utility will always return a valid integer, and if any errors occur during the conversion, they will be
provided in the result object. Exceptions are only thrown if the configuration parameters are invalid or if the provided
components are not from a valid SemVer.

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
  numPrereleaseDigits: 10,
  numPrereleaseComponentDigits: 6,
})
```

## Configuration

The converter uses a configuration object (`SemverIntConfig`) to customize how version strings are converted. This includes:

#### Digits

- `numMajorDigits`, `numMinorDigits`, `numPatchDigits`, `numPrereleaseDigits`, `numPrereleaseComponentDigits`: The number of
  digits reserved for each version component.
- `numPrereleaseComponentDigits`: Specifies the number of digits allocated to each component within a prerelease string (split by
  `.`). For instance, with a configuration of `numPrereleaseComponentDigits = 4`, `rc.1` would be converted into `'91760001'`.
- `firstPrereleaseComponentToDigit`: Optional mapping of the first prerelease component to a specific digit.
- `maxSemverInt`: Optional maximum integer limit for the entire converted SemVer.

#### Error Handling

- `majorVersionErrors`, `minorVersionErrors`, `patchVersionErrors`, `prereleaseErrors`, `prereleaseNumericComponentErrors`: Define
  the error handling strategy for each version component (`'error'` or `'ignore'`).

You can create a custom configuration by passing a partial config to the `setGlobalConfig` function or directly to the
`SemverIntConverter` constructor.

### Note on `firstPrereleaseComponentToDigit`

This configuration allows mapping the first prerelease component to a single-digit number. This is useful if you only use a small
set of prerelease components, to support compacting the prerelease integer size. The digit will be the index+1 of the matching
string in the array. If a component doesn't match any string in the array, it will be assigned a digit of 0. Subsequent prerelease
components are converted to ASCII codes, two digits per character.

Important: Depending on what is passed in firstPrereleaseComponentToDigit, this mapping may not adhere strictly to the standard
SemVer specification. Custom mappings can introduce behaviors that diverge from the conventional ordering and interpretation of
prerelease tags. Use this feature carefully if adhering strictly to SemVer precedence rules is required for your application.

### Example of Custom Configuration

```typescript
const customConfig: Partial<SemverIntConfig> = {
  numMajorDigits: 2,
  numMinorDigits: 2,
  numPatchDigits: 2,
  numPrereleaseDigits: 10,
  numPrereleaseComponentDigits: 6,
  firstPrereleaseComponentToDigit: ['alpha', 'beta', 'rc', '', '', '', '', '', ''],
  maxSemverInt: 999999999999n,
}
setGlobalConfig(customConfig)
```

## Creating a Local Converter Instance

While the provided `semverToInt` function uses a global configuration, you can also create an instance of the `SemverIntConverter`
locally with custom settings:

### Example

```typescript
import { SemverIntConverter, SemverIntConfig } from 'semverint'

const localConfig: Partial<SemverIntConfig> = {
  numMajorDigits: 2,
  numMinorDigits: 2,
  numPatchDigits: 2,
  numPrereleaseDigits: 16,
  numPrereleaseComponentDigits: 8,
}

const localConverter = new SemverIntConverter(localConfig)

const result = localConverter.semverToInt('1', '2', '3', 'beta.1')
console.log(result.versionStr) // 102037578937400000001
```

By creating a local instance, you can control configurations for specific tasks or threads, isolating them from the global
converter.

## Warning: Consistency in Integer Settings

**Important:** When using multiple instances of `SemverIntConverter`, ensure that all instances use the same integer settings
(`numMajorDigits`, `numMinorDigits`, `numPatchDigits`, and `numPrereleaseDigits`).

### Why This Matters

If different instances of `SemverIntConverter` use varying digit lengths or mappings, the resulting integer values for the same
version string will differ. This will cause inconsistencies in comparisons and equality checks, making it impossible to reliably
compare version integers across differently configured converters.

**Example Issue:** If one converter is configured to use 3 digits for the minor version while another uses 2, converting `"1.2.3"`
might yield `"1002003"` in one case and `"102003"` in the other. Such inconsistencies will lead to incorrect comparisons and
potentially erroneous version management behavior.

### Best Practice

To avoid this issue, define a common configuration object and reuse it across all converter instances. Alternatively, use the
global converter (`setGlobalConfig`) for all version conversion tasks if you require consistency throughout your application.
