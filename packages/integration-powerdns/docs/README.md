# PowerDNS

Manages reverse DNS (PTR records) for customer IP addresses in a PowerDNS
Authoritative server, through its HTTP API. It provides the `dns` port, which
two parts of Virtbase use:

- the rDNS API, where a customer sets the hostname of an IP of their server;
- server deletion, which removes the records of a deleted server's addresses.

## Quick start

1. Enable the API in PowerDNS (`api=yes`, `api-key=...` in `pdns.conf`).
2. Create the reverse zones Virtbase writes to, and set each subnet's reverse
   zone in the admin console.
3. In Virtbase, open Integrations → PowerDNS, enter the API URL and the API key,
   and enable it.
4. Press "Check now". `ok` means the API answered with the key.
