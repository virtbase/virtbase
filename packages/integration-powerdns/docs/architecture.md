# Architecture

| Entry | Holds |
| --- | --- |
| `@virtbase/integration-powerdns/manifest` | identity, links, the `dns` port it provides, the settings and secrets |
| `@virtbase/integration-powerdns` | the runtime: the `dns` factory, the health probe, `localize()` |

## How a request flows

1. A caller in core asks the registry for the capability:
   `await integrations.resolve("dns")`.
2. The registry builds `PowerDnsAdapter` from the stored configuration.
3. The adapter derives the PTR record name from the IP and the zone
   (`buildPtrName` in `src/utils.ts`): reversed octets for IPv4, reversed nibbles
   for IPv6, and the RFC 2317 form for a classless IPv4 zone such as
   `0/25.1.168.192.in-addr.arpa`, whose host must lie in the delegated range
   (here 0 to 127). Zones are compared label by label.
4. `PowerDNSClient` sends one `PATCH /api/v1/servers/localhost/zones/<zone id>`
   with the PTR rrsets, through `ctx.http`. The zone id is PowerDNS's escaped
   zone name (`toZoneId`): `/` becomes `=2F`.

## Errors

- `IntegrationError`s:
  - `powerdns.request_failed` from the client, for a response other than 2xx,
    retryable for 429 and 5xx;
  - `powerdns.unexpected_response` from the client, when the server-info body
    is not PowerDNS's;
  - `powerdns.zone_mismatch` from `buildPtrName`, when the IP is outside the
    zone, never retryable.
- The codes have no translated messages yet: `localize()` has no `errors` slot
  until the typed `localize()` of ADR 0018.
- `ctx.http` adds `powerdns.http_timeout` and `powerdns.http_unreachable`.
- The adapter wraps every failure in a `PortError` for its callers, with the
  `IntegrationError` as `cause`.
