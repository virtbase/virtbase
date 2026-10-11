---
paths:
  - "packages/auth/**"
  - "packages/config/**"
  - "packages/api/src/privacy/**"
  - "packages/api/src/step-up/**"
  - "packages/api/src/integrations/**"
  - "apps/web/src/app/api/**"
  - "apps/web/src/lib/middleware/**"
---

# Security (SEC)

Every rule here is marked **(defect)**: breaking it is a defect wherever it is
found ([CMP-15](composition.md#repairing-defective-code-next-to-a-change)).

## Secrets

**SEC-1 A secret is stored only in an encrypted store:**

- integration secrets;
- secret settings;
- notification target secrets;
- encrypted node tokens, from Phase 2.8.

Each is protected with envelope encryption under `CONFIG_ENCRYPTION_KEY`. A
secret in a plaintext column is a defect.

**SEC-2 A secret never leaves the server code that uses it.** It never appears
in:

- client props or RSC payloads;
- procedure outputs;
- event payloads;
- workflow inputs or results;
- logs, Sentry events or error messages;
- the audit log;
- URLs.

**SEC-3 Secrets are write-only in the UI.** A form shows whether a secret is set,
never its value. A blank field leaves the stored value unchanged.

**SEC-4 A secret is never echoed into chat, commits, PR descriptions or shared
logs**, and is never invented. When a required secret is missing locally, stop and
ask.

## Personal data

**SEC-5 Every event and stored record with personal data carries its PII level.**

- A subscriber below an event's level receives a redacted payload.
- Customer-facing subscribers receive events of their own `userId` only.

**SEC-6 Personal data is exportable and erasable.** Tables are registered in
`SUBJECT_DATA` and `ERASURE_PLAN`. Integration data is covered by `privacy.export`
and `privacy.erase`.

**SEC-7 Untrusted text is sanitised on the way in and escaped at every sink that
interprets markup.** That covers:

- guest operating system names;
- abuse reporter text;
- webhook payloads.

The comment on the field carries a `[!]` hazard marker
([CMT-13](comments.md#form)).

## Authorisation

**SEC-8 Authorise on the server, for every request.**

- Every page, procedure, action and route checks the user's role, and ownership
  of what it touches.
- A proxy 404 or a hidden button is never the check.

**SEC-9 Sensitive admin actions require step-up:**

- uninstalling or purging an integration;
- exporting financial or customer data;
- revealing a configured URL that carries a credential;
- replaying events in bulk.

**SEC-10 Writes re-read the session.** Admin writes never trust the five-minute
cookie cache (from Phase 2.3).

## Inbound and outbound

**SEC-11 A webhook verifies its signature over the untouched body** before parsing
anything. Unknown, disabled, misconfigured and unknown-path requests all answer
the same 404.

**SEC-12 Outbound requests are bounded.**

- Every outbound request has a timeout.
- URLs a customer supplies (customer webhooks) are HTTPS only.
- Loopback, private and link-local addresses are refused both when the URL is
  saved and when it is sent.

**SEC-13 Integrations are first-party code.** Nothing is loaded at runtime from
outside the repository. The manifest is not a sandbox.

## Review

**SEC-14 Every phase runs `/security-review` on its diff** before its PR is
opened. The PR lists each finding with its resolution.
