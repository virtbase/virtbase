# tooling/coverage-gate

Fails CI when a package's line or function coverage falls below its threshold
([ADR 0020](../../docs/architecture/adr/0020-coverage-gate.md)).

```bash
bun run test:coverage   # writes coverage/lcov.info in every package
bun run coverage:check  # prints the table, exits 1 on a failing package
```

## What it counts

For every workspace package, `check.ts`:

1. reads `coverage/lcov.info` and sums `LF`/`LH` and `FNF`/`FNH`;
2. lists the `.ts` and `.tsx` files under `src`, without declaration files,
   tests, and the package's own `coveragePathIgnorePatterns`;
3. adds every listed file the report does not mention as uncovered, with counts
   estimated from the file's source (`src/estimate.ts`);
4. compares the totals with `virtbase.coverage` in the package's
   `package.json`.

Bun only reports the files a test imports, so step 3 is what makes an untested
file visible. A file that a test loads is counted by Bun exactly.

## Thresholds

```json
"virtbase": { "coverage": { "lines": 0.59, "functions": 0.77 } }
```

Each value is a share between 0 and 1. Any package fails when its
`package.json`, `bunfig.toml` or report cannot be read; the gate still checks
every other package. Otherwise a package without `virtbase.coverage` appears in
the table and never fails, and a package with thresholds fails when:

- it wrote no report;
- its report includes files from another package, because its `bunfig.toml`
  lacks the `../**` ignore;
- its line or function share is below its threshold.

Every package with tests started at its share of 2026-10-11, rounded down to a
whole percent. Raise a threshold in the PR that earns it; never lower one.

`packages/db` measures higher when `.cache/test-db` is absent, because
`createTestDb()` then builds the schema snapshot, which runs code a warm cache
skips (95 % of lines instead of 87 % on 2026-10-11). CI always starts without
the cache. Set `db`'s thresholds from a run with the cache present, so they hold
in both cases.
