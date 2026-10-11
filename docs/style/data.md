---
paths:
  - "packages/db/**"
  - "packages/*/src/schema.ts"
  - "packages/api/src/backfill/**"
  - "apps/web/scripts/backfill-*.ts"
---

# Data: schema, migrations, queries, transactions (DB)

## Schema

**DB-1 Write a table the way every existing table is written.**

- One file per entity in `packages/db/src/schema/`, with
  `import * as d from "drizzle-orm/pg-core"` and `d.snakeCase.table(…)`.
- An integration's tables live in its own `src/schema.ts`
  ([integrations.md](integrations.md)).

**DB-2 Primary keys are prefixed IDs.**
`d.text().primaryKey().$default(() => createId({ prefix: "xyz_" }))`. The prefix
is added to `packages/db/src/utils/create-id.ts`, and the fixture-prefix test
covers it.

**DB-3 Every table has `createdAt` and `updatedAt`.** Both are
`timestamp({ withTimezone: true, mode: "date" })`. `updatedAt` gets
`$onUpdate(() => sql\`now()\`)`, as `integration_installations` does.

**DB-4 Every foreign key states `onDelete`. (defect)**

- A TSDoc comment on the column says why that choice was made.
- `cascade` only for rows that mean nothing without their parent.
- `restrict` where losing the child would lose history or money.
- `set null` where the child outlives its parent as a record.

**DB-5 Name enums as plural snake case** (`order_statuses`). A new value is added
in an expand migration ([§ Migrations](#migrations)). It is used only from the
following release on.

**DB-6 Invariants live in the database.**

- Uniqueness is a unique index; a claim is a partial unique index.
- A range or relation between columns is a `CHECK`.
- Code then relies on the constraint, and handles its conflict.

**DB-7 Money is an integer column of minor units plus a `currency` column.** Time
is `timestamptz`. Neither is ever stored as text or a float.

**DB-8 Tables with personal data are registered. (defect)** Any table with a
`user_id` (or other personal data) is entered in `SUBJECT_DATA` and, if it is
erased, in `ERASURE_PLAN`. The tests in `packages/api/src/privacy/__tests__`
fail otherwise.

**DB-9 History is not deleted.**

- Rows that carry money, legal or attribution history are moved to a terminal
  status or anonymised: orders, payments, services, servers once Phase 6 lands,
  allocations.
- Deleting such rows needs an ADR.

**DB-10 Document every table.** A TSDoc comment says what the table holds and its
lifecycle. Every column whose meaning is not obvious from its name has its own
comment ([comments.md](comments.md)).

## Migrations

**DB-11 Generate, never hand-write, the schema part.**

- Run `drizzle-kit generate`, and commit the generated folder with the schema
  change.
- Statements that move data are added to the generated SQL only when they are
  idempotent, and are reviewed as code.
- A migration that has been merged is never edited.

**DB-12 Every migration is expand or contract. (defect)**

- Migrations run in the Vercel build while the previous deployment serves.
- An expand migration is additive, and compatible with the running release.
- A contract migration removes something only after no deployed release reads
  it, and at least one release after the read switch
  ([migration-plan.md §1](../architecture/migration-plan.md#1-rules-every-migration-follows)).

**DB-13 Data moves in TypeScript backfills,** in `packages/api/src/backfill/`,
run through `apps/web/scripts/backfill-*.ts`. A backfill:

- is idempotent through a mapping column;
- works in batches;
- is safe to run again;
- runs from a reconciler cron until its contract release.

**DB-14 Every migration and backfill is tested** by the migration gate:

- generation produces no diff;
- the migrations apply in order to PGlite seeded with representative data;
- a backfill run twice changes nothing.

## Queries

**DB-15 Select the columns you use** (`select({ id: t.id, status: t.status })`),
as the codebase does. Never select whole wide rows to read two fields.

**DB-16 Use the existing helpers:**

- `escapedIlike` for search input, so user text cannot inject wildcards;
- `buildOrderBy` for sorting;
- `getDateIntervalFilter` for date ranges, from `@virtbase/db/utils`.

**DB-17 No query inside a loop over rows.** Batch with `inArray`, or with a join.
Today's integration hub (one query per integration, three times per page) is the
example not to follow.

**DB-18 Read a single row with `.limit(1).then(([first]) => first)`,** as the
config store does, and handle `undefined` explicitly.

## Transactions

**DB-19 Open transactions in orchestrators only, with explicit options:**

- `{ isolationLevel: "read committed" }`;
- plus `accessMode: "read only"` for reads.

Operations take `tx` ([CMP-2, CMP-3](composition.md#rules)).

**DB-20 Read-modify-write locks the row** (`.for("update")`), as
`transitionOrder` does.

- A queue claims with `FOR UPDATE SKIP LOCKED`.
- A one-time claim is an insert against a unique index, with
  `onConflictDoNothing`.

**DB-21 Keep transactions short. (defect)** No network call, no sleep, no unbounded
loop inside one ([CMP-4](composition.md#rules)).

**DB-22 Emit events in the transaction that changes the state.**
`events.emit(tx, …)` is typed to require a `Transaction`
([ADR 0005](../architecture/adr/0005-hook-phases.md)).

**DB-23 PGlite serialises transactions,** so a test cannot reproduce a lock race.
Test what the claim does instead: two claims, one winner.
