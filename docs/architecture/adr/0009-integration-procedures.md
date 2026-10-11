# ADR 0009: Integration procedures are declared as data and built into tRPC by the composition root

- Status: Accepted (2026-10-11)
- Date: 2026-10-11
- Requirements: R3, R7

## Context

R3 asks for typed tRPC procedures under `integrations.<id>`, with
authentication, feature and permission checks applied before integration code
runs, and with end-to-end type inference.

Constraints from the code:

- **The builders live in the composition layer.** `packages/api/src/trpc.ts`
  defines `publicProcedure`, `protectedProcedure`, `stepUpProcedure` and
  `serverProcedure`; there is no `adminProcedure`. `root.ts` composes plain
  router records. Server components prefetch with `HydrateClient`, and client
  components use `useTRPC()` from a `createTRPCContext<AppRouter>()` in
  `apps/web`.
- **An integration may not import `packages/api`,** not even for types
  (`.dependency-cruiser.jsonc`). It cannot see `AppRouter` or the builders.
- **The admin console uses tRPC very little.** Its reads are server functions
  and its writes are next-safe-action actions. The tRPC provider is mounted in
  the shared console layout, though, so admin pages can use it.
- **The composition root's inference is already fragile.** The `core`
  integration's `serverManagement` wraps a caller of `appRouter`, and the editor
  intermittently reports `core` and `integrations` as implicitly `any`
  (TS7022). `tsc` passes, but routers that both feed `appRouter` and depend on
  it would make the cycle real.

## Options

1. **Integrations build tRPC procedures themselves** with a separate
   `initTRPC` in the SDK. That means two tRPC instances, and the app's
   transformer, error formatter and context would not apply to these procedures.
2. **Builders are injected at runtime:** the integration exports
   `(builders) => router`. Typing the builders inside the integration requires
   tRPC's internal builder generics, which are not a stable public API.
3. **Procedures are declared as data with handlers.** The integration writes
   `query` and `mutation` declarations with Zod input and output schemas, an
   access rule and a feature. The composition root turns each one into a real
   procedure, and a mapped type turns the declaration record into tRPC's public
   procedure types (`TRPCQueryProcedure` and `TRPCMutationProcedure`).

## Decision

Option 3.

### What an integration writes

```ts
// packages/integration-lexware/src/procedures.ts
export const procedures = defineProcedures(manifest, {
  exports: {
    list: query({
      access: { role: "admin" },
      feature: "billing.accounting-export",
      input: ListExportsInput,
      output: ListExportsOutput,
      handler: ({ ctx, input }) => listExports(ctx, input),
    }),
    create: mutation({
      access: { role: "admin", stepUp: true },
      feature: "billing.accounting-export",
      input: CreateExportInput,
      output: ExportRun,
      handler: ({ ctx, input }) => createExport(ctx, input),
    }),
  },
});
```

### What the composition root does

`packages/api/src/integrations/procedures.ts` maps each declaration onto the
builder for its access rule:

- `role: "admin"` uses a new `adminProcedure`. It requires the `ADMIN` role,
  re-reads the session without the cookie cache for mutations, and rejects
  impersonated sessions.
- `role: "customer"` uses `protectedProcedure`.
- `stepUp: true` adds the step-up middleware.
- `owns: "service"` adds an ownership check on `input.serviceId` that also
  verifies the service belongs to this installation.

Every procedure then gets three more layers:

- the `meta.feature` gate ([ADR 0007](0007-features-and-effective-state.md));
- an installation check: the declared installation must be `active`, and for
  a multi-instance integration the input names it;
- a wrapper that builds the integration context and translates an
  `IntegrationError` with the integration's `localize()`, using the request
  locale.

`root.ts` gains `integrations: router({ lexware: integrationRouter(lexware), … })`,
imported statically so that `AppRouter` carries the types.

### What the integration's UI uses

`@virtbase/integration-sdk/ui` exports a hook,
`useIntegrationTRPC<typeof procedures>(id)`. It is typed from the integration's
own declarations, and backed at runtime by the app's tRPC client, which the
catch-all page provides through context. Server components receive a scoped
server proxy as a prop. The UI therefore never imports `AppRouter`, and its
types match what `AppRouter` contains, because both are derived from the same
declarations.

### What the context contains

A handler receives:

- the actor (`userId`, `role`);
- the installation;
- parsed settings and secrets;
- `logger`, `http`, `ports` and `events`;
- `db`, a Drizzle handle the integration uses for its own tables
  ([ADR 0010](0010-integration-data.md)).

Secrets never leave the handler: every declaration has an output schema, and
tRPC validates outputs.

## Consequences

- **The cycle risk is checked first.** Before Phase 5 commits to this shape, a
  one-day spike builds one integration router and adds it to `appRouter`. The
  `serverManagement` wrapper stops being typed off `appRouter` if that is what
  it takes. Passing `tsc` with the router in place is the gate.
- **Admin pages use tRPC for integration data and writes,** while the rest of
  the admin console keeps next-safe-action. This is a second mechanism in the
  console; it is accepted because the alternative is a second procedure
  abstraction for integrations.
- **Integration procedures stay off the public REST API.** The `api.` host's
  OpenAPI paths are not extended in this programme, and the docs say so.
- **The conformance suite checks every declaration.** Each must have an access
  rule, an output schema, and a feature that exists in the merged catalogue. A
  procedure whose output schema contains a secret field fails the secret-leak
  test ([integration-first.md §10](../integration-first.md#10-security)).
