import { describe, expect, it } from 'vitest'

import { checkPerformanceBudgets } from './test/checkPerformanceBudgets.mjs'
import { performanceCases } from './test/performanceCases.mjs'

const MiB = 1024 * 1024
const ordinaryCase = performanceCases[0]
const wideRoundingCase = performanceCases.find(workload => workload.id === 'wide-round-P128-D140')

function memoryReading() {
  return { rss: 64 * MiB, heapTotal: 16 * MiB, heapUsed: 8 * MiB, external: MiB, arrayBuffers: 0 }
}

function successfulOutcome() {
  return { status: 'success', versionStr: '102039999999999', errors: [] }
}

function profile(cpuSamples = [1, 1, 1, 1, 1, 1, 1], workload = ordinaryCase) {
  const metadata = {
    gcAvailable: true,
    startupMemory: memoryReading(),
    initialMemory: memoryReading(),
    outcome: successfulOutcome(),
    checksum: 1000,
  }
  const samples = [workload.warmupIterations, ...workload.memoryCheckpoints].map((iterations, index) => ({
    phase: index === 0 ? 'warmup' : 'checkpoint',
    iterations,
    beforeGc: memoryReading(),
    afterGc: memoryReading(),
  }))
  return {
    cpu: {
      ...structuredClone(metadata),
      mode: 'cpu',
      batches: cpuSamples.map(cpuUsPerCall => ({
        iterations: workload.cpuIterations,
        cpuUs: cpuUsPerCall * workload.cpuIterations,
        wallUs: cpuUsPerCall * workload.cpuIterations,
      })),
    },
    memory: [0, 1, 2].map(() => ({
      ...structuredClone(metadata),
      mode: 'memory',
      samples: structuredClone(samples),
      sampleEveryCalls: 100,
      sampledPeakHeapBytes: 12 * MiB,
      temporaryHeapGrowthBytes: 4 * MiB,
      retainedHeapGrowthBytes: 0.5 * MiB,
      peakRssBytes: 64 * MiB,
    })),
  }
}

function setMemoryMetric(measurements, metric, values) {
  for (const [index, trial] of measurements.memory.entries()) trial[metric] = values[index]
}

function unsupportedProfile(workload = wideRoundingCase) {
  const measurements = profile(undefined, workload)
  for (const measurement of [measurements.cpu, ...measurements.memory]) {
    measurement.outcome = { status: 'exception', ...workload.allowedBaselineException }
  }
  return measurements
}

describe('CPU performance budgets', () => {
  it('accepts equivalent measurements and reports both medians and the limit', () => {
    const result = checkPerformanceBudgets(ordinaryCase, profile(), profile())
    expect(result.status).toBe('pass')
    expect(result.cpu.baseline.medianCpuUs).toBe(1)
    expect(result.cpu.candidate.medianCpuUs).toBe(1)
    expect(result.cpu.limitUs).toBe(3)
  })

  it('fails when five of seven batches exceed the large regression limit', () => {
    const result = checkPerformanceBudgets(ordinaryCase, profile(), profile([4, 4, 4, 4, 4, 1, 1]))
    expect(result.status).toBe('fail')
    expect(result.cpu.exceededBatches).toBe(5)
  })

  it.each([
    [100, 1, 1, 1, 1, 1, 1],
    [4, 4, 4, 4, 1, 1, 1],
  ])('does not fail on fewer than five slow batches: %j', (...samples) => {
    expect(checkPerformanceBudgets(ordinaryCase, profile(), profile(samples)).status).toBe('pass')
  })

  it('accepts large ratios below the absolute noise floor', () => {
    const baseline = profile([0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01])
    const candidate = profile([0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.05])
    expect(checkPerformanceBudgets(ordinaryCase, baseline, candidate).status).toBe('pass')
  })

  it('accepts equality at the ratio limit, but fails above it', () => {
    expect(checkPerformanceBudgets(ordinaryCase, profile(), profile([3, 3, 3, 3, 3, 3, 3])).status).toBe('pass')
    expect(checkPerformanceBudgets(ordinaryCase, profile(), profile([3.001, 3.001, 3.001, 3.001, 3.001, 3, 3])).status).toBe(
      'fail',
    )
  })

  it('accepts equality at the absolute increase limit', () => {
    const baseline = profile([0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01])
    const candidate = profile([0.11, 0.11, 0.11, 0.11, 0.11, 0.11, 0.11])
    expect(checkPerformanceBudgets(ordinaryCase, baseline, candidate).status).toBe('pass')
  })

  it('keeps changed conversion outcomes visible without disabling CPU checks', () => {
    const candidate = profile([10, 10, 10, 10, 10, 10, 10])
    for (const measurement of [candidate.cpu, ...candidate.memory]) measurement.outcome.versionStr = '999'
    const result = checkPerformanceBudgets(ordinaryCase, profile(), candidate)
    expect(result.outcomeChanged).toBe(true)
    expect(result.cpu.status).toBe('fail')
    expect(result.status).toBe('fail')
  })
})

describe.each([
  ['temporaryHeapGrowthBytes', 12 * MiB],
  ['retainedHeapGrowthBytes', 2.5 * MiB],
  ['peakRssBytes', 96 * MiB],
])('%s memory budgets', (metric, limit) => {
  it('fails when two trials exceed the limit', () => {
    const candidate = profile()
    setMemoryMetric(candidate, metric, [limit + 1, limit + 1, limit])
    const result = checkPerformanceBudgets(ordinaryCase, profile(), candidate)
    expect(result.status).toBe('fail')
    expect(result.memory.metrics.find(item => item.metric === metric).limitBytes).toBe(limit)
  })

  it('accepts a single memory outlier', () => {
    const candidate = profile()
    setMemoryMetric(candidate, metric, [limit * 100, limit, limit])
    expect(checkPerformanceBudgets(ordinaryCase, profile(), candidate).status).toBe('pass')
  })

  it('accepts equality at the limit', () => {
    const candidate = profile()
    setMemoryMetric(candidate, metric, [limit, limit, limit])
    expect(checkPerformanceBudgets(ordinaryCase, profile(), candidate).status).toBe('pass')
  })
})

it('uses the ratio allowance when it is greater than the additive heap allowance', () => {
  const baseline = profile()
  const candidate = profile()
  setMemoryMetric(baseline, 'temporaryHeapGrowthBytes', [16 * MiB, 16 * MiB, 16 * MiB])
  setMemoryMetric(candidate, 'temporaryHeapGrowthBytes', [32 * MiB, 32 * MiB, 32 * MiB])
  const result = checkPerformanceBudgets(ordinaryCase, baseline, candidate)
  expect(result.status).toBe('pass')
  expect(result.memory.metrics[0].limitBytes).toBe(32 * MiB)
})

it('does not turn negative post-GC baseline noise into a smaller retention allowance', () => {
  const baseline = profile()
  const candidate = profile()
  setMemoryMetric(baseline, 'retainedHeapGrowthBytes', [-MiB, -MiB, -MiB])
  setMemoryMetric(candidate, 'retainedHeapGrowthBytes', [2 * MiB, 2 * MiB, 2 * MiB])
  const result = checkPerformanceBudgets(ordinaryCase, baseline, candidate)
  expect(result.status).toBe('pass')
  expect(result.memory.metrics.find(metric => metric.metric === 'retainedHeapGrowthBytes').limitBytes).toBe(2 * MiB)
})

describe('invalid performance measurements', () => {
  it('rejects a zero-conversion workload even when clock overhead supplies positive CPU samples', () => {
    const workload = { ...ordinaryCase, cpuIterations: 0 }
    const measurements = profile(undefined, workload)
    for (const batch of measurements.cpu.batches) {
      batch.cpuUs = 10
      batch.wallUs = 10
    }
    expect(checkPerformanceBudgets(workload, measurements, measurements).status).toBe('fail')
  })

  const invalidProfiles = [
    ['missing profile', () => undefined],
    ['missing CPU', measurement => delete measurement.cpu],
    [
      'worker process failure',
      measurement => (measurement.cpu = { failure: { name: 'WorkerFailure', message: 'signal SIGTERM' } }),
    ],
    ['missing memory trial', measurement => measurement.memory.pop()],
    ['missing CPU batch', measurement => measurement.cpu.batches.pop()],
    ['NaN CPU', measurement => (measurement.cpu.batches[0].cpuUs = NaN)],
    ['infinite CPU', measurement => (measurement.cpu.batches[0].cpuUs = Infinity)],
    ['zero CPU', measurement => (measurement.cpu.batches[0].cpuUs = 0)],
    ['negative CPU', measurement => (measurement.cpu.batches[0].cpuUs = -1)],
    ['missing wall time', measurement => delete measurement.cpu.batches[0].wallUs],
    ['missing heap metric', measurement => delete measurement.memory[0].temporaryHeapGrowthBytes],
    ['missing sampled peak', measurement => delete measurement.memory[0].sampledPeakHeapBytes],
    ['invalid sampling interval', measurement => (measurement.memory[0].sampleEveryCalls = NaN)],
    ['NaN retained heap', measurement => (measurement.memory[0].retainedHeapGrowthBytes = NaN)],
    ['infinite RSS', measurement => (measurement.memory[0].peakRssBytes = Infinity)],
    ['CPU without GC', measurement => (measurement.cpu.gcAvailable = false)],
    ['memory without GC', measurement => (measurement.memory[0].gcAvailable = false)],
    ['missing startup memory', measurement => delete measurement.cpu.startupMemory],
    ['missing checkpoint', measurement => measurement.memory[0].samples.pop()],
    ['infinite checkpoint heap', measurement => (measurement.memory[0].samples[0].afterGc.heapUsed = Infinity)],
    ['inconsistent trial outcome', measurement => (measurement.memory[0].outcome.versionStr = 'changed')],
  ]

  it.each(invalidProfiles)('fails closed for %s in either build', (_description, invalidate) => {
    let invalid = profile()
    if (_description === 'missing profile') invalid = undefined
    else invalidate(invalid)
    expect(checkPerformanceBudgets(ordinaryCase, profile(), invalid).status).toBe('fail')
    expect(checkPerformanceBudgets(ordinaryCase, invalid, profile()).status).toBe('fail')
  })
})

describe('unsupported workloads and conversion failures', () => {
  it('reports the one known baseline exception as unmeasurable when neither build supports it', () => {
    const result = checkPerformanceBudgets(wideRoundingCase, unsupportedProfile(), unsupportedProfile())
    expect(result.status).toBe('pass')
    expect(result.comparison).toBe('known-unsupported')
    expect(result.cpu.status).toBe('unmeasurable')
    expect(result.memory.status).toBe('unmeasurable')
  })

  it('applies absolute memory limits without inventing a CPU ratio for newly supported input', () => {
    const result = checkPerformanceBudgets(wideRoundingCase, unsupportedProfile(), profile(undefined, wideRoundingCase))
    expect(result.status).toBe('pass')
    expect(result.comparison).toBe('newly-supported')
    expect(result.outcomeChanged).toBe(true)
    expect(result.cpu.status).toBe('unmeasurable')
    expect(result.memory.metrics.map(metric => metric.limitBytes)).toEqual([64 * MiB, 2 * MiB, 256 * MiB])
  })

  it.each([
    ['temporaryHeapGrowthBytes', 64 * MiB],
    ['retainedHeapGrowthBytes', 2 * MiB],
    ['peakRssBytes', 256 * MiB],
  ])('still fails excessive %s for newly supported input', (metric, limit) => {
    const candidate = profile(undefined, wideRoundingCase)
    setMemoryMetric(candidate, metric, [limit + 1, limit + 1, limit])
    expect(checkPerformanceBudgets(wideRoundingCase, unsupportedProfile(), candidate).status).toBe('fail')
  })

  it('fails a candidate exception when the baseline worked, even if that exception was allowed for older baselines', () => {
    const result = checkPerformanceBudgets(wideRoundingCase, profile(undefined, wideRoundingCase), unsupportedProfile())
    expect(result.status).toBe('fail')
  })

  it('rejects unknown baseline failures and different candidate failures', () => {
    const unexpected = unsupportedProfile()
    for (const measurement of [unexpected.cpu, ...unexpected.memory]) measurement.outcome.message = 'different failure'
    expect(checkPerformanceBudgets(wideRoundingCase, unexpected, profile(undefined, wideRoundingCase)).status).toBe('fail')
    expect(checkPerformanceBudgets(wideRoundingCase, unsupportedProfile(), unexpected).status).toBe('fail')
  })

  it('does not allow the known exception in a different workload', () => {
    const unexpected = profile()
    for (const measurement of [unexpected.cpu, ...unexpected.memory]) {
      measurement.outcome = { status: 'exception', ...wideRoundingCase.allowedBaselineException }
    }
    expect(checkPerformanceBudgets(ordinaryCase, unexpected, profile()).status).toBe('fail')
  })
})
