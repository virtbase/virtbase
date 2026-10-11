# Operations

AbuseIPDB has no health probe: every call spends daily quota, and a probe every
30 minutes spent it on nothing (risk C5). The key is checked once when an
operator enables the integration. After that, a sweep that AbuseIPDB answers
with an error that is not retryable fails: the abuse poller reports it to
Sentry and as the `abuse.source.poll_failed` notification.

## Common failures

- **Enabling, or the poller's `abuse.source.poll_failed`, reports "answered
  401".** AbuseIPDB refuses the key; create a new one.
- **Sweeps stop early with "quota exhausted".** The daily quota is spent; the
  uncovered ranges are swept on the next run. Lower `callsPerRun`, switch off
  `enrichCategories`, or move to a larger plan.
- **Sweeps cover nothing and log "Skipping a target wider than one run can
  sweep".** The warning names the range and its block count: with
  `blockPrefixLength` above 24, a /24 target needs more calls than
  `callsPerRun` allows. Lower `blockPrefixLength` to 24, or raise `callsPerRun`
  to at least the block count.
