# tooling/env-gate

Fails when code reads an environment variable that neither the
[bootstrap allowlist](../../docs/architecture/env-inventory.md#bootstrap-allowlist)
nor the baseline permits (gate 9 of
[integration-first.md §13](../../docs/architecture/integration-first.md#13-quality-gates)).

```bash
bun run env:check           # check every tracked and untracked source file
bun run env:check --prune   # drop baseline entries no file needs any more
```

The check fails on a read nothing permits, on a stale baseline entry, and on a
file it cannot parse.

## What counts as a read

Every `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs` and `.cjs` file is
parsed with Babel (`src/reads.ts`):

| Code | Recorded as |
| --- | --- |
| `process.env.X`, `process.env["X"]`, `` process.env[`X`] ``, `process.env?.X` | `X` |
| the same through `globalThis.process`, `global.process`, `Bun.env`, `import.meta.env` | `X` |
| `const { X, Y } = process.env`, `const { env: { X } } = process` | `X`, `Y` |
| `"X" in process.env` | `X` |
| a key of the `server`, `client` or `shared` schema passed to `createEnv` (t3-env) | that key |
| `process.env[name]`, a computed destructuring key | `<dynamic>` |
| `{ ...process.env }`, a rest pattern, an alias, `process.env` passed on, `const { env } = process`, `env` or the module imported from `node:process`, `env` imported from `bun` | `*` |

A write such as `process.env.X = "…"` in a test counts as a read of `X`. Text
in strings and comments never counts. MDX is not scanned; no MDX file reads the
environment.

## What is permitted

`src/policy.ts` mirrors the allowlist, and `policy.test.ts` fails when it and
`env-inventory.md` differ:

- the bootstrap variables, anywhere;
- the test and CI variables, including every `E2E_` variable, anywhere;
- the variables classified "integration (deferred)", the six social-login
  variables of ADR 0014, anywhere;
- `NOVNC_PROXY_SECRET`, in `apps/novnc-proxy` only.

`baseline.json` lists, per file, the other variables that file read on
2026-10-11. A read is permitted when the allowlist allows it, or when the
baseline lists its variable for its file. Reading a baseline variable from
another file is a new read.

## How the baseline changes

- When a change removes a read, the check fails until the change also removes
  the baseline entry: `bun run env:check --prune` does that, and never adds an
  entry.
- No command adds an entry. An addition is a hand edit to `baseline.json`, which
  review sees, and its PR gives the reason.
- Phase 2 moves the remaining values into settings and integrations, and the
  baseline ends empty.

## Limits

A file whose baseline holds `*` or `<dynamic>` already reads the whole
environment, so the gate cannot tell a new variable in it from an old one. Those
files are listed in `baseline.json`; a change to one of them is reviewed for
new reads by hand.
