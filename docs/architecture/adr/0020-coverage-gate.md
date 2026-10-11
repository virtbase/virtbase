# ADR 0020: Coverage thresholds are enforced per package from lcov, not by Bun alone

- Status: Accepted (2026-10-11)
- Date: 2026-10-11
- Requirement: R10

## Context

R10 asks for coverage thresholds that fail CI:

- at least 90 % of lines and functions for `integration-sdk`, `events`, the
  `ports` contract suites and `config`;
- at least 80 % for each integration.

Checked against Bun 1.4.3, `coverageThreshold` cannot enforce this:

- **It checks each file, not the package total.**
- **When it fails, it prints nothing about the threshold.** The output says
  "1 pass, 0 fail", and only the exit code is 1.
- **It only runs with `--coverage`,** so `bun run test` never applies it.
- **It counts files from sibling packages** that the tests load. Lexware's
  report holds 3 of its own files, 41 from `utils` and 15 from `ports`.
- **Files no test imports are missing from the report entirely.** Alertmanager
  shows 100 % with 1 of its 5 files loaded.

Today CI runs `bun run test:coverage` and prints a line-only summary that
reports and never fails.

Current totals for each package's own files, from the lcov files of 2026-10-10:

| Package | Lines | Functions |
| --- | --- | --- |
| `integration-sdk` | 57.0 % | 57.1 % |
| `config` | 95.8 % | 98.4 % |
| `abuseipdb` | 66.6 % | 81.8 % |
| `alertmanager` | 100 % | 100 % (1 of 5 files) |
| `discord` | 76.9 % | 85.2 % |
| `lexware` | 94.7 % | 90.9 % |
| `powerdns` | 77.6 % | 83.3 % |
| `prometheus` | 95.1 % | 89.2 % |
| `webhook` | 100 % | 75.0 % |
| `api` | 60.6 % | 78.7 % |

`stripe`, `anonpay` and `ports` have no tests.

## Decision

### Count each package's own files only

Every package's `bunfig.toml` sets
`coveragePathIgnorePatterns = ["../**", "**/__tests__/**"]`, so its report
covers its own source.

### Enforce totals with a script

`tooling/coverage-gate/check.ts` runs after `test:coverage`. For each package
it:

- sums `LF/LH` and `FNF/FNH` from the package's `lcov.info`;
- adds every `src/**/*.ts` file the report does not mention as fully
  uncovered;
- compares the totals with the thresholds;
- prints one readable line per failing package and exits non-zero.

Type-only files and generated files are excluded by a short, reviewed list.

### Thresholds sit next to the code

Each package's `package.json` holds its thresholds under
`"virtbase": { "coverage": { "lines": 0.9, "functions": 0.9 } }`. Raising one is
part of the change that earns it, and lowering one is visible in review.

The thresholds take effect phase by phase:

- the SDK, `config` and `ports` from the end of Phase 1;
- `events` from its first PR;
- each integration when it is migrated in Phase 1.

A package below its threshold has a written plan in its PR, and is never marked
done in that state.

## Consequences

- **Today's numbers are flattering,** because unloaded files are invisible.
  Several packages will fall when the gate counts every file. The Phase 1 plan
  budgets for the tests that brings.
- **CI's coverage step changes** from a report to a gate. The existing summary
  stays, as a readable table in the job output.
- **The gate does not depend on Bun's file-level threshold semantics,** so a Bun
  upgrade cannot quietly change what passes.
