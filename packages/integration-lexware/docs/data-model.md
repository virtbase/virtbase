# Data model

Lexware owns no tables.

The invoice workflow stores what the port returns in the core `invoices`
table: Lexware's invoice id (`lexware_invoice_id`), the voucher number and the
amounts. The customer's name and billing address are sent to Lexware with
every invoice and kept there, as accounting records; Virtbase does not store a
copy of the PDF.
