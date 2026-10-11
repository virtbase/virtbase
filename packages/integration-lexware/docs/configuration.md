# Configuration

Lexware has no settings, and one secret.

| Key | Kind | What it is |
| --- | --- | --- |
| `apiKey` | secret | A Lexware Office public API key, sent as a bearer token. Created under Extras → lexoffice API. |

The collective contacts are not configuration: their ids are compiled into
`COUNTRY_CONTACTS` in `src/constants.ts`, one per EU country Virtbase sells to.
Adding a country means creating the contact in Lexware and adding its id
there. Greece is missing from that list (risk C39).
