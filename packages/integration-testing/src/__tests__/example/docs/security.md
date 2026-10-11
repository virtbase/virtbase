# Security

The example integration trusts its provider's answers to `GET /status` and
nothing else; no provider data reaches a page or a customer.

The API key is its only secret. It is sent in an `Authorization` header, never
in a URL, and `ctx.http` and `ctx.logger` redact it from errors and logs. An
attacker holding the key could read the provider's status and nothing more.
