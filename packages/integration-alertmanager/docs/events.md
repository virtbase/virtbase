# Events

The integration emits no events and runs no hooks. Every accepted alert becomes
an `InboundSignal` submitted to the `signals` port. What follows is decided by
`submitSignal` in `packages/api/src/abuse/intake.ts`, in this order:

1. **A resolved alert** is recorded as a resolved signal. It opens no case and
   sends no notification.
2. **A type without the `abuse.` prefix**, such as the `alert.<alertname>`
   fallback, never opens a case. The signal is recorded and sent to the
   operator notification targets under its type as the notification key.
3. **An `abuse.` signal that names no customer** (a node, an address nobody
   held at the time, no subject) opens no case. It is sent to the operator
   notification targets as `abuse.signal.unattributed`.
4. **An `abuse.` signal attributed to a customer** opens a case, or joins the
   customer's live case of the same category, whether or not an abuse rule
   matches it. A repeat of a signal already filed against a case only counts
   the occurrence: it opens nothing and sends no notification.

`trusted_source` on the matching abuse rule gates enforcement, not the case
(`decideNewCase` in `packages/api/src/abuse/case.ts`). A new case whose rule
does not set `trusted_source`, or that no rule matches, is opened in `triage`,
with no enforcement, no order block and no notice to the customer, and waits
for an operator. A case opened by a trusted rule is `open` and carries the
rule's enforcement, unless the attribution is stale.

Repeats are cheap: Alertmanager sends a still-firing alert again every
`repeat_interval`, and ingest upserts on `(source, externalId)`, so a repeat
increments the signal's `occurrences` instead of opening a second case.
