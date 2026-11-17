import { readFileSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

const request = JSON.parse(readFileSync(0, 'utf8'))

function resolveLocalModule(specifier, parentPath, outputDirectory) {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
    throw new Error(`Expected a relative package import, got ${specifier}`)
  }

  const modulePath = path.resolve(path.dirname(parentPath), specifier)
  const relativePath = path.relative(outputDirectory, modulePath)
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath) || !modulePath.endsWith('.js')) {
    throw new Error(`Import leaves the compiled package: ${specifier}`)
  }
  return modulePath
}

function loadCommonJs(entrypoint, context) {
  const modules = new Map()
  const outputDirectory = path.dirname(entrypoint)

  function loadModule(modulePath) {
    const cachedModule = modules.get(modulePath)
    if (cachedModule) return cachedModule.exports

    const module = { exports: {} }
    modules.set(modulePath, module)
    const source = readFileSync(modulePath, 'utf8')
    const script = new vm.Script(`(function (exports, require, module) {\n${source}\n})`, { filename: modulePath })
    const requireLocal = specifier => loadModule(resolveLocalModule(specifier, modulePath, outputDirectory))
    script.runInContext(context)(module.exports, requireLocal, module)
    return module.exports
  }

  return loadModule(entrypoint)
}

async function loadEsModule(entrypoint, context) {
  const modules = new Map()
  const outputDirectory = path.dirname(entrypoint)

  function getModule(modulePath) {
    const cachedModule = modules.get(modulePath)
    if (cachedModule) return cachedModule

    const module = new vm.SourceTextModule(readFileSync(modulePath, 'utf8'), { context, identifier: modulePath })
    modules.set(modulePath, module)
    return module
  }

  const root = getModule(entrypoint)
  // The linker owns recursive linking. Returning cached, unlinked modules also handles shared imports.
  await root.link((specifier, parent) => getModule(resolveLocalModule(specifier, parent.identifier, outputDirectory)))
  await root.evaluate()
  return root.namespace
}

function captureOutcome(operation) {
  try {
    const result = operation()
    if (result === undefined) return { constructed: true }
    return {
      versionStr: result.versionStr,
      errs: result.errs.map(({ name, componentName, message }) => ({ name, componentName, message })),
    }
  } catch (error) {
    return { exception: { name: error.name, message: error.message } }
  }
}

function runCase(api, testCase) {
  const config = { ...testCase.config }
  // This host process has BigInt even when the package's VM does not. A supplied bigint value
  // tests the existing optional cap; it does not imply that older engines can create bigint values.
  if (testCase.maximum !== undefined) config.maxSemverInt = BigInt(testCase.maximum)

  const singleton = captureOutcome(() => {
    api.setGlobalConfig(config)
    if (testCase.operation !== 'construct') return api.semverToInt(...testCase.version)
  })
  const local = captureOutcome(() => {
    const converter = new api.SemverIntConverter(config)
    if (testCase.operation !== 'construct') return converter.semverToInt(...testCase.version)
  })
  return { singleton, local }
}

function checkConfigurationIsolation(api) {
  const local = new api.SemverIntConverter({ numPrereleaseDigits: 2 })
  api.setGlobalConfig({ numMinorDigits: 3, numPrereleaseDigits: 0 })
  const firstGlobal = captureOutcome(() => api.semverToInt('1', '2', '3', ''))
  const firstLocal = captureOutcome(() => local.semverToInt('1', '2', '3', ''))
  api.setGlobalConfig({ numPatchDigits: 3 })
  const secondGlobal = captureOutcome(() => api.semverToInt('1', '2', '3', ''))
  const secondLocal = captureOutcome(() => local.semverToInt('1', '2', '3', ''))
  api.setGlobalConfig({ numPrereleaseDigits: 2 })
  const failedUpdate = captureOutcome(() => api.setGlobalConfig({ numPrereleaseDigits: -1 }))
  const globalAfterFailedUpdate = captureOutcome(() => api.semverToInt('1', '2', '3', ''))
  const localAfterFailedUpdate = captureOutcome(() => local.semverToInt('1', '2', '3', ''))
  return { firstGlobal, firstLocal, secondGlobal, secondLocal, failedUpdate, globalAfterFailedUpdate, localAfterFailedUpdate }
}

const results = []
for (const format of ['cjs', 'esm']) {
  for (const bigIntAvailable of [true, false]) {
    const context = vm.createContext(bigIntAvailable ? {} : { BigInt: undefined })
    const entrypoint = request.entrypoints[format]
    const api = format === 'cjs' ? loadCommonJs(entrypoint, context) : await loadEsModule(entrypoint, context)
    results.push({
      format,
      bigIntAvailable,
      bigIntType: vm.runInContext('typeof BigInt', context),
      cases: request.cases.map(testCase => runCase(api, testCase)),
      isolation: checkConfigurationIsolation(api),
    })
  }
}

process.stdout.write(JSON.stringify(results))
