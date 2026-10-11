# Testing

| File | What it proves |
| --- | --- |
| `collectors.test.ts` | every gauge of a snapshot and of `PLATFORM_GAUGE_SUFFIXES`, series replaced when a node goes away, a failed read reported as `platform_collector_up 0` with the last values kept, and the failure a platform gauge name with another label set causes |
| `webhook.test.ts` | the scrape endpoint through the integration registry: the token, the 404s, `no-store`, and no read while platform metrics are off; health `degraded` when core cannot read |
| `runtime.test.ts`, `sink.test.ts`, `names.test.ts`, `manifest.test.ts` | the registry and the names it refuses, the port's recording rules including the platform gauge names it drops, name sanitising and the settings schemas |
| `contracts.test.ts` | the `metrics` contract suite from `@virtbase/integration-testing` |
| `conformance.test.ts` | the conformance suite, with `healthReachesProvider: false` |

`src/__tests__/fake-core.ts` provides `platformMetrics` from a fixed snapshot,
composed next to the integration as core is. Core's own read is tested
against PGlite in `packages/api/src/platform-metrics/__tests__`.

Run them with `bun -F @virtbase/integration-prometheus test`.

Against a real Prometheus, enable the integration locally, then run
`curl -H "Authorization: Bearer <token>" localhost:3000/api/integrations/prometheus/metrics`.
