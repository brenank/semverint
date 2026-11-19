# semverint

A TypeScript utility for converting [semantic versioning (SemVer)](https://semver.org) strings into integer representations. This
can be used for version comparison in systems that do not natively support SemVer.

## Features

- Produces integer representations for version comparison.
- Configurable number of digits for each SemVer component (major, minor, patch, prerelease).
- Flexible error handling for each SemVer component.
- Properly handles any combination of numeric & non-numeric prerelease components.
- Supports mapping the first prerelease component (like "alpha", "beta") to a specific digit for compactness.

## Installation

```bash
npm install semverint
```

## Usage

### Convert a SemVer String to an Integer

You can use your own SemVer parsing library to extract the components (major, minor, patch, and prerelease) before passing them
into the utility. The utility will always return a valid integer, and if any errors occur during the conversion, they will be
provided in the result object. Exceptions are only thrown if the configuration parameters are invalid or if the provided
components are not from a valid SemVer.

```typescript
import { semverToInt, setGlobalConfig } from 'semverint'

setGlobalConfig({
  numMajorDigits: 2,
  numMinorDigits: 2,
  numPatchDigits: 2,
  numPrereleaseDigits: 10,
  numPrereleaseComponentDigits: 6,
})

console.log(semverToInt('1', '2', '3', 'alpha').versionStr)
console.log(semverToInt('1', '2', '3', 'beta').versionStr)
console.log(semverToInt('1', '2', '3', 'rc.1').versionStr)
console.log(semverToInt('1', '2', '3', 'zzz').versionStr)
console.log(semverToInt('1', '2', '3', '').versionStr)
console.log(semverToInt('2', '98', '5', '').versionStr)

// 102032384953999
// 102032394257999
// 102032554000111
// 102032636363000
// 102039999999999
// 298059999999999
```

Compare large `versionStr` values with `BigInt` to avoid losing precision through JavaScript's `Number`. Basic conversion runs on
runtimes with or without `BigInt`. The optional `maxSemverInt` configuration requires `BigInt`.

### Errors

When converting semantic version strings to integers, precision loss or overflows can occur if the provided version components
exceed the configured number of digits. This can lead to incorrect integer representations, causing comparison operations to
signal SemVer equality, even when the original versions differ.

#### Why This Matters

- **Overflow**: Happens when a component exceeds the configured reserved digits for the integer representation. Overflowed
  components will return an error and fill the remaining SemVer components' digits with the maximum possible value.

- **Precision Loss**: Occurs when the remaining prerelease components exceed the configured reserved digits for the prerelease
  integer representation. Excess digits are rounded exactly in decimal, with halfway values rounded upward. If rounding adds
  another digit, the result uses the largest value that fits. Unused trailing positions are padded with zeros. Omitted identifiers
  also report precision loss, including when a preceding identifier exactly fills the budget. The all-nine value is reserved for
  stable releases; a nonempty prerelease that reaches it is reduced by one and reports precision loss.

Both scenarios distort the original version’s integer representation. This means that two versions that were different may now
appear equal when compared as integers.

**Recommendation:** Always carefully configure the number of digits for each version component to accommodate the largest expected
version values, and handle overflow errors as needed for your application. Numeric prerelease identifiers continue through the
remaining identifiers; identifiers clipped to the numeric ceiling report component overflow.

With sufficient digit budgets, the encoding preserves numeric magnitude, ASCII text order, and identifier boundaries. Limited
budgets and custom first-identifier mappings can still cause different versions to share an integer.

### v3 encoding and upgrades

Each numeric prerelease identifier contains a `1` marker, its decimal digit count, and its digits. Each text identifier contains a
`2` marker, two-digit character ranks in ASCII order, and a `00` terminator. The ranks start at `01`, reserving `00` for
boundaries. The numeric digit count is padded to the width needed to represent `numPrereleaseComponentDigits`.

For example, with a component budget of six digits, `1` encodes as `111`, `10` as `1210`, and `a` as `23800`, before padding to
the total prerelease width. These markers and boundaries distinguish `a` from `a.0`, and `ab` from `a.b`.

The v3 encoding and defaults are stable across patch and minor releases. Use the same major version and configuration for every
set of integers you compare.

When upgrading from v2, recompute stored integers from their original SemVer values using your v3 configuration, then rebuild any
indexes or derived values. The old integers alone cannot reliably recover the original versions. Keep the original SemVer values
alongside stored integers for future migrations. Review digit budgets and conversion errors during the upgrade: identifier markers
and boundaries also consume the total prerelease budget.

### Set Global Configuration

You can adjust the global configuration for all conversions:

```typescript
import { setGlobalConfig } from 'semverint'

setGlobalConfig({
  numMajorDigits: 2,
  numMinorDigits: 2,
  numPatchDigits: 2,
  numPrereleaseDigits: 10,
  numPrereleaseComponentDigits: 6,
  firstPrereleaseComponentToDigit: ['alpha', 'beta', 'rc', '', '', '', '', '', ''],
  maxSemverInt: 999999999999n,
})
```

## Configuration

The converter uses a configuration object (`SemverIntConfig`) to customize how version strings are converted. This includes:

#### Digits

- `numMajorDigits`, `numMinorDigits`, `numPatchDigits`, `numPrereleaseDigits`, `numPrereleaseComponentDigits`: The number of
  digits reserved for each version component. Each budget must be a nonnegative safe integer, and the combined major, minor,
  patch, and prerelease width must be positive and safe.
- `numPrereleaseComponentDigits`: Specifies the number of digits allocated to each component within a prerelease string (split by
  `.`). It limits the numeric payload digits or text character-code digits. Markers, numeric lengths, and text terminators count
  toward `numPrereleaseDigits` separately. For instance, with `numPrereleaseComponentDigits = 4` and `numPrereleaseDigits = 10`,
  `rc.1` produces the prerelease field `'2554000111'`.
- `firstPrereleaseComponentToDigit`: Optional mapping of the first prerelease component to a specific digit.
- `maxSemverInt`: Optional nonnegative `bigint` capacity of the destination system. Every result above this value, including core
  overflow results, is clamped to it and reports overall overflow. Zero is a valid limit; negative values and other types are
  rejected.

#### Error Handling

- `majorVersionErrors`, `minorVersionErrors`, `patchVersionErrors`, `prereleaseErrors`, `prereleaseNumericComponentErrors`: Define
  the error handling strategy for each version component (`'error'` or `'ignore'`).

You can create a custom configuration by passing a partial config to the `setGlobalConfig` function or directly to the
`SemverIntConverter` constructor.

### Note on `firstPrereleaseComponentToDigit`

This configuration allows mapping the first prerelease component to a single-digit number. This is useful if you only use a small
set of prerelease components, to support compacting the prerelease integer size. The digit will be the index+1 of the matching
string in the array. If a component doesn't match any string in the array, it will be assigned a digit of 0. Subsequent prerelease
components retain their numeric/text markers, lengths, and boundaries.

Important: Depending on what is passed in firstPrereleaseComponentToDigit, this mapping may not adhere strictly to the standard
SemVer specification. Custom mappings can introduce behaviors that diverge from the conventional ordering and interpretation of
prerelease tags. Use this feature carefully if adhering strictly to SemVer precedence rules is required for your application.

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
console.log(result.versionStr) // 102032394257380011100
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
