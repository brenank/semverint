# semverint

A TypeScript utility for converting [semantic versioning (SemVer)](https://semver.org) components into decimal integer strings.
This can support version comparisons in systems that do not natively support SemVer, subject to the v2 encoding limitations below.

## Features

- Configurable digit budgets for major, minor, patch, and prerelease components.
- Exact decimal conversion, rounding, and saturation, including values beyond JavaScript's safe integer range.
- Configurable overflow and precision-loss diagnostics.
- Numeric and non-numeric prerelease identifiers, including identifiers following numeric ones.
- Optional mapping of the first prerelease identifier to a single digit.

## Installation

```bash
npm install semverint
```

## Usage

Use your own SemVer parser to validate and extract the components before conversion. Pass canonical decimal strings for major,
minor, and patch, and a dot-separated prerelease string, or `''` for a stable release. Build metadata does not affect precedence
and is not an input to the converter.

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

// 102037384889999
// 102037477929999
// 102039075000001
// 102039898980000
// 102039999999999
// 298059999999999
```

`alpha` and `beta` exceed the six-digit identifier budget in this example and return component overflow errors. Inspect `errs`
before relying on an integer comparison. Compare `versionStr` values with `BigInt`; converting them to `Number` can lose
precision.

```typescript
const earlier = semverToInt('1', '2', '3', 'rc.1')
const later = semverToInt('1', '2', '3', 'rc.2')
console.log(BigInt(earlier.versionStr) < BigInt(later.versionStr)) // true
```

The result contains `versionStr` and an `errs` array. Invalid configuration and invalid core-component inputs throw exceptions;
valid input values that exceed a configured budget return diagnostics with the saturated or rounded result. A configuration with
every digit budget set to zero returns `'0'` and a major-component overflow diagnostic.

## Configuration

The constructor and `setGlobalConfig` accept a partial `SemverIntConfig`, filled from these defaults:

```typescript
{
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
```

All digit budgets must be finite, nonnegative integers. `maxSemverInt`, when supplied, must be a nonnegative `bigint`, including
`0n`. Each call to `setGlobalConfig` replaces the global configuration using defaults for omitted fields.

- `numMajorDigits`, `numMinorDigits`, and `numPatchDigits` reserve decimal widths. Major is unpadded; minor and patch are padded
  with leading zeros.
- `numPrereleaseDigits` reserves the total prerelease width. Stable releases fill it with nines. A nonempty prerelease remains
  strictly below that sentinel whenever the width is positive.
- `numPrereleaseComponentDigits` limits each unmapped identifier. Numeric identifiers are left-padded to this width. Text uses the
  v2 character codes, two digits per character, without padding between identifiers. For example, `rc.1` with an identifier width
  of four becomes `90750001` before total-width padding or rounding.
- `firstPrereleaseComponentToDigit` optionally maps the first identifier to a single digit.
- `maxSemverInt` caps the complete result, including results produced by component overflow. Overall overflow is always reported.

### Numeric prerelease range

The v2 encoding reserves a numeric range below its text codes. At the default identifier width of six, numeric identifiers range
from `0` through `363635`. Larger numeric identifiers clamp to that ceiling, return a component overflow diagnostic, and fill
unused prerelease digits with nines, subject to the stable-release sentinel. Identifier processing stops on component overflow.

The ceiling is computed exactly from repeated `36` character codes minus one. A width of one has a ceiling of `2`. For odd widths
greater than one, the v2 threshold uses the next lower even number of digits: a width of three has a ceiling of `35`.

### Compact first-identifier mapping

```typescript
setGlobalConfig({
  firstPrereleaseComponentToDigit: ['alpha', 'beta', 'rc', '', '', '', '', '', ''],
})
```

A match uses its first array index plus one; an unknown first identifier uses `0`. This applies to numeric first identifiers too.
The mapped digit counts toward the total prerelease budget and bypasses the identifier budget. Remaining identifiers use their
normal numeric or text encoding. Stable releases always use the stable sentinel. If the ninth mapping entry would occupy the
entire one-digit prerelease budget, its value clamps below the stable sentinel and reports precision loss.

Custom mapping order can differ from SemVer precedence. Use the same mapping for every value you compare.

## Errors and precision

Returned errors have `name`, `componentName`, and `message` fields.

- `OverflowError` identifies a major, minor, patch, prerelease, prerelease identifier, or overall integer overflow. Core-component
  overflow saturates that component and all following digits with nines. A nonempty prerelease with a zero total budget reports
  prerelease overflow. Text-identifier truncation and numeric-identifier clamping report `prereleaseNumericComponent` overflow.
- `PrecisionLossError` identifies loss in the total prerelease budget. An encoding longer than this budget is rounded to nearest,
  with an exact decimal half rounded upward. Leading zeros are preserved; rounding carry saturates instead of wrapping. Unused
  trailing positions are padded with zeros. Discarded remaining identifiers also report precision loss, including when a preceding
  identifier exactly fills the budget. Reserving the stable sentinel can also report precision loss.

`majorVersionErrors`, `minorVersionErrors`, `patchVersionErrors`, `prereleaseErrors`, and `prereleaseNumericComponentErrors`
accept `'error'` or `'ignore'`. Ignoring a category suppresses its returned diagnostics while preserving the encoded result. The
`prereleaseNumericComponentErrors` option controls both numeric and text identifier overflow. Overall `maxSemverInt` overflow is
reported independently of these options.

Overflow and precision loss can collapse distinct versions or distort ordering. Choose adequate budgets and handle returned errors
for your application.

## V2 encoding limitations

Even conversions with an empty `errs` array can differ from SemVer comparison:

- Text identifiers have no boundary marker: `a.b` and `ab` can encode to the same value.
- Zero identifiers can be indistinguishable from padding: `a`, `a.0`, and `a.0.0` can collide even with sufficient space.
- Concatenated text identifiers can reverse order: `a.z` encodes above `aa`, despite its lower SemVer precedence.
- The v2 character table places the hyphen above digits, so `-` encodes above `0a`, reversing ASCII precedence.

Use a SemVer comparator when these distinctions matter. Increasing digit budgets prevents budget loss but cannot resolve these
encoding ambiguities.

## Local converter instances

```typescript
import { SemverIntConverter } from 'semverint'

const converter = new SemverIntConverter({
  numMajorDigits: 2,
  numMinorDigits: 2,
  numPatchDigits: 2,
  numPrereleaseDigits: 16,
  numPrereleaseComponentDigits: 8,
})

const result = converter.semverToInt('1', '2', '3', 'beta.1')
console.log(result.versionStr) // 102037477927300000001
console.log(result.errs) // []
```

Local converters keep their own configuration independently of the global converter.

## Comparing stored integers

Use the same digit budgets, mapping, and encoding version for every stored integer in a comparison. Configuration and encoding
version are part of the storage contract; store them alongside the values or establish them for the complete dataset. When that
contract changes, regenerate the compared values from their original SemVer components using one consistent configuration.
