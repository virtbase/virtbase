# Testing

`src/__tests__/fake-abuseipdb.ts` is a fake AbuseIPDB API v2 as a `fetch`:
`check`, `check-block` and `report`, behind the `Key` header, with the quota
header on every answer. `calls()` counts every request that reaches it. It does
not model plan limits on block size.

| Test | Proves |
| --- | --- |
| `conformance.test.ts` | the conformance suite of `@virtbase/integration-testing` |
| `contracts.test.ts` | the `abuse` and `ipReputation` contract suites, reporting back, the comment cap, and the key check on enable |
| `client.test.ts` | the quota header, the quota, request and unexpected-response errors, and that none is retried |
| `source.test.ts` | the sweep: thresholds, severities, the call budget, the plan, quota, failures, enrichment, block size |
| `sweep.test.ts` | `planSweep` and `classifySweepFailure` |
| `config.test.ts` | the settings schema, including the C5 fixes |
| `blocks.test.ts` | splitting and counting blocks, and rejecting malformed or too wide ranges |
