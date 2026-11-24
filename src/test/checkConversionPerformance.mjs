/**
 * Run npm run test:performance -- --base origin/main [--output <directory>].
 * The base Git ref must exist locally; CI supplies the PR base SHA.
 *
 * Compares the working tree and base in isolated Node processes. Workloads and
 * regression limits live in performanceCases.mjs; memory checks sample heap
 * growth and peak RSS.
 *
 * Writes results.json and summary.md to performance-results/ by default.
 * Budget violations, invalid samples, and unexpected failures exit nonzero;
 * worker failures preserve partial reports. Inspect reports before changing limits.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { checkPerformanceBudgets } from './checkPerformanceBudgets.mjs'
import { performanceCases, performancePolicy } from './performanceCases.mjs'

const repository = fileURLToPath(new URL('../..', import.meta.url))
const workerPath = fileURLToPath(new URL('./measureConversionPerformance.mjs', import.meta.url))
const compilerPath = path.join(repository, 'node_modules/typescript/bin/tsc')

function parseArguments(argumentsList) {
  const options = { base: 'origin/main', output: path.join(repository, 'performance-results') }
  for (let index = 0; index < argumentsList.length; index += 2) {
    const flag = argumentsList[index]
    const value = argumentsList[index + 1]
    if (!['--base', '--output'].includes(flag) || !value || value.startsWith('--')) {
      throw new Error('Usage: npm run test:performance -- --base <git-ref> [--output <directory>]')
    }
    options[flag.slice(2)] = value
  }
  options.output = path.resolve(options.output)
  return options
}

function runCommand(command, argumentsList, cwd = repository) {
  return execFileSync(command, argumentsList, {
    cwd,
    encoding: 'utf8',
    timeout: performancePolicy.childTimeoutMs,
    maxBuffer: 1024 * 1024,
  }).trim()
}

function compilePackage(sourceDirectory, artifactDirectory) {
  const outputDirectory = path.join(artifactDirectory, 'cjs')
  runCommand(process.execPath, [
    compilerPath,
    '--project',
    path.join(sourceDirectory, 'tsconfig.cjs.json'),
    '--outDir',
    outputDirectory,
    '--declarationDir',
    path.join(artifactDirectory, 'types'),
  ])
  // Artifacts live outside either source package; their .js files must load as CJS.
  writeFileSync(path.join(outputDirectory, 'package.json'), JSON.stringify({ type: 'commonjs' }))
  const packageMetadata = JSON.parse(readFileSync(path.join(sourceDirectory, 'package.json'), 'utf8'))
  const publicEntrypoint = packageMetadata.exports?.['.']?.require || packageMetadata.main
  const relativeEntrypoint = path.relative(
    path.join(sourceDirectory, 'dist/cjs'),
    path.resolve(sourceDirectory, publicEntrypoint),
  )
  if (relativeEntrypoint.startsWith('..') || path.isAbsolute(relativeEntrypoint)) {
    throw new Error(`Expected the package's public CommonJS entry point under dist/cjs, got ${publicEntrypoint}`)
  }
  const entrypoint = path.join(outputDirectory, relativeEntrypoint)
  readFileSync(entrypoint)
  return { entrypoint, version: packageMetadata.version, publicEntrypoint }
}

function measure(entrypoint, workload, mode) {
  const child = spawnSync(process.execPath, ['--expose-gc', workerPath], {
    input: JSON.stringify({ entrypoint, caseId: workload.id, mode }),
    encoding: 'utf8',
    timeout: performancePolicy.childTimeoutMs,
    maxBuffer: 1024 * 1024,
  })
  if (child.error || child.status !== 0) {
    return {
      failure: {
        name: child.error?.name || 'WorkerFailure',
        message: (child.error?.message || child.stderr || `Worker exited ${child.status}, signal ${child.signal}`).slice(0, 4000),
      },
    }
  }
  try {
    const measurement = JSON.parse(child.stdout)
    if (
      !measurement ||
      typeof measurement !== 'object' ||
      Array.isArray(measurement) ||
      measurement.mode !== mode ||
      measurement.gcAvailable !== true ||
      !['success', 'exception'].includes(measurement.outcome?.status)
    ) {
      return { failure: { name: 'InvalidWorkerOutput', message: child.stdout.slice(0, 1000) } }
    }
    return measurement
  } catch {
    return { failure: { name: 'InvalidWorkerOutput', message: child.stdout.slice(0, 1000) } }
  }
}

function recordMeasurement(testCase, build, entrypoint, mode) {
  const measurement = measure(entrypoint, testCase.workload, mode)
  if (mode === 'cpu') testCase[build].cpu = measurement
  else testCase[build].memory.push(measurement)

  // Keep the failed measurement before stopping. Repeating timeouts across every
  // workload could exhaust the CI job before cleanup and report writing run.
  if (measurement.failure) {
    const message = `${testCase.workload.id}: ${build} ${mode} worker failed (${measurement.failure.name}): ${measurement.failure.message}`
    testCase.evaluation.problems.push(message)
    throw new Error(message)
  }
}

function escapeMarkdown(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ')
}

function formatUs(value) {
  return value === undefined ? 'unmeasurable' : value.toFixed(3)
}

function formatMiB(value) {
  return value === undefined ? 'unmeasurable' : `${(value / (1024 * 1024)).toFixed(3)} MiB`
}

function renderSummary(report) {
  const lines = [
    '# Conversion CPU and memory budgets',
    '',
    `Result: **${report.status.toUpperCase()}**. Raw samples and worker failures: [results.json](results.json).`,
    '',
    `Node ${report.environment.node}; ${report.environment.platform} ${report.environment.release}; ${report.environment.arch}.`,
    `CPU: ${escapeMarkdown(report.environment.cpu)}. TypeScript: ${report.environment.typescript || 'unavailable'}.`,
    '',
    `Baseline: ${escapeMarkdown(report.baseRef || 'unresolved')} (${report.baselineCommit || 'unresolved'}), package ${report.builds?.baseline.version || 'unavailable'}.`,
    `Candidate: ${report.candidateCommit || 'unresolved'}, package ${report.builds?.candidate.version || 'unavailable'}. Working tree changes: ${escapeMarkdown(report.workingTree || 'none')}.`,
    '',
    'Each build/case uses a fresh GC-enabled child for seven CPU batches and three separate memory trials. CPU includes user + system time; wall samples are also recorded.',
    'Memory starts after module load and GC, before materializing the input or constructing the converter. It includes warm-up and increasing post-GC checkpoints.',
    'Sampled heap peaks can miss short-lived allocations; RSS includes the runtime. Retained growth in these bounded runs does not prove leak freedom.',
    '',
    `CPU fails above both ${performancePolicy.cpuRatio}x baseline median and +${performancePolicy.cpuMinimumIncreaseUs} µs/call, with at least ${performancePolicy.cpuRequiredSlowBatches}/${performancePolicy.cpuBatches} candidate batches over that limit.`,
    'Memory compares each candidate trial with a limit derived from the median baseline trial; two of three trials must exceed it to fail.',
    'Temporary heap limit: max(2x baseline, baseline + 8 MiB). Post-GC retained limit: max(2x nonnegative baseline, nonnegative baseline + 2 MiB). RSS limit: max(1.5x baseline, baseline + 32 MiB).',
    'The only allowed unsupported baseline is the declared wide-rounding toFixed RangeError. Both builds unsupported: explicitly unmeasurable. Newly supported candidate: CPU unmeasurable, absolute heap/retained/RSS limits of 64/2/256 MiB and the same 30-second child timeout.',
    'Changed outcomes remain visible and do not disable a measurable budget. Invalid measurements and unexpected failures fail closed.',
    '',
    '| Workload | Result | Comparison | Baseline CPU µs/call | Candidate CPU µs/call | CPU limit | Slow batches | Outcome changed |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | --- |',
  ]
  for (const testCase of report.cases) {
    const evaluation = testCase.evaluation
    lines.push(
      `| ${testCase.workload.id} | ${evaluation.status} | ${evaluation.comparison} | ${formatUs(evaluation.cpu?.baseline?.medianCpuUs)} | ${formatUs(evaluation.cpu?.candidate?.medianCpuUs)} | ${formatUs(evaluation.cpu?.limitUs)} | ${evaluation.cpu?.exceededBatches ?? 'n/a'}/7 | ${evaluation.outcomeChanged ?? 'unknown'} |`,
    )
  }
  for (const testCase of report.cases) {
    const { workload, baseline, candidate, evaluation } = testCase
    lines.push('', `## ${workload.id}`, '', `Status: **${evaluation.status}** (${evaluation.comparison}).`, '')
    lines.push('Workload (major/minor/patch default to 1/2/3):', '', '```json', JSON.stringify(workload, undefined, 2), '```', '')
    lines.push(
      'Effective baseline configuration:',
      '',
      '```json',
      JSON.stringify(baseline.cpu?.effectiveConfig || {}, undefined, 2),
      '```',
      '',
    )
    lines.push(
      'Effective candidate configuration:',
      '',
      '```json',
      JSON.stringify(candidate.cpu?.effectiveConfig || {}, undefined, 2),
      '```',
      '',
    )
    lines.push(
      'Baseline outcome:',
      '',
      '```json',
      JSON.stringify(baseline.cpu?.outcome || baseline.cpu?.failure, undefined, 2),
      '```',
      '',
    )
    lines.push(
      'Candidate outcome:',
      '',
      '```json',
      JSON.stringify(candidate.cpu?.outcome || candidate.cpu?.failure, undefined, 2),
      '```',
      '',
    )
    if (evaluation.cpu?.status === 'unmeasurable') lines.push(evaluation.cpu.reason, '')
    if (evaluation.cpu?.errorReference) {
      const { workloadLimitUs, errorReference, limitUs } = evaluation.cpu
      lines.push(
        `The candidate reports one numeric prerelease OverflowError for a clamp the baseline performed silently. The workload CPU limit is ${formatUs(workloadLimitUs)} µs/call. The baseline ${errorReference.caseId} median of ${formatUs(errorReference.medianCpuUs)} µs/call yields a limit of ${formatUs(errorReference.limitUs)} µs/call. The greater limit, ${formatUs(limitUs)} µs/call, applies.`,
        '',
      )
    }
    if (evaluation.memory?.metrics) {
      lines.push('| Metric | Result | Baseline median | Candidate median | Limit | Candidate trials | Trials over limit |')
      lines.push('| --- | --- | ---: | ---: | ---: | --- | ---: |')
      for (const metric of evaluation.memory.metrics) {
        lines.push(
          `| ${metric.metric} | ${metric.status} | ${formatMiB(metric.baselineMedian)} | ${formatMiB(metric.candidateMedian)} | ${formatMiB(metric.limitBytes)} | ${metric.candidateSamples.map(formatMiB).join(', ')} | ${metric.exceededTrials}/3 |`,
        )
      }
    }
    for (const problem of evaluation.problems) lines.push('', `- ${escapeMarkdown(problem)}`)
  }
  for (const error of report.errors) lines.push('', `Error: ${escapeMarkdown(error)}`)
  return `${lines.join('\n')}\n`
}

const report = {
  status: 'fail',
  startedAt: new Date().toISOString(),
  environment: {
    node: process.version,
    nodeExecutable: process.execPath,
    platform: process.platform,
    release: os.release(),
    arch: process.arch,
    cpu: os.cpus()[0]?.model || 'unknown',
  },
  policy: performancePolicy,
  cases: [],
  errors: [],
}
let outputDirectory = path.join(repository, 'performance-results')
let temporaryDirectory
try {
  const options = parseArguments(process.argv.slice(2))
  outputDirectory = options.output
  report.baseRef = options.base
  const caseIds = performanceCases.map(workload => workload.id)
  if (
    caseIds.length === 0 ||
    caseIds.some(id => typeof id !== 'string' || id.length === 0) ||
    new Set(caseIds).size !== caseIds.length
  ) {
    throw new Error('Performance workloads must have nonempty, unique case IDs')
  }
  report.baselineCommit = runCommand('git', ['rev-parse', '--verify', '--end-of-options', `${options.base}^{commit}`])
  report.candidateCommit = runCommand('git', ['rev-parse', 'HEAD'])
  report.workingTree = runCommand('git', ['status', '--porcelain'])
  report.environment.typescript = JSON.parse(
    readFileSync(path.join(repository, 'node_modules/typescript/package.json'), 'utf8'),
  ).version
  temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), 'semverint-performance-'))
  const baselineSource = path.join(temporaryDirectory, 'baseline-source')
  mkdirSync(baselineSource)
  const archivePath = path.join(temporaryDirectory, 'baseline.tar')
  runCommand('git', ['archive', '--format=tar', '--output', archivePath, report.baselineCommit])
  runCommand('tar', ['-xf', archivePath, '-C', baselineSource])
  report.builds = {
    baseline: compilePackage(baselineSource, path.join(temporaryDirectory, 'baseline-artifact')),
    candidate: compilePackage(repository, path.join(temporaryDirectory, 'candidate-artifact')),
  }

  // Measure error references first so every completed workload keeps its evaluation if a later worker fails.
  const referenceIds = new Set(performanceCases.map(workload => workload.cpuErrorReferenceCase).filter(Boolean))
  const referenceWorkloads = performanceCases.filter(workload => referenceIds.has(workload.id))
  const otherWorkloads = performanceCases.filter(workload => !referenceIds.has(workload.id))
  for (const workload of [...referenceWorkloads, ...otherWorkloads]) {
    process.stdout.write(`Measuring ${workload.id}\n`)
    const testCase = {
      workload,
      baseline: { memory: [] },
      candidate: { memory: [] },
      evaluation: { status: 'fail', comparison: 'incomplete', problems: [] },
    }
    report.cases.push(testCase)
    recordMeasurement(testCase, 'baseline', report.builds.baseline.entrypoint, 'cpu')
    recordMeasurement(testCase, 'candidate', report.builds.candidate.entrypoint, 'cpu')
    for (let trial = 0; trial < performancePolicy.memoryTrials; trial += 1) {
      recordMeasurement(testCase, 'baseline', report.builds.baseline.entrypoint, 'memory')
      recordMeasurement(testCase, 'candidate', report.builds.candidate.entrypoint, 'memory')
    }
    const referenceCase = report.cases.find(item => item.workload.id === workload.cpuErrorReferenceCase)
    const evaluation = checkPerformanceBudgets(workload, testCase.baseline, testCase.candidate, referenceCase)
    testCase.evaluation = evaluation
    process.stdout.write(`${workload.id}: ${evaluation.status} (${evaluation.comparison})\n`)
  }
  report.status = report.cases.every(testCase => testCase.evaluation.status === 'pass') ? 'pass' : 'fail'
} catch (error) {
  report.errors.push(`${error.name}: ${error.message}`.slice(0, 4000))
} finally {
  // This is the only tree the coordinator removes; source checkouts stay untouched.
  if (temporaryDirectory) {
    try {
      rmSync(temporaryDirectory, { recursive: true, force: true })
    } catch (error) {
      report.errors.push(`Temporary artifact cleanup failed: ${error.message}`)
      report.status = 'fail'
    }
  }
  report.finishedAt = new Date().toISOString()
  mkdirSync(outputDirectory, { recursive: true })
  writeFileSync(path.join(outputDirectory, 'results.json'), `${JSON.stringify(report, undefined, 2)}\n`)
  writeFileSync(path.join(outputDirectory, 'summary.md'), renderSummary(report))
  process.stdout.write(`Performance ${report.status}: ${path.join(outputDirectory, 'summary.md')}\n`)
  if (report.status !== 'pass') process.exitCode = 1
}
