# Outgoing webhooks

Delivers operator notifications as signed JSON to any HTTPS endpoint: the way to
reach Slack, Teams, a paging service or an automation tool without a dedicated
integration. It provides the `notifications` port for operator audiences only.

## Quick start

1. Enable the integration in Integrations → Outgoing webhooks. It has no
   settings of its own.
2. In Notifications, add a target of the webhook channel: the endpoint URL and,
   optionally, a signing secret.
3. Choose the notification keys and the minimum severity the target receives.
