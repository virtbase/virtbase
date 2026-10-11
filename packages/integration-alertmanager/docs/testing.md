# Testing

| Test | Proves |
| --- | --- |
| `conformance.test.ts` | the conformance suite of `@virtbase/integration-testing` |
| `webhook.test.ts` | through the registry's webhook resolver: the bearer check; the 400, 404 and 413 answers; the `alertmanager`, `grafana` and `generic` payload formats, each handed to a fake `signals` port; the log line when ingest fails after the 200; and the same `externalId` for an alert sent twice |
| `parse.test.ts` | the mapping from Alertmanager, Grafana and generic payloads to signals |

To try it against a real Alertmanager, add the receiver from
`configuration.md` and fire a test alert with `amtool alert add`.
