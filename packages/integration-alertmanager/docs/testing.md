# Testing

| Test | Proves |
| --- | --- |
| `conformance.test.ts` | the conformance suite of `@virtbase/integration-testing` |
| `webhook.test.ts` | the bearer check, the 400, 404 and 413 answers, both payload formats, and the hand-off to a fake `signals` port, through the registry's webhook resolver |
| `parse.test.ts` | the mapping from Alertmanager and generic payloads to signals |

To try it against a real Alertmanager, add the receiver from
`configuration.md` and fire a test alert with `amtool alert add`.
