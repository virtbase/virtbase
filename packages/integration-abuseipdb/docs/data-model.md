# Data model

AbuseIPDB owns no tables. Signals and cases are core's abuse tables; the
poller keeps each range's watermark. A finding names an IP address of ours and
AbuseIPDB's report summary, never a reporter's identity.
