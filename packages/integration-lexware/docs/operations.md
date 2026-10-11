# Operations

The health probe reads the German collective contact
(`COUNTRY_CONTACTS.DE`). It runs from `/api/cron/check-integration-health`
every 30 minutes and from "Check now" in the admin console.

| Health | Meaning |
| --- | --- |
| ok | The key is valid and the contact exists. |
| error, `answered 401` | The key is wrong or revoked. |
| error, `answered 404` | The German collective contact is gone from the organisation. |
| error, `answered 429` or `5xx` | Lexware is rate limiting or failing; it clears on its own. |

## Common failures

- **"No collective contact is configured for country XX."** The customer's
  billing country has no entry in `COUNTRY_CONTACTS`. No request reached
  Lexware and no invoice exists. Create the contact and add its id.
- **"The collective contact … does not exist in Lexware."** The id in
  `COUNTRY_CONTACTS` does not match a contact of the organisation behind the
  key, which happens when the key belongs to another organisation.
- **The invoice email did not arrive.** `sendInvoiceStep` fails the run with a
  `FatalError` when the PDF download fails; the invoice exists in Lexware and
  in `invoices`, and the customer can download it from their invoices page.

`generateInvoiceStep` retries on any error and does not read `retryable`, so
a retried step can still issue a second invoice (risk C19). After a run that
failed in that step, check Lexware for duplicates; an error that reads
"Invoice … was created, but reading it back failed." names the invoice that
exists.

## Rotating the key

Create the new key, paste it, and press "Check now". The health probe proves
the key and the contact; revoke the old key afterwards.
