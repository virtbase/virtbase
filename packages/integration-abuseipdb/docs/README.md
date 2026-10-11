# AbuseIPDB

Sweeps Virtbase's own address ranges for reports filed against them at
AbuseIPDB, and turns each finding into a signal for the abuse desk. It provides
two ports:

- `abuse`: the hourly sweep, called by `/api/cron/poll-abuse-sources`.
  AbuseIPDB has no webhook, so asking is the only way to learn that one of our
  addresses is being reported;
- `ipReputation`: a lookup of one address, and a report back to AbuseIPDB.
  No core code calls `ipReputation` (2026-10-11).

## Quick start

1. Create an API key at abuseipdb.com (Account → API).
2. In Integrations → AbuseIPDB, enter the key, check the thresholds, and enable
   the integration. Enabling checks the key with one lookup.
3. Findings appear on the admin abuse desk as signals; abuse rules decide what
   becomes a case.
