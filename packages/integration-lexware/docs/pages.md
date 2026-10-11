# Pages

None of its own. The admin console's generic integration page configures it.
Customers reach Lexware's PDFs only through the `invoices` router in
`packages/api/src/router/invoices.ts`, which checks that the invoice belongs to
the signed-in user before it calls `downloadInvoice()`.
