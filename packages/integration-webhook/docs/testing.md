# Testing

The tests inject a fake endpoint into `ctx.http`.

| Test | Proves |
| --- | --- |
| `conformance.test.ts` | the conformance suite of `@virtbase/integration-testing` |
| `channel.test.ts` | the payload, the signature over timestamp and body, the operator-only audience, the error codes, the endpoint's body left out of every error, the redaction of the URL and the secret, and the `notifications` contract suite with the URL as a secret and a network error as the forced failure |
| `index.test.ts` | the runtime's `notifications` factory, resolved through an `IntegrationRegistry` and posting through its `ctx.http` |

To try it against a real receiver, point a target at a request bin and check the
signature with the recipe in `configuration.md`.
