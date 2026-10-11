# Architecture

| Entry | Holds |
| --- | --- |
| `@virtbase/integration-abuseipdb/manifest` | identity, the settings and secrets schemas |
| `@virtbase/integration-abuseipdb` | the runtime: the `abuse` and `ipReputation` factories, `onEnable`, `localize()` |

## The targets

The ranges come from the platform, not from configuration: an integration must
not read the database, and a source that picked its own targets could be
pointed at somebody else's address space. `collectPollTargets` in
`packages/api/src/abuse/poll.ts` builds them:

1. every IPv4 subnet with an active allocation;
2. rolled up to /24 (`DEFAULT_BLOCK_PREFIX`), so a fleet of /32s costs one call
   per /24 rather than one per server;
3. without every range in `RESERVED` (`packages/api/src/abuse/cidr.ts`):
   private, loopback, carrier-grade NAT, documentation and other unroutable
   ranges, where a call is quota spent on a guaranteed empty answer;
4. ordered never swept first, then longest ago, then most servers, and cut to
   `MAX_TARGETS_PER_RUN`.

## The sweep

1. The abuse poller offers the targets with a budget of two calls per target
   (`CALLS_PER_TARGET_ALLOWANCE`). `AbuseIpDbSource.poll` clamps it to
   `callsPerRun`.
2. `planSweep` (`src/sweep.ts`) splits every target wider than
   `blockPrefixLength` into blocks of that size (`src/blocks.ts`), and plans
   the targets, in the order offered, whose blocks fit the calls the targets
   before them leave. A target with more blocks than the run has calls is
   skipped with a warning; one that fits the run but not what is left waits for
   a later run. A target is never started without the calls to finish it,
   because an unfinished target keeps no cursor and would be offered first on
   every run.
3. Every block costs one `check-block` call, counted against the budget before
   the call, whether it succeeds or fails.
4. Every reported address at or above `confidenceThreshold` that has a report
   date becomes an `InboundSignal`. With `enrichCategories`, one more `check`
   call per finding names the category, spending only calls the blocks of the
   target in progress do not need.
5. A target counts as covered only once every block of it was checked; only
   covered targets advance their watermark.

## Signals

- The type is `abuse.<category>`. `check-block` reports a score, not what the
  reports were for, so the category is `other` unless `enrichCategories` looked
  it up.
- The external id is `<address>:<most recent report>`. A continuing abuser
  produces a fresh signal that joins the open case; a repeated sweep over the
  same report produces the same id, and the intake deduplicates it.
- The severity follows the score: 90 and above is `critical`, 60 and above
  `warning`, anything lower `info`. The score is how sure the reporters are,
  not how bad the abuse is; the abuse rules decide what to act on.

## Reputation

`AbuseIpDbReputation.check` returns AbuseIPDB's `usageType` with the score: a
hosting range scores badly for structural reasons, and a caller reading the
score as evidence about one customer refuses real signups.

## Errors

The client (`src/client.ts`) sends through `ctx.http` and never retries,
because every call costs quota. It throws `IntegrationError`s:

- `abuseipdb.quota_exhausted` on a 429;
- `abuseipdb.request_failed` on any other answer than 2xx, retryable for 5xx,
  with the status and AbuseIPDB's own detail in `params`;
- `abuseipdb.unexpected_response` on a body that is not AbuseIPDB's.

`classifySweepFailure` (`src/sweep.ts`) decides what a failed call means for
the sweep:

| Failure | Block call | Category lookup |
| --- | --- | --- |
| `abuseipdb.quota_exhausted` | the sweep ends and returns what it covered | the same |
| a retryable error (5xx, timeout, unreachable) | the block is logged, its target stays uncovered, the sweep goes on | the finding is filed as `other` |
| any other error | `poll` rejects; the poller reports the run to Sentry and as `abuse.source.poll_failed`, and advances no watermark | the finding is filed as `other` |

A failed lookup never fails the sweep: it costs a finding's category, not the
finding, and a refused key has already failed the `check-block` call before it.

`splitIntoBlocks` adds `abuseipdb.invalid_target` for a malformed target and
`abuseipdb.target_too_wide` for a split into more blocks than
`MAX_CALLS_PER_RUN`; the reputation adapter adds `abuseipdb.reporting_disabled`
and `abuseipdb.no_matching_category`. The codes have no translated messages
until `localize()` gains an `errors` slot (ADR 0018).
