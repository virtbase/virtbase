# Configuration

| Field | Kind | Value |
| --- | --- | --- |
| `apiUrl` | setting | The base URL of the PowerDNS HTTP API, without a trailing slash, for example `https://ns1.example.com:8081`. |
| `apiKey` | secret | The `api-key` from `pdns.conf`. Sent as the `X-API-Key` header and never shown again after saving. |

## Zones

Virtbase writes into the reverse zone set on each subnet (`subnets.dns_reverse_zone`).
The zone must exist in PowerDNS; Virtbase does not create zones. A subnet
without a reverse zone cannot have PTR records: the rDNS API answers a customer
who tries with an error.

## Rotating the key

Change `api-key` in `pdns.conf` and restart PowerDNS, then save the new key here
and press "Check now".
