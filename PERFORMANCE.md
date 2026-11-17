# CPU and memory budgets

Run `npm run test:performance -- --base origin/main`. The base must already exist locally; the check never fetches or installs
dependencies. Use `--output <directory>` to choose the report directory (default: ignored `performance-results/`). The CLI writes
`results.json` with raw samples and `summary.md` with comparisons, then exits nonzero for a failed budget, invalid measurement,
build failure, or unexpected conversion exception. Worker process failures, timeouts, or invalid output stop collection
immediately and preserve the incomplete case and failed measurement in both reports. Measured budget failures still collect the
remaining workloads.

The coordinator archives the resolved base commit into its own temporary directory and compiles both packages with the candidate's
installed TypeScript CLI and each source tree's `tsconfig.cjs.json`. Emitted code and declarations go into separate temporary
artifacts. It loads the actual public CommonJS entry point with BigInt available, runs the same Node executable for both builds,
and removes its temporary tree afterward. It does not change source checkouts or run base package hooks. The candidate is the
current working tree; the report records its HEAD and working tree changes. CI measures the normal PR merge checkout against the
PR base SHA in a separate job.

Workloads and static limits live in `src/test/performanceCases.mjs`. They cover stable, text, numeric, mixed-tail, component
clamp/error filtering, rounding, wide fields, 100,000-character identifiers with default budgets, and core overflow. Input
descriptors keep huge strings out of reports. Effective configurations, versions, git IDs, runtime/OS/architecture, outcomes,
sample counts, limits, and decisions are recorded. Different outputs or errors stay visible and do not waive a budget: correctness
changes that cost more require review too.

CPU uses a fresh GC-enabled child per build/workload, warm-up, and seven timed batches. Each batch records user + system CPU and
wall time while consuming conversion results. GC is outside the timed loop; input construction and measurement/reporting are
outside it. The gate uses per-call CPU, not wall time. It fails only if the candidate median exceeds both **3x the base median**
and **base + 0.1 µs/call**, and at least **five of seven** candidate batches exceed that limit. These broad static allowances
limit sensitivity to shared-runner noise; they are not throughput promises or statistical significance tests.

Memory uses **three separate children** per build/workload. The baseline is a post-module-load GC reading taken before input
materialization and converter construction. Samples include warm-up and GC checkpoints after increasing iteration counts, so early
input/cache retention remains visible. Temporary heap growth is sampled peak heap minus the initial heap. Retained growth is the
maximum post-GC heap delta across warm-up and checkpoints. Peak RSS includes process startup and the runtime. For each metric, the
reference is the median of three base trials. A metric fails when **two of three** candidate trials exceed its limit:

| Metric                        | Limit                                              |
| ----------------------------- | -------------------------------------------------- |
| Sampled temporary heap growth | max(2x base, base + 8 MiB)                         |
| Post-GC retained heap growth  | max(2x nonnegative base, nonnegative base + 2 MiB) |
| Process peak RSS              | max(1.5x base, base + 32 MiB)                      |

Sampling can miss transient allocations and does not measure total allocated bytes. Heap/RSS and retained growth describe bounded
workloads; passing does not prove leak freedom. The long alphabetic identifier currently encodes its full input before truncating,
so it has material transient allocation even with a D6 component budget.

The P128/D140 rounding case explicitly allows only the legacy `RangeError` with message
`toFixed() digits argument must be between 0 and 100` in the baseline. If both builds throw that exception, the case is reported
as known-unsupported and unmeasurable. If the candidate succeeds, CPU is unmeasurable against that base; absolute temporary
heap/retained heap/RSS limits of **64/2/256 MiB** still apply. An unknown baseline failure invalidates the gate. Any candidate
failure where the baseline worked, or a different candidate failure, fails. Every worker has a **30-second timeout**, and the CI
job has a **10-minute timeout**. No other workload has an exception allowance.

Normal Vitest tests exercise budget decisions with deterministic profiles, including outliers, boundaries, changed outcomes,
invalid measurements, and unsupported cases. They do not time conversions. To verify a regression end to end, run this CLI against
a candidate with a deliberately slower converter and confirm its report fails and the process exits nonzero; do not raise the
policy limits to make a production change pass.
