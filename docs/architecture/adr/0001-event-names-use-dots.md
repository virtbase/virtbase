# ADR 0001: Event names use dots

- Status: Accepted (2026-10-11, decision D1)
- Date: 2026-10-11
- Requirement: R2

## Context

The event catalogue needs one naming convention. The brief writes
`server:created` and asks to confirm the separator.

Every name of this kind already in the code uses dots:

- `DomainEvent.type` is documented as dotted (`server.provisioned`,
  `order.paid`) in `packages/ports/src/event-subscriber.ts`.
- Notification keys are dotted (`abuse.case.opened`), and operators route them
  with dotted globs: `notification_targets` matches `*`, a dotted key, or a
  dotted prefix ending in `.*` (`packages/api/src/notifications/match.ts`,
  `packages/validators/src/notifications.ts`).
- Signal types are dotted (`abuse.spam`, `node.disk_pressure`) in
  `packages/ports/src/signal.ts`, and the `abuse.` prefix is what routes a
  signal into the case pipeline.
- Settings keys are dotted namespaces (`billing.credit.enabled`) in
  `packages/db/src/schema/settings.ts`.
- The features R1 proposes are dotted (`billing.invoices`).

## Options

1. **Dots:** `server.created`.
2. **Colons:** `server:created`.
3. **Colons for events only,** dots everywhere else.

## Decision

Dots. Event names have this form:

```
<aggregate>[.<part>].<fact>        e.g. order.paid, server.backup.restored
<integration-id>.<aggregate>.<fact> e.g. pelican.allocation.exhausted
```

- Segments are lowercase and match `[a-z][a-z0-9_]*`.
- The last segment states a fact: usually past tense (`created`), or the
  present participle for an announcement of something about to happen
  (`subscription.expiring`).
- An event an integration declares itself must start with that integration's
  id. Core owns every other prefix.
- Subscriptions use the matcher notifications already use: an exact name, a
  prefix ending in `.*`, or `*`.

## Consequences

- Notification keys and event types share one namespace. When notifications
  become an event subscriber ([ADR 0006](0006-outbox-delivery.md)), existing
  `notification_targets` globs keep matching without a translation table.
- The glob matcher moves from `packages/api/src/notifications/match.ts` into
  `@virtbase/events/catalog`, so hooks, customer webhooks and notification
  targets all match the same way.
- The catalogue checks the grammar with a regular expression in its own test.
  The conformance suite checks that integration-declared events carry the
  integration's prefix.
- Option 2 would leave two conventions in the codebase, and every glob would
  need to know which one it is matching. Option 3 would make it impossible to
  match a notification key and an event type with the same pattern.
