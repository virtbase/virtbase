# tooling/boundaries

The install `bun check:boundaries` runs dependency-cruiser from.

dependency-cruiser parses TypeScript with the `typescript` package's JavaScript
API, which TypeScript 7 does not ship. Without a 6.x it silently skips every
`.ts` file and reports a clean graph. So this directory pins
`typescript@6.0.3` next to it.

It is deliberately **not** a workspace member, for two reasons:

- dependency-cruiser loads `typescript` with a plain `require` from its own
  location. Under the workspace's isolated linker that resolves through
  `node_modules/.bun/node_modules/typescript`, which is the repository's 7.x,
  wherever a 6.x is declared. A standalone install with
  `linker = "hoisted"` (see `bunfig.toml`) puts both side by side.
- It has its own `bun.lock`, so the 6.x never reaches the root lockfile.

`bun check:boundaries` installs it on demand (`--frozen-lockfile`, a no-op when
it is current). Remove the whole directory once dependency-cruiser supports
TypeScript 7.
