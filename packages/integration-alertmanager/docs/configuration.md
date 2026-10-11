# Configuration

Everything is configured in the admin console, at Integrations → Alertmanager.

| Field | Kind | Value |
| --- | --- | --- |
| `payloadFormat` | setting | `alertmanager` (default), `grafana` (the Alertmanager shape with Grafana's extras), or `generic` (Virtbase's own signal shape). Chosen, never sniffed: guessing wrong on an alerting path fails silently. |
| `defaultSeverity` | setting | `info`, `warning` (default) or `critical`; used for an alert without a `severity` label. |
| `ingestToken` | secret | At least 16 characters, sent as `Authorization: Bearer <token>`. Generate one with `openssl rand -hex 32`. |

The token is required: the endpoint opens abuse cases, and an unauthenticated
one would let anybody open a case against a customer.

## The Alertmanager receiver

```yaml
receivers:
  - name: virtbase
    webhook_configs:
      - url: https://app.example.com/api/integrations/alertmanager/alerts
        http_config:
          authorization:
            type: Bearer
            credentials: <ingest token>
        max_alerts: 200
```

`max_alerts: 200` matches `MAX_ALERTS` in `src/webhook.ts`. The handler answers
413 to a request with more alerts, and Alertmanager does not retry a 4xx;
with `max_alerts` set, Alertmanager leaves the alerts beyond 200 out of the
message and reports their number in `truncatedAlerts` instead.

## The label contract

| Label | Becomes |
| --- | --- |
| `severity` | the signal severity: `critical`, `crit`, `error` and `page` are `critical`; `warning` and `warn` are `warning`; `info` and `none` are `info`. Anything else, or no label, is `defaultSeverity`. |
| `virtbase_type` | the signal type, such as `abuse.ddos`: dot-separated segments of lowercase letters, digits and `_`. A missing or malformed value becomes `alert.<alertname>`, the alert name in snake case. |
| `virtbase_server_id` | the server, unambiguously. |
| `virtbase_ip` | the address, attributed through the IP allocation table **as it stood when the alert fired** (`startsAt`). |
| `virtbase_vmid` with `virtbase_node` | the guest `vmid` on the node whose hostname in `proxmox_nodes.hostname` equals the label. Without `virtbase_node`, the `node` and then the `instance` label is used. A `vmid` with no node identifies nothing. |
| `virtbase_user_id` | the account, for an alert that is not about one machine. |
| `node` or `instance` alone | the node. A node belongs to Virtbase rather than to a customer, so no case opens. |

The labels are tried in the order of the table, from `virtbase_server_id` down,
and the first that matches is the subject (`subjectFromLabels` in
`src/parse.ts`).

| Annotation | Becomes |
| --- | --- |
| `summary`, else `title` | the signal title; the alert name when neither is set |
| `description`, else `message` | the body, followed by Grafana's `valueString` and the alert's `generatorURL` |

The alert's `fingerprint` is the signal's `externalId`. An alert without one, from
a sender other than Alertmanager or Grafana, gets an id built from its sorted
label set, so two firings of the same alert still deduplicate.

What a signal becomes, a case or only a notification, is described in
`events.md`.

## Example rule

Per-guest traffic appears on the node's tap interfaces, and the device name
(`tap<vmid>i<n>`) is the only place the `vmid` exists, so the expression lifts
it out with `label_replace`. On a tap interface the host receives what the guest
sends, so the guest's outbound packets are the host's `receive` counter. The
rule assumes the node exporter's `instance` label is the node's hostname with
an optional port.

```yaml
groups:
  - name: virtbase-abuse
    rules:
      - alert: VirtbaseOutboundPacketFlood
        expr: |
          label_replace(
            label_replace(
              rate(node_network_receive_packets_total{device=~"tap[0-9]+i[0-9]+"}[2m]),
              "virtbase_vmid", "$1", "device", "tap([0-9]+)i[0-9]+"
            ),
            "virtbase_node", "$1", "instance", "([^:]+)(:[0-9]+)?"
          ) > 60000
        for: 3m
        labels:
          severity: critical
          virtbase_type: abuse.ddos
        annotations:
          summary: "Outbound packet flood from VM {{ $labels.virtbase_vmid }}"
          description: "{{ $value | humanize }} packets/s sustained for 3 minutes."
```

Adjust the threshold to the fleet before raising a rule's severity: the
severity is what an abuse rule matches on, and an abuse rule with
`trusted_source` set applies its enforcement without a person.

## The generic format

With `payloadFormat` set to `generic`, the endpoint accepts a signal in the
`signals` port's own shape: one signal, or `{ "signals": [...] }` for a batch.

```json
{
  "externalId": "report-2026-08-28-001",
  "type": "abuse.spam",
  "severity": "warning",
  "subject": { "kind": "ip", "value": "203.0.113.7" },
  "title": "Spam from 203.0.113.7",
  "body": "400 messages in one minute to our MX.",
  "occurredAt": "2026-08-28T09:00:00Z"
}
```

`source` is not accepted from the body and is always `alertmanager`. It is half
of the deduplication key, and a sender that could choose it could collide with,
or overwrite, another sender's signals.

`occurredAt` decides attribution: an `ip` subject is attributed through the IP
allocation table as it stood at that instant, so a report dated when the abuse
happened lands on the customer who held the address then.
