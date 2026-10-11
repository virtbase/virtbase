# Testing

The tests inject a fake endpoint into `ctx.http`.

| Test | Proves |
| --- | --- |
| `conformance.test.ts` | the conformance suite of `@virtbase/integration-testing` |
| `channel.test.ts` | the payload, the signature over timestamp and body, the operator-only audience, the error codes, the redaction of the URL and the secret, and the `notifications` contract suite |

To try it against a real receiver, point a target at a request bin and check the
signature with the recipe in `configuration.md`.
