# @virtbase/integration-abuseipdb

Sweeps our own address ranges for reports filed against them, and answers
questions about a single address.

The only thing Virtbase polls. Everything else pushes; AbuseIPDB has no
webhook, so the only way to learn that one of our addresses is being reported
is to go and ask.

Provides two capabilities:

- **`abuse`** — the block sweep, driven by `/api/cron/poll-abuse-sources`.
- **`ipReputation`** — one address, checked directly, and the report-back path.

## Configuration

| Field | Kind | Default |
| --- | --- | --- |
| Confidence threshold | setting | `50` |
| Report age (days) | setting | `30` |
| Block size | setting | `24` |
| Calls per run | setting | `4` |
| Look up categories | setting | off |
| Allow reporting back | setting | off |
| API key | secret | *required* |

**Calls per run** is the one to get right. `check-block` is capped by plan, and
so is the daily allowance. Four calls an hour is 96 a day, which fits inside a
free key with room to spare; raise it with the plan, and check the numbers
against the live documentation rather than this file — they change.

**Block size** must not be wider than the key allows. A free key accepts /24;
asking for a /20 on one fails the call rather than covering more.

## How the sweep chooses what to ask about

The ranges come from the platform, not from configuration. An integration must
not read the database, and a source that picked its own targets could be
pointed at somebody else's address space.

`collectPollTargets` in `@virtbase/api/abuse` builds them from live
allocations, not from the blocks we announce:

1. Every subnet with an active allocation, IPv4 only.
2. Rolled up to the configured block size — a fleet stores one /32 per server,
   and sweeping those directly would cost one provider call per customer.
3. Private, loopback, carrier-grade NAT and documentation ranges dropped. They
   cannot host anything reportable, and a call over one is quota spent on a
   guaranteed empty answer.
4. Ordered: never swept first, then longest ago, then most servers.

**Cursors advance only for ranges the source reports as covered.** A run cut
short by the daily quota has not looked at the rest, and advancing their
watermarks would silently skip a window nothing ever looks at again. Those
ranges go first on the next run.

## What a finding looks like

`check-block` gives an address, a report count and a confidence score — not
what the reports were *for*. So a finding is `abuse.other` unless **Look up
categories** is on, which spends one extra call per finding to ask. That is the
difference between a customer being told "port scan" and being told "other",
and it doubles the cost of every finding. Off by default; worth turning on as
soon as the plan allows.

The signal id is `<address>:<most recent report>`. A continuing abuser produces
a fresh signal that joins the open case; a repeat sweep over the same report
produces the same id and is deduplicated.

Severity follows the score — 90+ critical, 60+ warning, below that info — but
the score is how sure the reporters collectively are, not how bad the thing is.
The abuse rules are where a deployment decides what any of it is worth acting
on, and nothing here is trusted to enforce on its own unless a rule says so.

## Reporting back

`allowReporting` lets an operator publish a report from a confirmed case. It is
never automatic, and it is off by default: publishing a report against an
address has consequences for the whole range's reputation, and that is a
person's decision.

> The comment is published. It must never carry the customer's identity.

## Usage type

`check` returns `usageType`, and it is passed through deliberately. A hosting
range scores badly for structural reasons, and treating that score as evidence
about one signup is how an abuse desk starts refusing real customers.
