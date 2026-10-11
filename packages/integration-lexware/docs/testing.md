# Testing

`src/__tests__/fake-lexware.ts` plays the Lexware Office API as a `fetch`
behind `ctx.http`: contacts, invoice creation validated against
`InvoiceForCreateSchema`, read-back with totals computed from the line items,
and the PDF download. It records every payload and `finalize` flag.

| File | What it proves |
| --- | --- |
| `adapter.test.ts` | the exact payload, the contact checks and the error mapping |
| `client.test.ts` | the bearer token, the error codes, and that a create is never retried |
| `messages.test.ts` | the locale fallback |
| `contracts.test.ts` | the `invoice` contract suite from `@virtbase/integration-testing` |
| `conformance.test.ts` | the conformance suite |

Run them with `bun -F @virtbase/integration-lexware test`.

Against the real provider, use a Lexware Office test organisation: create its
collective contacts, put their ids into `COUNTRY_CONTACTS` locally, enable the
integration with that organisation's key, and place an order on a preview or
local deployment. Outside production `generateInvoiceStep` creates drafts
(`isProductionDeployment`, risk C32), so no numbered invoice is issued;
`storeInvoiceStep` then stops the run, because a draft has no number.
