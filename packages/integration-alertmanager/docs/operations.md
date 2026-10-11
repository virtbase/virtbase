# Operations

The integration has no health probe: it owns no outbound connection, and the
registry already reports configuration it cannot parse.

## The webhook's answers

| Status | Meaning |
| --- | --- |
| 200 `{ "accepted": n }` | `n` alerts were parsed and handed to the `signals` port, which ingests them after the response |
| 400 | the body is not JSON, or not the configured payload format; the answer lists the schema issues |
| 404 | no bearer token, or the wrong one. Deliberately not 401, so an unauthenticated caller learns nothing about the endpoint. Also the answer when the integration is disabled or its configuration is invalid |
| 413 | more than 200 alerts in one request; set `max_alerts: 200` on the receiver (`configuration.md`) |
| 500 | the handler threw, for example because no integration provides the `signals` port; the app's webhook route reports the error to Sentry, tagged `integration.id: alertmanager` |

Alertmanager's webhook notifier retries a 5xx answer and a network error. It
does not retry a 4xx: a 400, 404 or 413 fails that notification, and the alerts
reach Virtbase only if a later flush of the aggregation group succeeds. While
the cause persists, every flush fails the same way and no alert of the group
arrives.

## Common failures

- **Alertmanager reports 404.** Compare the receiver's `credentials` with the
  stored ingest token, and check that the integration is enabled.
- **Alertmanager reports 413.** The receiver has no `max_alerts`, or one above
  200.
- **Alertmanager reports 500.** Look up the Sentry event tagged
  `integration.id: alertmanager`.
- **The webhook answered 200 but nothing was recorded.** Ingest runs after the
  response, and a failure there is only logged, as
  `[integrations:alertmanager] Failed to ingest alerts` with the error and the
  number of alerts. Alertmanager counts the 200 as delivered, so the same alerts
  arrive again only after the group's `repeat_interval`, or earlier when the
  group changes.
- **Alerts are accepted but no case opens.** Check the alert's
  `virtbase_type`: only a type with the `abuse.` prefix opens a case. Then
  check its subject labels: an alert that is attributed to no customer only
  notifies `abuse.signal.unattributed` (`events.md`).
- **A case opens but nothing is enforced.** Either no abuse rule with
  `trusted_source` matched the signal, so the case is in `triage`, or the
  attribution was stale, so the trusted rule's case is `open` with no
  enforcement.
