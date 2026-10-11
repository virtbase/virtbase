# Operations

## Health

| Status | Meaning | What to do |
| --- | --- | --- |
| `ok` | `GET /api/v1/servers/localhost` answered with the stored key | nothing |
| `error`, "answered 401" | PowerDNS rejected the key | compare the key with `api-key` in `pdns.conf` |
| `error`, "got no response within 4000 ms" | the API did not answer in time | check that PowerDNS runs, that `api=yes` is set, and that the URL and port are reachable from Virtbase |
| `error`, "not PowerDNS server info" | something other than PowerDNS answered at the URL | check that the URL points at the PowerDNS API, not at a proxy or a web server in front of it |
| `error`, "failed" | the connection failed | check DNS resolution and TLS of the API URL |

## Common failures

- **A customer's record is not created, and the request's Sentry event (from
  Sentry's tRPC middleware) has a `PortError` caused by
  `powerdns.zone_mismatch`.** The IP is outside the subnet's reverse zone, or
  outside the range an RFC 2317 zone delegates. Fix the subnet's reverse zone in
  the admin console.
- **`powerdns.request_failed` with 404.** The zone does not exist in PowerDNS.
  Create it.
