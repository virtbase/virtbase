# Security

## What it trusts

AbuseIPDB's reports are signals, not verdicts. A signal enforces only through
an abuse rule that trusts the source (`trusted_source`); a fresh database lets
every case wait for a person.

## Untrusted input

Every answer is parsed with a schema before use. Report fields are data in a
signal's title and body.

## Who sees what

A report back is published: it affects the whole range's reputation, and its
comment is public. This package enforces two things: `report` refuses while
`allowReporting` is off, and it cuts the comment to 1024 characters. It does not
inspect the comment, so a caller must:

- only call `report` after an operator confirmed the case;
- never put a customer's identity in the comment.

## Secrets

The API key is the only secret. It travels in the `Key` header, never in a URL,
and `ctx.http` and `ctx.logger` redact it.
