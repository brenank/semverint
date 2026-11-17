import { performancePolicy } from './performanceCases.mjs'

function median(values) {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.floor(sorted.length / 2)]
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function validateMemoryReading(reading) {
  return (
    reading &&
    ['rss', 'heapTotal', 'heapUsed', 'external', 'arrayBuffers'].every(key => isFiniteNumber(reading[key]) && reading[key] >= 0)
  )
}

function validateOutcome(outcome) {
  if (!outcome) return false
  if (outcome.status === 'exception') return typeof outcome.name === 'string' && typeof outcome.message === 'string'
  return (
    outcome.status === 'success' &&
    typeof outcome.versionStr === 'string' &&
    Array.isArray(outcome.errors) &&
    outcome.errors.every(
      error =>
        error &&
        typeof error.name === 'string' &&
        typeof error.component === 'string' &&
        typeof error.message === 'string' &&
        Number.isInteger(error.messageLength) &&
        error.messageLength >= error.message.length,
    )
  )
}

function validateProfile(profile, workload, label) {
  const problems = []
  if (!profile?.cpu || !Array.isArray(profile.memory) || profile.memory.length !== performancePolicy.memoryTrials) {
    return [`${label}: expected one CPU measurement and ${performancePolicy.memoryTrials} memory trials`]
  }
  const measurements = [profile.cpu, ...profile.memory]
  for (const [index, measurement] of measurements.entries()) {
    const description = `${label} ${index === 0 ? 'CPU' : `memory trial ${index}`}`
    const mode = index === 0 ? 'cpu' : 'memory'
    if (
      !measurement ||
      measurement.mode !== mode ||
      measurement.gcAvailable !== true ||
      !validateOutcome(measurement.outcome) ||
      !validateMemoryReading(measurement.startupMemory) ||
      !validateMemoryReading(measurement.initialMemory)
    ) {
      problems.push(`${description}: invalid measurement, outcome, startup memory, or GC availability`)
      continue
    }
    if (JSON.stringify(measurement.outcome) !== JSON.stringify(profile.cpu.outcome)) {
      problems.push(`${description}: inconsistent conversion outcome`)
    }
    if (measurement.outcome.status === 'exception') continue
    if (!isFiniteNumber(measurement.checksum) || measurement.checksum <= 0) {
      problems.push(`${description}: missing conversion checksum`)
    }

    if (mode === 'cpu') {
      if (
        !Array.isArray(measurement.batches) ||
        measurement.batches.length !== performancePolicy.cpuBatches ||
        measurement.batches.some(
          batch =>
            !batch ||
            batch.iterations !== workload.cpuIterations ||
            !isFiniteNumber(batch.cpuUs) ||
            batch.cpuUs <= 0 ||
            !isFiniteNumber(batch.wallUs) ||
            batch.wallUs <= 0,
        )
      ) {
        problems.push(`${description}: expected ${performancePolicy.cpuBatches} positive finite CPU/wall batches`)
      }
      continue
    }

    if (
      !isFiniteNumber(measurement.sampledPeakHeapBytes) ||
      measurement.sampledPeakHeapBytes < measurement.initialMemory.heapUsed ||
      !Number.isInteger(measurement.sampleEveryCalls) ||
      measurement.sampleEveryCalls <= 0 ||
      !isFiniteNumber(measurement.temporaryHeapGrowthBytes) ||
      measurement.temporaryHeapGrowthBytes < 0 ||
      !isFiniteNumber(measurement.retainedHeapGrowthBytes) ||
      !isFiniteNumber(measurement.peakRssBytes) ||
      measurement.peakRssBytes <= 0
    ) {
      problems.push(`${description}: invalid or missing heap/RSS metrics`)
    }
    const expectedSamples = [workload.warmupIterations, ...workload.memoryCheckpoints]
    if (
      !Array.isArray(measurement.samples) ||
      measurement.samples.length !== expectedSamples.length ||
      measurement.samples.some(
        (sample, sampleIndex) =>
          !sample ||
          sample.phase !== (sampleIndex === 0 ? 'warmup' : 'checkpoint') ||
          sample.iterations !== expectedSamples[sampleIndex] ||
          !validateMemoryReading(sample.beforeGc) ||
          !validateMemoryReading(sample.afterGc),
      )
    ) {
      problems.push(`${description}: missing or invalid warm-up/checkpoint memory samples`)
    }
  }
  return problems
}

function matchesAllowedException(outcome, allowance) {
  return (
    allowance !== undefined &&
    outcome.status === 'exception' &&
    outcome.name === allowance.name &&
    outcome.message === allowance.message
  )
}

function summarizeCpu(measurement) {
  const cpuSamplesUs = measurement.batches.map(batch => batch.cpuUs / batch.iterations)
  const wallSamplesUs = measurement.batches.map(batch => batch.wallUs / batch.iterations)
  return { medianCpuUs: median(cpuSamplesUs), medianWallUs: median(wallSamplesUs), cpuSamplesUs, wallSamplesUs }
}

export function checkPerformanceBudgets(workload, baseline, candidate) {
  if (!Number.isInteger(workload.cpuIterations) || workload.cpuIterations <= 0) {
    return { status: 'fail', comparison: 'invalid', problems: ['CPU iterations must be a positive integer'] }
  }
  const problems = [...validateProfile(baseline, workload, 'baseline'), ...validateProfile(candidate, workload, 'candidate')]
  const result = { status: 'fail', comparison: 'invalid', problems }
  if (problems.length > 0) return result

  const baselineOutcome = baseline.cpu.outcome
  const candidateOutcome = candidate.cpu.outcome
  result.outcomeChanged = JSON.stringify(baselineOutcome) !== JSON.stringify(candidateOutcome)
  const baselineUnsupported = matchesAllowedException(baselineOutcome, workload.allowedBaselineException)
  if (baselineOutcome.status === 'exception' && !baselineUnsupported) {
    problems.push('Unknown baseline conversion failure; the gate has no valid reference')
    return result
  }
  if (candidateOutcome.status === 'exception') {
    if (baselineUnsupported && matchesAllowedException(candidateOutcome, workload.allowedBaselineException)) {
      result.status = 'pass'
      result.comparison = 'known-unsupported'
      result.cpu = { status: 'unmeasurable', reason: 'Both builds throw the explicitly allowed baseline exception' }
      result.memory = { status: 'unmeasurable', reason: 'Neither build supports this workload' }
      return result
    }
    problems.push('Candidate conversion failed')
    return result
  }

  result.comparison = baselineUnsupported ? 'newly-supported' : 'measured'
  if (baselineUnsupported) {
    result.cpu = { status: 'unmeasurable', reason: 'Newly supported case: no successful baseline CPU reference' }
  } else {
    const baselineCpu = summarizeCpu(baseline.cpu)
    const candidateCpu = summarizeCpu(candidate.cpu)
    const limitUs = Math.max(
      baselineCpu.medianCpuUs * performancePolicy.cpuRatio,
      baselineCpu.medianCpuUs + performancePolicy.cpuMinimumIncreaseUs,
    )
    const exceededBatches = candidateCpu.cpuSamplesUs.filter(sample => sample > limitUs).length
    const failed = candidateCpu.medianCpuUs > limitUs && exceededBatches >= performancePolicy.cpuRequiredSlowBatches
    result.cpu = { status: failed ? 'fail' : 'pass', baseline: baselineCpu, candidate: candidateCpu, limitUs, exceededBatches }
    if (failed) problems.push(`CPU budget exceeded in ${exceededBatches}/${performancePolicy.cpuBatches} batches`)
  }

  const memoryMetrics = []
  for (const [metric, allowance] of Object.entries(performancePolicy.memory)) {
    const baselineSamples = baselineUnsupported ? [] : baseline.memory.map(trial => trial[metric])
    const candidateSamples = candidate.memory.map(trial => trial[metric])
    const baselineMedian = baselineUnsupported ? undefined : median(baselineSamples)
    // Negative retained growth is GC noise, not a credit against the candidate's budget.
    const nonnegativeBaseline = baselineUnsupported ? 0 : Math.max(0, baselineMedian)
    const limitBytes = baselineUnsupported
      ? allowance.unsupportedBaselineLimitBytes
      : Math.max(nonnegativeBaseline * allowance.ratio, nonnegativeBaseline + allowance.additionalBytes)
    const exceededTrials = candidateSamples.filter(sample => sample > limitBytes).length
    const failed = exceededTrials >= performancePolicy.memoryRequiredExceededTrials
    memoryMetrics.push({
      metric,
      status: failed ? 'fail' : 'pass',
      baselineSamples,
      baselineMedian,
      candidateSamples,
      candidateMedian: median(candidateSamples),
      limitBytes,
      exceededTrials,
      allowance,
    })
    if (failed) problems.push(`${metric} budget exceeded in ${exceededTrials}/${performancePolicy.memoryTrials} trials`)
  }
  result.memory = { status: memoryMetrics.some(metric => metric.status === 'fail') ? 'fail' : 'pass', metrics: memoryMetrics }
  result.status = problems.length === 0 ? 'pass' : 'fail'
  return result
}
