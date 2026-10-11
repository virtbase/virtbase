# Security

## What it trusts

PowerDNS's answers are trusted only for their status codes; no response body
reaches a customer.

## Untrusted input

The hostname comes from a customer. Core's rDNS API validates it before it
reaches the adapter; the adapter writes it as a PTR record's content and
nowhere else.

## Secrets

The API key is the only secret. It travels in the `X-API-Key` header, never in
a URL, and `ctx.http` and `ctx.logger` redact it from errors and logs. Anyone
holding it can change every zone the PowerDNS server serves, so rotate it when
a person with access to it leaves.
