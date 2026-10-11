# Lexware

Lexware Office issues Virtbase's customer invoices. The integration provides the
`invoice` port. For every paid order the invoice workflow creates an invoice,
finalised only on the production deployment, stores its number and amounts,
and emails the PDF. Customers download the same PDF from their invoices page,
and the privacy export attaches it.

## Quick start

1. In Lexware Office, create an API key under Extras → lexoffice API.
2. Make sure the organisation holds a collective contact for every country in
   `COUNTRY_CONTACTS` (`src/constants.ts`); the ids there must match.
3. Open the Lexware page in the admin console, paste the key, and enable it.
   The health probe reads the German collective contact, so a wrong key or a
   missing contact shows as an error within one probe.

See [configuration](configuration.md) and [operations](operations.md).
