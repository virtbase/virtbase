# ADR 0010: Owned tables join the one migration history; declared requirements live in a core table

- Status: Accepted (2026-10-11)
- Date: 2026-10-11
- Requirements: R4, R7, R10

## Context

R4 asks for two mechanisms:

- **Owned tables** for relational or high-volume integration data.
- **Declared data requirements:** small, typed fields an integration needs on
  core entities.

Both have to survive disabling, be purged on uninstall, and be covered by the
user data export and by erasure. Facts that shape the design:

- **drizzle-kit can see other packages.** Its `schema` option accepts an array
  of globs, so `../integration-*/src/schema.ts` can be added and migrations stay
  in `packages/db/drizzle`.
- **The test snapshot cannot.** `createTestDb()` builds its PGlite snapshot with
  `pushSchema()` from `packages/db/src/schema` alone. It keys the cache on those
  files plus `bun.lock`, and it never runs the migrations.
- **Re-exporting integration tables from `@virtbase/db` would invert the
  layers,** and no current dependency rule would catch it.
- **Casing is set in one place only.** Every one of the 54 tables uses
  `d.snakeCase.table`, and only `drizzle.config.ts` sets the casing. A table
  written another way gets different column names in tests and in migrations.
- **The ID prefix list is closed.** `create-id.ts` holds 52 prefixes, and
  validators check IDs per entity with a regular expression.
- **Integrations already read core tables:**
  - Discord reads `accounts`, `users` and `servers`, and its account lookup does
    not filter by provider.
  - Prometheus reads nine tables.
  - Stripe reads `users.stripe_customer_id`.
- **The privacy registry is complete for core.** `SUBJECT_DATA` lists every
  table holding user data, a test fails when a table with `user_id` is missing
  from it, and `ERASURE_PLAN` checks the erasure steps. Integrations have no way
  to add to either.

## Decision

### Owned tables

**Where they live.** An integration's tables are in
`packages/integration-<id>/src/schema.ts`, exported as `./schema`.

**Naming.** Every table and enum name starts with `int_<id>_`, where hyphens in
the id become underscores, and every table uses `d.snakeCase.table`. A test in
`@virtbase/integration-testing` reads each schema module and enforces both.

**Every owned table has an `installation_id`:**

- a foreign key to `integration_installations` with `onDelete: "cascade"`;
- it is how uninstalling removes the data, and it is the same column whether or
  not the integration is multi-instance
  ([ADR 0002](0002-several-installations-per-integration.md)).

**Foreign keys to core rows go through `@virtbase/db/refs`.** It exports the
primary-key columns that may be referenced: user, product, service, order, order
item and installation. Each comes with documented `onDelete` guidance:

- a foreign key to a user or a service uses `restrict`, so a missing erasure or
  termination step fails loudly instead of losing rows silently;
- a foreign key to an order item uses `set null`, because orders are anonymised,
  not deleted.

**Two new boundary rules:**

- `integration-no-core-tables`: integration code may not import
  `@virtbase/db/schema`.
- `integration-refs-only-in-schema`: `@virtbase/db/refs` may be imported only
  from `src/schema.ts`.

Runtime code reaches its own tables through `ctx.db`, or `ctx.tx` inside a
synchronous hook. It reaches core data only through ports.

**Migrations.**

- `drizzle.config.ts` lists the integration schema glob.
- A migration that touches `int_*` tables is generated in the same PR as the
  schema change.
- It is reviewed like any other migration, with the generated SQL in the diff,
  and covered by the migration gate
  ([integration-first.md §13](../integration-first.md#13-quality-gates)).
- Tables are dropped only by the PR that removes the integration package.

**Tests.**

- `createTestDb({ schema })` accepts extra modules.
- Its snapshot key also hashes `packages/integration-*/src/schema.ts`, read as
  plain files from the repository root, so the database package imports no
  integration.
- Integration tests use `@virtbase/db/test-client` and
  `@virtbase/integration-testing`, never `@virtbase/api/testing`, which would
  create a turbo dependency cycle.

**IDs.**

- The manifest declares the integration's prefixes in `data.idPrefixes`.
- `ctx.ids.create(prefix)` produces the same 25-character ULID body as core.
- The conformance suite checks that no prefix collides with core or with
  another integration.
- The SDK exports `idSchema(prefix)` for validators.

### Existing direct reads

The new rules land in Phase 1 with an exception list that may only shrink. Each
entry is removed by the phase that provides its replacement:

| Integration | Reads | Replacement | Phase |
| --- | --- | --- | --- |
| Stripe | `users.stripe_customer_id` | owned table `int_stripe_customers`, copied over by a migration | 2 |
| Discord | `accounts`, `users` | `identity` port: `findLinkedAccount(providerId, accountId)` and `listLinkedAccounts(userId)`, served by core. This also fixes the missing provider filter. | 1 |
| Discord | `servers` | the existing `serverManagement` port | 1 |
| Prometheus | 9 tables | a read-only `platformMetrics` port served by core, returning the gauges Prometheus exposes today | 1 |

### Declared data requirements

The manifest declares them:

```ts
data: {
  requirements: [
    {
      key: "vatId",
      entity: "user",
      schema: z.string().regex(VAT_ID),
      fields: [{ key: "vatId", widget: "text" }],
      collect: ["account", "checkout"],
      required: false,
      pii: "personal",
    },
  ],
},
```

- Requirements that depend on what is being bought, such as the fields a TLD
  needs, come from the provisioning port at checkout
  ([ADR 0012](0012-products-and-services.md)) and are stored the same way.
- Values live in a core table, `integration_data`:

  | Column | Notes |
  | --- | --- |
  | `id` | `idat_` |
  | `integration_id`, `installation_id` | |
  | `key` | |
  | `user_id`, `order_item_id`, `service_id`, `product_id` | nullable foreign keys, each with its own `onDelete`; a check constraint requires exactly one |
  | `value` | jsonb |
  | `pii` | |
  | timestamps | |

  Separate foreign keys, rather than an `(entity_type, entity_id)` pair, keep
  integrity and make erasure a plain `user_id` predicate.
- Forms in checkout, account settings and the admin user and service pages are
  generated from the field descriptors, like integration settings forms. The
  widget set grows by `email`, `tel`, `country` and `date`, and `url` gets a
  real input. Integrations read and write values through `ctx.data`, scoped to
  their own keys, never through the table.
- Because the table is core, it is registered once in `SUBJECT_DATA` and
  `ERASURE_PLAN`. Export and erasure cover every integration's requirements with
  no code in the integration.

### Lifecycle

| Action | What happens to the data |
| --- | --- |
| Disable | nothing; the data stays and its pages answer 404 |
| Uninstall | an explicit admin action ([§ below](#uninstalling)) |
| User offboarding | every installation's `privacy.erase` runs, including disabled ones |

#### Uninstalling

Uninstalling requires step-up and is recorded in the audit log.

1. **It is refused while services provided by the installation are not
   terminated.** The refusal lists them, and services are never deleted as a
   side effect of uninstalling.
2. **The admin types the installation's label to confirm.**
3. **`onUninstall(ctx)` runs** with a context built from the stored
   configuration, and cleans up on the provider's side.
4. **The installation row is deleted.** That cascades to its secrets, its owned
   rows and its `integration_data` rows. On terminated services,
   `provider_installation_id` is set to null, and the provider's integration id
   stays as text for history.

### Privacy is part of the contract

- The manifest declares each owned table's subject column and PII level.
- If any table holds personal data, the runtime must provide `privacy.export`
  and `privacy.erase`, and the conformance suite fails without them.
- `export-user-data` gains one step per installation.
- `offboard-user` runs each `erase` before core deletes or anonymises the user
  rows those tables reference. `ERASURE_PLAN` lists the integration steps, so
  the existing test covers them.

## Consequences

- **Owned tables are as visible in review as core tables:** same migration
  history, same casing, same migration tests.
- **An integration's personal data cannot be forgotten.** A missing privacy
  hook fails the conformance suite, and a forgotten `restrict` foreign key
  fails offboarding loudly instead of silently.
- **Three integrations lose their core table imports,** through ports the
  platform lacks today. Phase 1 adds the ports; Phase 2 moves
  Stripe's customer ids.
