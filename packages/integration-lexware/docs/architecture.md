# Architecture

Lexware provides one port, `invoice` (`InvoiceProvider` in `@virtbase/ports`),
and consumes none.

| Entry point | Holds |
| --- | --- |
| `./manifest` | the manifest and the secrets schema |
| the runtime root, `src/index.ts` | the `invoice` factory and the health probe |

`src/client.ts` is the only code that talks to Lexware, through `ctx.http`.
`src/adapter.ts` maps the port onto it.

## Creating an invoice

1. `createInvoiceWorkflow` in `packages/api/src/workflows/create-invoice`
   calls `createInvoice()` from its `generateInvoiceStep`.
2. The adapter looks up the collective contact for the billing country in
   `COUNTRY_CONTACTS`. A country without one is refused before any request,
   because Lexware would otherwise bill a default contact.
3. It reads that contact (`GET /contacts/:id`), then posts the invoice
   (`POST /invoices`, with `finalize=true` when the caller asks for it). Line
   items carry gross unit prices in euros under `taxType: "gross"`; a country
   other than `HOME_COUNTRY` adds `taxSubType: "electronicServices"` for the
   One-Stop-Shop.
4. The create answer holds only an id, so the adapter reads the invoice back
   (`GET /invoices/:id`) and returns its number and amounts in cents.

`storeInvoiceStep` reads the invoice again by id and stores it in `invoices`;
`sendInvoiceStep` downloads the PDF (`GET /invoices/:id/file`) and emails it.

## Document copy

Every key of `invoiceMessages` in `src/messages.ts` (the unit name, title,
introduction, remark and payment-term label) is document text, in English,
German, Dutch and French. The payment term itself is `PAYMENT_TERM_DAYS` in
`src/adapter.ts`. This text is rendered by Lexware into the PDF, not shown in
the admin console, so it is not in the `lexware-integration` namespace.
Lexware renders the document itself only in German and English: German for
German addresses, English for every other.

## Errors

The client throws `IntegrationError`s: `lexware.request_failed` with the HTTP
status in `params.status`, retryable for 429 and 5xx, and
`lexware.unexpected_response` for a body that does not parse. The adapter
wraps each in a `PortError` of the `invoice` port.

- A read or a download keeps the client's `retryable` flag.
- A failed create is retryable only after a 429 (`isCreateRetryable`), which
  Lexware answers before it processes the request. After a timeout, a lost
  connection or a 5xx the invoice may exist, so the error is not retryable.
- A failed read-back after a successful create is never retryable, and its
  message names the created invoice's id.

`POST /invoices` is never retried by `ctx.http`.
