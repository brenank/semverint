import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { performance } from 'node:perf_hooks'

import { performanceCases, performancePolicy } from './performanceCases.mjs'

const request = JSON.parse(readFileSync(0, 'utf8'))
const workload = performanceCases.find(testCase => testCase.id === request.caseId)
if (!workload) throw new Error(`Unknown performance case: ${request.caseId}`)
if (!['cpu', 'memory'].includes(request.mode)) throw new Error(`Unknown measurement mode: ${request.mode}`)
if (typeof global.gc !== 'function') throw new Error('Performance measurements require --expose-gc')

const startupMemory = process.memoryUsage()
const require = createRequire(import.meta.url)
const { SemverIntConverter } = require(request.entrypoint)
global.gc()
// Include input materialization, construction and warm-up retention in memory budgets.
const initialMemory = process.memoryUsage()
const prerelease =
  typeof workload.prerelease === 'string' ? workload.prerelease : workload.prerelease.character.repeat(workload.prerelease.length)
const converter = new SemverIntConverter(workload.config)

function convert() {
  return converter.semverToInt(workload.major || '1', '2', '3', prerelease)
}

function captureOutcome() {
  try {
    const result = convert()
    return {
      status: 'success',
      versionStr: result.versionStr,
      errors: result.errs.map(error => ({
        name: error.name,
        component: error.componentName,
        message: error.message.slice(0, 200),
        messageLength: error.message.length,
      })),
    }
  } catch (error) {
    return { status: 'exception', name: error.name, message: error.message.slice(0, 200) }
  }
}

let checksum = 0
function runCalls(count) {
  for (let index = 0; index < count; index += 1) {
    const result = convert()
    checksum += result.versionStr.length + result.errs.length
  }
}

const measurement = {
  mode: request.mode,
  gcAvailable: true,
  startupMemory,
  initialMemory,
  effectiveConfig: converter.cfg,
  outcome: captureOutcome(),
}

function measureCpu() {
  runCalls(workload.warmupIterations)
  const batches = []
  for (let batch = 0; batch < performancePolicy.cpuBatches; batch += 1) {
    global.gc()
    const cpuBefore = process.cpuUsage()
    const wallBefore = performance.now()
    runCalls(workload.cpuIterations)
    const wallUs = (performance.now() - wallBefore) * 1000
    const cpu = process.cpuUsage(cpuBefore)
    batches.push({ iterations: workload.cpuIterations, cpuUs: cpu.user + cpu.system, wallUs })
  }
  return { batches, checksum }
}

function measureMemory() {
  const samples = []
  let sampledPeakHeapBytes = initialMemory.heapUsed
  let sampledPeakRssBytes = initialMemory.rss

  function sampleMemory() {
    const usage = process.memoryUsage()
    sampledPeakHeapBytes = Math.max(sampledPeakHeapBytes, usage.heapUsed)
    sampledPeakRssBytes = Math.max(sampledPeakRssBytes, usage.rss)
    return usage
  }

  function checkpoint(phase, iterations) {
    const beforeGc = sampleMemory()
    global.gc()
    const afterGc = sampleMemory()
    samples.push({ phase, iterations, beforeGc, afterGc })
  }

  // Sample after short chunks outside CPU measurements. Long inputs use one call
  // per chunk; even these samples can miss a transient peak within a conversion.
  const chunkSize = prerelease.length > 1000 ? 1 : 100
  function runSampledCalls(count) {
    for (let completed = 0; completed < count; completed += chunkSize) {
      runCalls(Math.min(chunkSize, count - completed))
      sampleMemory()
    }
  }

  runSampledCalls(workload.warmupIterations)
  checkpoint('warmup', workload.warmupIterations)
  let completed = 0
  for (const iterations of workload.memoryCheckpoints) {
    runSampledCalls(iterations - completed)
    completed = iterations
    checkpoint('checkpoint', iterations)
  }

  const retainedHeapGrowthBytes = Math.max(...samples.map(sample => sample.afterGc.heapUsed - initialMemory.heapUsed))
  return {
    samples,
    sampleEveryCalls: chunkSize,
    sampledPeakHeapBytes,
    temporaryHeapGrowthBytes: sampledPeakHeapBytes - initialMemory.heapUsed,
    retainedHeapGrowthBytes,
    // Node reports maxRSS in KiB on supported platforms; it includes startup/warm-up.
    peakRssBytes: Math.max(sampledPeakRssBytes, process.resourceUsage().maxRSS * 1024),
    checksum,
  }
}

if (measurement.outcome.status === 'success') {
  Object.assign(measurement, request.mode === 'cpu' ? measureCpu() : measureMemory())
}
process.stdout.write(JSON.stringify(measurement))
