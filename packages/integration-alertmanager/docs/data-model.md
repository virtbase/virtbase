# Data model

The integration owns no tables. Signals and cases are core's abuse tables
(`packages/api/src/abuse`); an alert's labels may name an IP or a server, which
core attributes to a customer.
