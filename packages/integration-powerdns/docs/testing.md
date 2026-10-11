# Testing

`src/__tests__/fake-powerdns.ts` is a fake PowerDNS API as a `fetch`: it answers
the server-info request and the zone `PATCH`, and checks the `X-API-Key` header.

| Test | Proves |
| --- | --- |
| `conformance.test.ts` | the conformance suite of `@virtbase/integration-testing` |
| `adapter.test.ts` | the `dns` contract suite against the fake, and how failures become `PortError`s |
| `utils.test.ts` | the PTR names for IPv4, IPv6 and RFC 2317 zones |

To try it against a real server, run PowerDNS with `api=yes` and point a
development installation at it.
