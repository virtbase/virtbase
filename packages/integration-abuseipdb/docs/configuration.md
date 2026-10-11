# Configuration

| Field | Kind | Value |
| --- | --- | --- |
| `confidenceThreshold` | setting | 0–100, default 50. Below it, a reported address is ignored. |
| `maxAgeInDays` | setting | 1–365, default 30. How far back AbuseIPDB looks. |
| `blockPrefixLength` | setting | 16–32, default 24. The largest block one `check-block` call asks about; a wider target is split into blocks of this size. The abuse poller offers /24 targets, so a value below 24 changes nothing, and each step above 24 doubles the calls one target costs. |
| `callsPerRun` | setting | 1–500, default 4. Calls one sweep may make; four per hourly run is 96 a day, which fits a free key's daily `check-block` allowance. |
| `enrichCategories` | setting | Off by default. One extra call per finding, so a case names what it was reported for. |
| `allowReporting` | setting | Off by default. While off, `ipReputation.report` refuses with `abuseipdb.reporting_disabled`. |
| `apiKey` | secret | At least 20 characters; sent as the `Key` header. |

A blank field means "not set": a number takes its default, and a switch is off.

`callsPerRun` sizes the sweep against the key's plan. AbuseIPDB caps
`check-block` per day and per plan; check the limits of the key's plan in
AbuseIPDB's documentation (https://docs.abuseipdb.com/) before raising it.

A target whose blocks outnumber the calls of one run is never started: with
`blockPrefixLength` 26, a /24 target is four blocks, and needs `callsPerRun` of
at least 4.
