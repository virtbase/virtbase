# Security

## What it trusts

Lexware's answers are parsed with a schema before use, and only the voucher
number, the voucher date and the totals are read. A PDF is passed through as
bytes and never parsed.

## Untrusted input

The customer controls their name and billing address. They become fields of
the JSON invoice body and are rendered by Lexware into the PDF; nothing builds
markup or a URL from them. Invoice ids reach URLs only through
`encodeURIComponent`.

The billing country decides the collective contact and the tax treatment.
`isContactCountry` checks it as an own property of `COUNTRY_CONTACTS`, so a
value such as `constructor` cannot select an inherited key.

## Who sees what

Invoices are personal data: name, address and what was bought. Only the
invoice's owner can download it, and the check is in the `invoices` router,
not in this integration.

## Secrets

The API key is the only secret. It travels in the `Authorization` header,
never in a URL, and `ctx.http` and `ctx.logger` redact it. With the key, an
attacker could read every invoice and contact of the organisation and issue
invoices in its name, so it is write-only in the admin console.
