---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---

# Comments and documentation (CMT)

A comment is read by someone about to change the code beneath it. It must leave
them with exactly one reading, and that reading must be true. These rules apply
to every comment added or changed from now on, and to Markdown documentation.
Existing comments are only touched when they describe code you change (CMT-9).

## What to write

**CMT-1 Write only what the code cannot say.** A comment explains one of:

- why the code is written this way;
- the constraint or invariant it upholds;
- what breaks if it changes;
- where the requirement comes from.

It never restates what the next line does.

**CMT-2 Every statement is specific and checkable.**

- Name the subject: the function, column, constant, file, issue, or provider
  document. Never say "this", "it" or "that" across sentences.
- Give conditions exactly: values, units, limits.

**CMT-3 A claim about behaviour is enforced.** "Never throws", "runs in one
transaction", "idempotent", "retried by `reconcile-orders`" — such a claim is
true of the code beneath it, and covered by a test. If either is missing, do not
write the claim.

**CMT-4 Say "must" for requirements, use the indicative for facts, and say "may"
for permission.**

| Use | Meaning |
| --- | --- |
| "must", "must not" | requirements |
| "returns", "is", "runs" | facts |
| "may" | permission only, never possibility |

"Should" is not used, because it leaves open whether the rule is a requirement.

**CMT-5 Write counts and lists so they cannot drift.**

- Refer to the source ("every entry of `OPERATING_SYSTEMS`"), not a number
  ("the 14 emojis").
- If a number must be stated, a test next to it asserts it.

**CMT-6 Write time as an absolute reference:** a date (2026-10-11), a version, a
commit, or a PR number.

- Never "recently", "new", "old", "currently", "for now", "soon" or
  "eventually".
- "Legacy" is only allowed together with what replaced it, and since when.

**CMT-7 Cite durable sources only:** issues, ADRs, `risks.md` IDs, and provider
documentation URLs. Never name people or private conversations, and never write
"as discussed".

## What never to write

**CMT-8 No hedging.** The comment gate ([§ Enforcement](#enforcement)) rejects
these words and phrases in comments on added lines, and review rejects them in
Markdown:

> should, might, maybe, perhaps, probably, hopefully, seems, I think,
> not sure, for now, temporary, temporarily, currently, at the moment,
> for the time being, quick fix, hack, somehow, magic, TBD

**CMT-9 No stale comment survives a change. (defect)**

- When you change code, update or delete every comment that describes it, in
  the same diff. Search for the identifiers you changed.
- A comment that contradicts its code is a defect, and
  [CMP-15](composition.md#repairing-defective-code-next-to-a-change) applies to
  it.

**CMT-10 No TODO without an issue.**

- `TODO(#123): <imperative action> when <condition>` is allowed when issue #123
  is open.
- `FIXME`, `HACK` and `XXX` are never allowed.

**CMT-11 No commented-out code.** Delete it; the history keeps it.

## Form

**CMT-12 Document every export.** Exports of `packages/*` and of
`apps/web/src/features/*/api` carry TSDoc:

- the first sentence says what the export is or does;
- further paragraphs give the why, the constraints, and what callers must do;
- related symbols are linked with `{@link Name}`;
- thrown errors and result variants are named where a caller has to handle them.

The ports in `packages/ports/src` are the model.

**CMT-13 Use `[!]` for hazards only.**

- `[!]` starts a comment that warns of a non-obvious constraint whose violation
  causes a bug or a vulnerability: untrusted input, load-bearing order, a
  security boundary.
- The same sentence names the hazard and its consequence.
- Today's uses are the model: `packages/ports/src/signal.ts`, the guest-supplied
  strings in `integration-discord`, `packages/db/src/client.ts`.

**CMT-14 Language.**

- English, with British spelling, as the existing comments use ("normalised",
  "behaviour").
- Present tense, active voice, complete sentences, no emoji.

**CMT-15 No comments in configuration and CI files.**

- This covers JSON, JSONC, YAML, TOML, workflow files and Dockerfiles. Explain
  the change in the PR description instead.
- The existing comments in `biome.jsonc` and `.dependency-cruiser.jsonc` stay,
  and are kept accurate under CMT-9.

**CMT-16 Every new source file carries the licence header.** Every `.ts`,
`.tsx`, `.js` and `.mjs` file starts with the 16-line GPL header that every
existing file carries, with the year of creation.

**CMT-17 Markdown documentation follows CMT-1 to CMT-11.**

- An accepted ADR is never edited. A later ADR supersedes it.
- A package `README.md` points into the package's `docs/` folder once the
  package has one.

## Ambiguous and precise, side by side

The examples are illustrative. Issue numbers and test names in them are
placeholders.

| Ambiguous | Precise |
| --- | --- |
| `// should never throw` | `// Never throws: every failure is recorded on the delivery row and reported to Sentry (see deliver.test.ts "records a channel failure").` |
| `// for now we skip Anonpay here` | `// Anonpay has no off-session charge (PaymentProvider.chargeOffSession is absent), so renewals skip it.` |
| `// handles the edge case` | `// A refund that arrives before the payment event is stored as pending; reconcileOrders settles it.` |
| `// the 14 distro emojis` | `// one emoji per entry of OPERATING_SYSTEMS` |
| `// runs in a transaction` (it does not) | delete the comment, or wrap the writes and keep the comment (CMP-3) |
| `// TODO: fix later` | `// TODO(#412): batch the lookups when nodes exceed 50.` with issue #412 open, or no comment |
| `// temporary workaround` | the workaround's reason and its removal condition, linked to an issue |
| `// new pricing logic` | `// Prices come from server_plan_prices since 2026-08-10 (#398).` |

## Enforcement

- **The comment gate.** It runs in CI from Phase 1, PR 1.2. It inspects only the
  comment lines a PR adds or changes in `.ts`, `.tsx`, `.js` and `.mjs` files, so
  it applies to future code without rewriting history. It fails on:
  - the CMT-8 list;
  - `TODO` without an issue reference;
  - `FIXME`, `HACK` and `XXX`;
  - lines that are commented-out code.
- **Review.** CMT-1 to CMT-7, CMT-9 and CMT-12 are checked in review, because a
  pattern cannot judge them.
