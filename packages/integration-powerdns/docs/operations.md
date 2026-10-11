# Operations

## Health

| Status | Meaning | What to do |
| --- | --- | --- |
| `ok` | `GET /api/v1/servers/localhost` answered with the stored key | nothing |
| `error`, "answered 401" | PowerDNS rejected the key | compare the key with `api-key` in `pdns.conf` |
| `error`, "got no response within" | the API did not answer in time | check that PowerDNS runs, that `api=yes` is set, and that the URL and port are reachable from Virtbase |
| `error`, "failed" | the connection failed | check DNS resolution and TLS of the API URL |

## Common failures

- **A customer's record is not created, and the log shows
  `powerdns.zone_mismatch`.** The IP is outside the subnet's reverse zone. Fix
  the subnet's reverse zone in the admin console.
- **`powerdns.request_failed` with 404.** The zone does not exist in PowerDNS.
  Create it.
