# Operations

The integration has no health probe: it owns no outbound connection, and the
registry already reports configuration it cannot parse.

## The webhook's answers

| Status | Meaning |
| --- | --- |
| 200 `{ "accepted": n }` | `n` alerts were handed to the abuse desk |
| 400 | the body is not JSON, or not the configured payload format; the answer lists the schema issues |
| 404 | no bearer token, or the wrong one. Deliberately not 401, so an unauthenticated caller learns nothing about the endpoint. Also the answer when the integration is disabled |
| 413 | more than 200 alerts in one request; lower Alertmanager's `max_alerts` |

## Common failures

- **Alertmanager reports 404.** Compare the receiver's `credentials` with the
  stored ingest token, and check that the integration is enabled.
- **Alerts are accepted but no case opens.** That is the abuse rules' decision;
  check that a rule matches the alert's category and trusts its source.
