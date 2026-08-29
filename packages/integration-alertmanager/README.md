# @virtbase/integration-alertmanager

Receives alerts from Prometheus Alertmanager or Grafana at
`POST /api/integrations/alertmanager/alerts` and submits them to the abuse
pipeline through the `signals` port.

Detection is not Virtbase's job. Polling every server for traffic anomalies
would cost more than it catches, and the fleet already has Prometheus watching
it. This integration is the other half of that decision: the alerting stack
decides, and this is where it says so.

## Configuration

Everything is configured in the admin console at
`/admin.virtbase.com/integrations/alertmanager`.

| Field | Kind | Default |
| --- | --- | --- |
| Payload format | setting | `alertmanager` |
| Default severity | setting | `warning` |
| Ingest token | secret | *required* |

The token is required rather than optional. This endpoint opens abuse cases,
and an unauthenticated one would let anybody suspend a customer. Generate one
with `openssl rand -hex 32`.

A request with a missing or wrong token gets a **404**, not a 401 — the same
answer the webhook dispatcher and the Prometheus scrape endpoint give, so the
endpoint cannot be used to confirm that this deployment ingests alerts.

```yaml
# alertmanager.yml
receivers:
  - name: virtbase
    webhook_configs:
      - url: https://virtbase.com/api/integrations/alertmanager/alerts
        http_config:
          authorization:
            type: Bearer
            credentials: "<ingest token>"
        # The endpoint acknowledges and finishes the work afterwards, so a
        # short timeout is correct. Retries are harmless: ingest is an upsert
        # keyed on the alert fingerprint.
        max_alerts: 200
```

## The label contract

| Label | Becomes |
| --- | --- |
| `severity` | `critical` \| `warning` \| `info`, with `crit`/`error`/`page` and `warn` accepted |
| `virtbase_type` | the signal type, e.g. `abuse.ddos`. Falls back to `alert.<alertname>` |
| `virtbase_server_id` | the server, unambiguously |
| `virtbase_vmid` + `virtbase_node` | resolved through `unique(proxmox_node_id, vmid)` |
| `virtbase_ip` | resolved through the IP allocation table **as it stood when the alert fired** |
| `virtbase_user_id` | the account, for alerts that are not about one machine |
| `node` / `instance` | the node, when nothing above matched. Opens no case — a node is ours |

| Annotation | Becomes |
| --- | --- |
| `summary` (or `title`) | the signal title |
| `description` (or `message`) | the body, joined with Grafana's `valueString` and the generator URL |

The `abuse.` prefix on the type is what routes a signal into the case
pipeline. Everything else is recorded and sent to the operator notification
targets without opening a case.

Two behaviours worth knowing:

- **A `resolved` alert becomes a resolved signal**, not a dropped one. That is
  what lets a transient flood release the throttle it caused without an
  operator touching anything.
- **Repeats are free.** Alertmanager re-sends a firing alert every
  `repeat_interval`; ingest upserts on `(source, fingerprint)`, so the second
  and hundredth arrival bump a counter instead of opening a case.

## Example rules

Per-VM traffic appears on the node's tap interfaces, and the device name is
the only place the vmid exists — so it has to be lifted out in the expression
rather than hoped for as a label.

```yaml
groups:
  - name: virtbase-abuse
    rules:
      - alert: VirtbaseOutboundPacketFlood
        expr: |
          label_replace(
            rate(node_network_transmit_packets_total{device=~"tap[0-9]+i[0-9]+"}[2m]),
            "virtbase_vmid", "$1", "device", "tap([0-9]+)i[0-9]+"
          ) > 60000
        for: 3m
        labels:
          severity: critical
          virtbase_type: abuse.ddos
          virtbase_node: "{{ $labels.instance }}"
        annotations:
          summary: "Outbound packet flood from VM {{ $labels.virtbase_vmid }}"
          description: "{{ $value | humanize }} packets/s sustained for 3 minutes."

      - alert: VirtbaseOutboundSmtp
        expr: |
          label_replace(
            rate(node_netstat_Tcp_ActiveOpens{}[5m]),
            "virtbase_vmid", "$1", "device", "tap([0-9]+)i[0-9]+"
          ) > 200
        for: 10m
        labels:
          severity: warning
          virtbase_type: abuse.spam
          virtbase_node: "{{ $labels.instance }}"
        annotations:
          summary: "Sustained outbound SMTP from VM {{ $labels.virtbase_vmid }}"
```

Adjust the thresholds to the fleet before switching a rule from `warning` to
`critical`: the severity is what a rule matches on, and a rule with
`trusted_source` set is allowed to act without a human.

## The generic format

Setting **Payload format** to `generic` accepts a signal in the port's own
wire form, which is what makes "anything that can POST JSON" a source. One
signal, or `{ "signals": [...] }` for a batch.

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

`source` is not accepted from the body. It is half of the deduplication key,
and a sender that could choose it could collide with, or overwrite, another
sender's signals.

`occurredAt` matters more than it looks: attribution reads the IP allocation
table as it stood at that instant, so a report dated when the abuse happened
lands on the customer who held the address then, rather than whoever holds it
now.
