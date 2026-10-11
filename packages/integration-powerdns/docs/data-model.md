# Data model

PowerDNS owns no tables. The records themselves live in PowerDNS; Virtbase's
own copy of which hostname a customer chose is `pointer_records` in core, which
this integration never reads.

The only stored data is its configuration: the API URL as a setting and the API
key as an encrypted secret.
