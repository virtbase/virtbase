# Configuration

| Field | Kind | Value |
| --- | --- | --- |
| `payloadFormat` | setting | `alertmanager` (default), `grafana` (the Alertmanager shape with Grafana's extras), or `generic` (Virtbase's own signal shape). Chosen, never sniffed: guessing wrong on an alerting path fails silently. |
| `defaultSeverity` | setting | `info`, `warning` (default) or `critical`; used for an alert without a `severity` label. |
| `ingestToken` | secret | At least 16 characters, sent as `Authorization: Bearer <token>`. |

## The Alertmanager receiver

```yaml
receivers:
  - name: virtbase
    webhook_configs:
      - url: https://app.example.com/api/integrations/alertmanager/alerts
        http_config:
          authorization:
            credentials: <ingest token>
```
