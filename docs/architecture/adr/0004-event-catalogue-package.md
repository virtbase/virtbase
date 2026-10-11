# ADR 0004: `@virtbase/events` exposes a pure catalogue that integrations may import

- Status: Accepted (2026-10-11)
- Date: 2026-10-11
- Requirements: R2, R6, R10

## Context

The `EventSubscriber` port says the event catalogue "is owned by
`@virtbase/events` (Layer 3)" (`packages/ports/src/event-subscriber.ts`). That
package does not exist, and nothing emits or subscribes.

Integrations need the catalogue for three reasons:

- to write typed hooks;
- so the conformance suite can check that a hook subscribes to an event that
  exists;
- so an integration can declare events of its own, such as
  `pelican.allocation.exhausted`.

The dependency rule `integration-no-domain` (`.dependency-cruiser.jsonc`)
forbids any import from `packages/integration-*` into
`packages/(proxmox|provisioning|billing|abuse|events)`.

Writing an event to the outbox needs `@virtbase/db`. That is what puts the
runtime in Layer 3, and it is code an integration must never call directly: an
integration has no business writing another domain's events into a transaction
it does not own.

## Options

1. **Put the catalogue in `@virtbase/ports`** (Layer 2). Then integrations may
   import it, but Zod schemas for a hundred payloads would sit in a package
   that is meant to hold interfaces, and the "events live in Layer 3" plan
   would be gone.
2. **Give `@virtbase/events` two entry points.**
   - `@virtbase/events/catalog` is pure: names, Zod schemas, descriptions,
     scope and PII classification, plus the glob matcher. Integrations may
     import it.
   - `@virtbase/events` is the runtime: `emit()`, the outbox writer and the
     transaction helpers. It stays forbidden to Layer 4.
3. **Leave hooks untyped:** every hook receives `DomainEvent<unknown>` and
   parses the payload itself.

## Decision

Option 2.

- `packages/events/src/catalog/**` may import only `@virtbase/validators`,
  `@virtbase/utils` and `zod`. A new rule, `events-catalog-is-pure`, enforces
  this.
- `integration-no-domain` gains `pathNot: "^packages/events/src/catalog/"`.
  The runtime remains forbidden, so an integration cannot write to the outbox
  except through the context it is handed.
- An integration emits its own events with `ctx.events.emit(type, payload)`.
  The registry binds this to the runtime and to the current transaction when
  there is one ([ADR 0005](0005-hook-phases.md)). The integration declares
  those events in its manifest under its own id prefix, and the composition
  root merges them into the runtime catalogue.
- **Kind-level events belong to core.** Events that describe a product kind
  rather than a provider (`domain.registered`, `mailbox.created`) are in the
  core catalogue, so that two registrars emit the same `domain.registered`.
  Provider-specific detail goes under the integration's prefix.

### A catalogue entry

```ts
export const serverBackupRestored = defineEvent({
  type: "server.backup.restored",
  version: 1,
  description: "A backup was restored onto its server.",
  scope: "user", // payload.userId is set; customer-facing subscribers may see it
  pii: "none", // none | personal | sensitive; fields can tighten it with .meta({ pii })
  customerVisible: true, // may reach the owner's customer webhooks
  payload: z.object({
    userId: userId,
    serverId: serverId,
    backupId: backupId,
  }),
  // phases other than `after` the core code offers for this event
  sync: [],
});
```

- An event whose code path offers synchronous hooks declares `input`, the
  schema `before` and `beforePersist` receive.
- It also declares `enrichable`, the input fields a hook may set.
- See [ADR 0005](0005-hook-phases.md) for both.

## Consequences

- `.dependency-cruiser.jsonc` changes in Phase 4 as described above. It also
  gains a rule that keeps `@virtbase/events` in Layer 3: it may import layers 0
  to 2 and `db`, and nothing above.
- **Payload changes within a version must be additive.** A breaking change
  publishes `version: 2` next to version 1 for one release, and customer
  webhooks receive the version they subscribed to.
- **The catalogue has its own tests:**
  - every name matches the grammar in [ADR 0001](0001-event-names-use-dots.md);
  - every payload schema rejects keys that look like credentials (`password`,
    `token`, `secret`, `otp`), unless the field is tagged otherwise;
  - every `customerVisible` event is `scope: "user"`.
- **Option 1 would make Layer 2 the home of domain semantics.** Option 3 would
  make every subscriber re-validate payloads by hand, and a typo in an event
  name would fail silently.
