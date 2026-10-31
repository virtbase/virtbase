---
paths:
  - "**/__tests__/**"
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "apps/web/e2e/**"
---

# Testing (TST)

## Running tests

**TST-1 Run `bun run test`, never bare `bun test`.** Each package's script sets
its own `.env.test`, `bunfig.toml` and isolation flags. Run one package with
`bun -F <package> test`, for example `bun -F @virtbase/api test`.

**TST-2 A package whose tests call `mock.module` runs with `--isolate`** (or with
`--parallel=N`, which implies it). Module mocks are process-wide in Bun.

## What to write

**TST-3 A defect fix starts with a failing test** that pins the defect
([CMP-16](composition.md#repairing-defective-code-next-to-a-change)). A behaviour
change starts with a test that describes the new behaviour.

**TST-4 One test, one behaviour.**

- The title is a lowercase sentence that states the behaviour, and the reason
  when the reason is not obvious, as the existing tests do: `"leaves the tax rate
  unset, because the country is unknown at checkout"`.
- Group titles with `describe` by unit.

**TST-5 Test the shape the code has:**

| Unit | How to test it |
| --- | --- |
| decision | plain data in, assertion out; no database |
| operation | a real PGlite transaction from `createTestDb()` |
| orchestrator | its effects through `createTestCaller` or the route, against PGlite and fakes |
| adapter | its port's contract suite plus its own error paths |

**TST-6 Prefer fakes to module mocks.**

- Inject a fake port or executor rather than calling `mock.module`.
- Stub HTTP at `ctx.http`, or at `fetch` for core code.
- `mock.module` is allowed only where nothing can be injected. The package then
  runs with `--isolate` (TST-2).

**TST-7 Fixtures use the real ID prefixes.**

- Fixtures come from `packages/api/src/testing/fixtures.ts` and the seeders.
- Every ID uses a prefix from `create-id.ts`; the fixture test enforces it.
- No test depends on another test's rows.

**TST-8 Retried units are run twice in their test,** and the test asserts there
was no second effect ([CMP-6](composition.md#rules)). That covers workflow steps,
webhook handlers, cron bodies and event subscribers.

**TST-9 Claims are tested by their outcome.** PGlite serialises transactions, so a
test cannot reproduce a lock race. Assert the claim semantics instead: the second
claim gets nothing.

**TST-10 Use golden tests to preserve behaviour.** When code moves without
changing what it does, such as notifications onto events, a golden test records
the observable output before the move, and the same test passes after it.

## Integration and port suites

**TST-11 Every integration calls the conformance suite**, `describeIntegration`,
and the contract suite of each port it provides, from
`@virtbase/integration-testing` (Phase 1).

## End-to-end

**TST-12 Assert real 404s on the response status,** never on rendered text. Under
Cache Components, `notFound()` answers HTTP 200.

**TST-13 Specs that change shared state run serially.** That covers enabling
integrations and toggling features. They run in their own Playwright project, as
`patches.e2e.ts` does. Every other spec stays parallel and creates its own data.

**TST-14 E2E files are named `<feature>.e2e.ts`,** and live under
`apps/web/e2e/<surface>/`. Sessions come from the auth setup project.

## Coverage

**TST-15 Coverage counts a package's own files.**

- The thresholds are in each package's `package.json`
  ([ADR 0020](../architecture/adr/0020-coverage-gate.md)).
- A PR never lowers a threshold. If a package is below its threshold, the PR
  states a plan to raise it.
