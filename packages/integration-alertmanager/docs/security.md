# Security

## What it trusts

Nothing in an alert enforces by itself. A signal reaches enforcement only
through an abuse rule that opts the source in with `trusted_source`.

## Untrusted input

The whole request body. It is parsed with a schema before anything else reads
it, batches are capped at 200 alerts, and labels are only ever data.

## Secrets

The ingest token is the only secret. It is compared in constant time, and the
endpoint answers 404 rather than 401 to a missing or wrong token. Anyone holding
the token can open abuse cases against customers' servers, so rotate it when a
person with access to the alerting stack leaves.
