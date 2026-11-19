import type { SemverIntConverter, SemverIntResult } from '../index.js'

export function convertVersion(converter: SemverIntConverter, fullVersion: string): SemverIntResult {
  const withoutBuildMetadata = fullVersion.split('+', 1)[0]
  const prereleaseStart = withoutBuildMetadata.indexOf('-')
  let coreVersion = withoutBuildMetadata
  let prerelease = ''
  if (prereleaseStart !== -1) {
    coreVersion = withoutBuildMetadata.slice(0, prereleaseStart)
    prerelease = withoutBuildMetadata.slice(prereleaseStart + 1)
  }

  const coreComponents = coreVersion.split('.')
  if (coreComponents.length !== 3) {
    throw new Error(`Expected three core components in test version ${fullVersion}`)
  }
  const [major, minor, patch] = coreComponents
  return converter.semverToInt(major, minor, patch, prerelease)
}
