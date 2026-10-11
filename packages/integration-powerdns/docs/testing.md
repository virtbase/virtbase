# Testing

`src/__tests__/fake-powerdns.ts` is a fake PowerDNS API as a `fetch`: it answers
the server-info request and the zone `PATCH`, decodes PowerDNS zone ids, and
checks the `X-API-Key` header. Unlike PowerDNS, it creates a zone on first use
instead of answering 404, and it does not check the rrsets against PowerDNS's
own validation.

| Test | Proves |
| --- | --- |
| `conformance.test.ts` | the conformance suite of `@virtbase/integration-testing` |
| `adapter.test.ts` | the `dns` contract suite against the fake, how failures become `PortError`s, RFC 2317 zone ids, and the `dns` factory as the registry builds it |
| `utils.test.ts` | the PTR names for IPv4, IPv6 and RFC 2317 zones, and the zone mismatches |

To try it against a real server, run PowerDNS with `api=yes` and point a
development installation at it.
