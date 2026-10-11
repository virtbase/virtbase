# Risks, pre-existing defects and rollback

Part of the [integration-first design](integration-first.md). Three sections:

- [the risk register](#risk-register) for the programme itself;
- [the defects discovery found](#pre-existing-defects) in today's code, each
  with the phase that fixes it;
- [the rollback plan](#rollback-plan) for each phase.

## Risk register

Likelihood and impact are rated L(ow), M(edium) or H(igh).

| ID | Risk | L | I | Mitigation | Phase |
| --- | --- | --- | --- | --- | --- |
| R1 | Composing integration routers into `appRouter` turns the existing `core` ↔ `appRouter` inference cycle into a real TS7022 error | M | H | the Phase 5.0 spike, with passing `tsc` as its gate; type `serverManagement` against its port rather than `appRouter` if needed ([ADR 0009](adr/0009-integration-procedures.md)) | 5 |
| R2 | A migration that is not backwards-compatible breaks the deployment still serving during the Vercel build | M | H | expand/contract only; the migration gate with representative data; contracts at least one release after the switch ([migration-plan.md](migration-plan.md)) | all |
| R3 | Moving or renaming a workflow file changes its step IDs, and runs in flight cannot resume | M | H | no existing workflow file is moved or renamed in this programme; new generic workflows are new files; the Proxmox facade starts existing workflows | 6 |
| R4 | A disabled page stays reachable on another instance or in the proxy's process | H | L | at most 15 s, written down ([§5.5](integration-first.md#55-caching-and-staleness)); the server-side re-check; procedures answer `NOT_FOUND` within the same window | 3 |
| R5 | The outbox backlog grows faster than the drain empties it | M | M | time-budgeted drains every minute; retention purges; indexes on `(status, next_attempt_at)`; an alert when the oldest due delivery is more than 10 minutes old; a pause setting for incidents | 4 |
| R6 | Hooks inside transactions add lock time to a pool of 10 connections that some code already holds across Proxmox calls | M | H | hooks forbidden from the network, a 250 ms default budget, `statement_timeout`, savepoints; no hook opens a savepoint when none is registered; `vzdump` moved out of its transaction first; the performance gate | 4 |
| R7 | Moving notifications onto events changes when or whether something is sent | M | M | golden tests per domain against a recording made before the change; one domain per PR; bug fixes in separate PRs that say so | 4 |
| R8 | Configuration is lost when moving from the environment to the store, and payments stop | L | H | release N reads the environment while the import runs and is verified in admin; release N+1 reads the store; environment variables are deleted only after N+1 has run cleanly for a week ([migration-plan.md §4](migration-plan.md#4-configuration-from-the-environment-into-the-store)) | 2 |
| R9 | A missing `CONFIG_ENCRYPTION_KEY` now disables Stripe as well | L | H | boot warning, health output and an admin banner already exist; the deployment checklist and the runbook make the key a hard requirement once Stripe moves | 2 |
| R10 | A deploy changes a settings schema, and an integration becomes `invalid` and disappears | L | H | the conformance suite requires a settings migration for any schema change; the health cron revalidates after deploy; a transition to `invalid` emits `integration.health_changed`, which notifies operators | 3 |
| R11 | Gating wrongly hides something customers need, such as payments | L | H | Phase 3 ships in shadow mode for one release: every gate logs what it would hide, and nothing is hidden. Enforcement follows when the log is clean | 3 |
| R12 | Proxbase is two days old (v0.2.0, `v1alpha1` file format) | H | M | pin the version and the action SHA; keep `tooling/proxmox-cluster` until the nightly job has been green for two weeks; the upstream requests in [ADR 0017](adr/0017-proxmox-e2e-on-proxbase.md) | 3, 7 |
| R13 | Runner capacity for the three-node nightly job | M | M | a larger hosted runner or a self-hosted KVM host, running `main` only so that PR code never runs there; the one-node label job stays on hosted runners | 7 |
| R14 | The Pelican panel container is slow or flaky in CI | M | M | a pinned image, a health-check wait, seeded data; the full install path (Wings) nightly only | 6 |
| R15 | Migrating every integration in Phase 1 breaks one in production | M | H | one PR per integration; conformance, contract and E2E suites; behaviour unchanged apart from the listed fixes; Sentry watched after each deploy | 1 |
| R16 | Customer webhooks become an SSRF vector or leak secrets | M | H | HTTPS only; private, loopback and link-local ranges refused at save **and** at send (DNS rebinding); signing secrets write-only; per-endpoint rate limits; step-up to reveal | 5 |
| R17 | Personal data reaches third parties through integration hooks | M | H | PII levels with redaction; subscribers below an event's level get a redacted payload; conformance checks; review | 4 |
| R18 | An uninstall deletes data by mistake | L | H | step-up, typed confirmation, refusal while services exist, an audit entry; the confirmation states that only a database point-in-time restore can bring the data back | 5 |
| R19 | The cause of the CI compile timeout is unknown, which blocks Phase 1 | M | H | time-box the investigation; the fallback is to run a full `next build` in CI, which passes in about 2 minutes in the E2E job | 1 |
| R20 | `restrict` foreign keys on owned tables block offboarding when an `erase` is missing | M | M | conformance requires `erase`; `ERASURE_PLAN` covers integration steps; offboarding failures alert | 5 |
| R21 | The provisioning port fits servers and game servers but not domains | M | M | the AutoDNS skeleton exercises `quote`, `pending` transfers and dynamic checkout forms before the port is declared stable; the port is marked unstable until Phase 6 ends | 6 |
| R22 | The admin console has two write mechanisms (next-safe-action for core pages, tRPC for integration pages) | M | L | written down in `AGENTS.md`, with the reason | 5 |
| R23 | Moving strings into per-integration namespaces costs translators work | M | L | Crowdin's translation memory fills moved strings; the move happens once, in Phase 1 | 1 |

## Pre-existing defects

Discovery found these defects in today's code. Decision D11 puts all of them in
this programme: each is fixed in the phase that touches the code anyway, except
the rows marked **hotfix**, which ship first, on their own.

### Security

| ID | Defect | Evidence | Severity | Fix in |
| --- | --- | --- | --- | --- |
| S1 | Proxmox node API tokens are stored in plain text | `packages/db/src/schema/proxmox-nodes.ts:81` | high | 2.8 |
| S2 | Proxmox tokens and generated root passwords pass through workflow inputs and step results, so they persist in the workflow event log | 7 entry points, listed in the Proxmox discovery report | high | 2.8 |
| S3 | The node hookscript authenticates with `CRON_SECRET`, which also authorises every cron route, and copies it onto every node | `apps/web/src/features/admin/lib/proxmox-nodes/hookscript.ts:59-66` | high | 2.8 |
| S4 | An admin who is demoted or banned keeps write access for up to five minutes, because `verifySession` trusts the cookie cache | `apps/web/src/features/admin/api/verify-session.ts:82` | medium | 2.3 |
| S5 | TOTP is only enforced after password sign-in; magic link, email OTP, passkey and social sign-in skip it; admins are not required to have a second factor | better-auth `two-factor/index.mjs:244-246` | medium | D10 |
| S6 | An admin can export a customer's complete data without step-up | `apps/web/src/features/admin/api/users/create-user-export.ts:34-62` | medium | 2.3 |
| S7 | Anonpay puts its webhook secret in a query string, and errors include that query string | `integration-anonpay/src/client.ts:31-48` | medium | 1 (Anonpay PR) |
| S8 | Discord's interaction token ends up in logged `DiscordApiError` messages | `integration-discord/src/api/client.ts:27-30`, `handlers/defer.ts:90-95` | medium | 1 (Discord PR) |
| S9 | A client component imports the Anonpay barrel, shipping the integration definition and its schemas to browsers | `apps/web/src/features/checkout/components/elements-provider.tsx:18-25` | low | 1 |
| S10 | No integration sets an outbound HTTP timeout | every integration package | medium | 1.3 (`ctx.http`) |
| S11 | The hookscript webhook matches guests by `vmid` alone, which is unsafe with more than one cluster | `apps/web/src/app/api/proxmox/webhook/route.ts:91-95` | medium | 2.8 |
| S12 | Discord's user lookup does not filter accounts by provider | `packages/integration-discord/src/utils/get-user-by-interaction.ts` | medium | 1 (Discord PR) |
| S13 | The SMTP transport disables TLS certificate verification and sends as `noreply@example.com` in every environment | `packages/email/src/send-via-nodemailer.ts:57-64` | medium | 2.5 |
| S14 | The abuse-mailbox signing key falls back to `CONFIG_ENCRYPTION_KEY`, used raw as an HMAC key; rotating the master key silently re-tags every case address | `packages/api/src/abuse/mailbox/address.ts:41-42` | medium | 2.7 |
| S15 | The server-side env schema (names, not values) is shipped to browsers through the tRPC client | `apps/web/src/lib/trpc/react.tsx:36` | low | 2.9 |

### Correctness

| ID | Defect | Evidence | Severity | Fix in |
| --- | --- | --- | --- | --- |
| C1 | CI "Compile the web app" times out at 30 minutes on every push to `main` since `736beedc` | `.github/workflows/ci.yml:127` | high | 1.0 |
| C2 | `bun script` always exits 0, ignores stdin and drops shell environment variables | `apps/web/scripts/run.ts:30-41`, `turbo.json` `script` task | medium | 1.0 |
| C3 | `onDisable` never runs | `packages/integration-sdk/src/registry.ts:351-357,455-457` | medium | 1.3 |
| C4 | "Check now" probes every integration, including Discord's sync, which writes to Discord | `apps/web/src/features/admin/api/integrations/update-integration.ts:171` | low | 1.3 |
| C5 | AbuseIPDB: switches cannot be turned off (`z.coerce.boolean("false")` is `true`); a blank threshold becomes 0, not 50; `blockPrefixLength` is never read; the health probe spends quota | `packages/integration-abuseipdb/src/index.ts`, `packages/api/src/abuse/poll.ts:188` | medium | 1 (AbuseIPDB PR) |
| C6 | Stripe's health check reads the environment key, and Stripe cannot be switched off because `env.ts` requires its keys | `apps/web/src/env.ts:50-51` | medium | 2.6 |
| C7 | Notification dedupe is per group, forever: a customer's second reply and later reporter mails are silent, and a reopened case's notice is suppressed | `packages/api/src/notifications/dispatch.ts:69-87`, `packages/api/src/abuse/intake.ts:310-335` | medium | 4 (after golden tests) |
| C8 | `dispatchNotification` can throw despite its comment; three callers have no `.catch` | `packages/api/src/notifications/dispatch.ts:185,246` | low | 4 |
| C9 | Notification deliveries stuck in `pending` are never retried | `packages/api/src/notifications/retry.ts:47` | medium | 4 |
| C10 | `enforceCase` tells the customer their servers were restricted even when nothing was locked | `packages/api/src/abuse/enforce.ts:303-315` | medium | 4 |
| C11 | Servers whose lock failed during enforcement are never retried, although the operator text promises it | `packages/api/src/abuse/enforce.ts:527-530`, `packages/api/src/notifications/text.ts:98` | high | 4 |
| C12 | An automatically closed case sends neither the customer's resolved notice nor the reporter mail | `packages/api/src/abuse/reconcile.ts:196-224` | low | 4 |
| C13 | Renewal and upgrade power a guest back on through an abuse `power_off` lock; the lock reconciler then re-locks it and counts drift | extend and upgrade workflows; no workflow reads `abuse_locked_at` | high | **hotfix** |
| C14 | An abuse `terminate` can be delayed or undone by auto-renewal | `suspend-terminated-servers` skips auto-renewing subscriptions for 8 days; a renewal resets the term | high | **hotfix** |
| C15 | Deleting a server erases its address history, so a late abuse report resolves as unattributed | `subnet_allocations.server_id` `ON DELETE CASCADE` (`subnet-allocations.ts:49-52`) | high | 6.2 (rows are no longer deleted) |
| C16 | One unreachable node stalls billing suspension for the whole fleet: no batch limit and a single `Promise.all` | `apps/web/src/app/api/cron/suspend-terminated-servers/route.ts` | high | **hotfix**, or 3.2 at the latest |
| C17 | Abandoned `awaiting_payment` orders are never cancelled, and block account deletion permanently | order state machine; no cancel path | medium | 4.3 |
| C18 | A failed provision leaves a paid, `fulfilled` order and no record | `packages/api/src/orders/fulfill-order.ts:147-150`, `packages/api/src/workflows/provision-server/store-provisioned-server.ts:77-106` | high | 6.3 |
| C19 | A retried fulfilment can issue a second invoice; `generateInvoiceStep` is not idempotent | `packages/api/src/workflows/create-invoice/generate-invoice.ts:48` | high | 4.3 |
| C20 | `subscriptions.cancel` writes auto-renew and status in two statements | `packages/api/src/router/subscriptions.ts` | low | 4.3 |
| C21 | `applyPaymentEvent` is four writes, not one transaction | `packages/api/src/orders/apply-payment-event.ts:95-154` | medium | 4.3 |
| C22 | Abuse termination moves `terminates_at` without moving the subscription period | abuse enforcement and subscriptions | medium | 6.5 |
| C23 | The renewal reminder is sent before its marker is written; the suspension mail is lost if sending fails | `apps/web/src/app/api/cron/send-renewal-notifications/route.ts:112`, `apps/web/src/app/api/cron/suspend-terminated-servers/route.ts:218` | low | 4.5 |
| C24 | `vzdump.$post` runs inside a database transaction | `packages/api/src/router/servers/backups/index.ts:331` | medium | 4.2 (before in-transaction hooks) |
| C25 | The Proxmox client retries a timed-out POST once, whatever the method | `@virtbase/proxmox-api` `proxmox-engine.js:163-176` | medium | 2.8 |
| C26 | No test runs the migrations; 8 of 35 contain data SQL that has never run against data | `packages/db/src/test-client.ts:71-78` | medium | 1.2 (migration gate) |
| C27 | Discord's application ID is configured twice with no check; `role_connections.write` is always requested | `DISCORD_CLIENT_ID` versus `settings.appId` | low | 2 (D4 interim) |
| C28 | Login buttons for unconfigured providers are shown, and fail | `login-form-context.tsx:34-40`, `signup-form.tsx:26` | low | 2 (D4 interim) |
| C29 | `storeServerExtensionStep` and `storeServerDeletionStep` are not replay-safe | `packages/api/src/workflows/extend-server/store-server-extension.ts`, `packages/api/src/workflows/delete-server/store-server-deletion.ts` | medium | 4.3 |
| C30 | Test database snapshots (about 44 MB each) are never evicted | `packages/db/.cache/test-db/` | low | 1.2 |
| C31 | E2E has no encryption key, so no integration can be configured, and all specs share one database in full parallel | `e2e.yml:65-77`, `playwright.config.ts:28,31` | medium | 3.6 |
| C32 | Preview deployments finalize real Lexware invoices, because `finalize` is `NODE_ENV === "production"` | `packages/api/src/workflows/create-invoice/generate-invoice.ts:203` | high | **hotfix** (then `APP_ENV` in 2.4) |
| C33 | Outside Vercel, every origin falls back to `*.virtbase.localhost` and every email goes to `delivered@resend.dev`, silently | `packages/utils/src/constants/main.ts:35-89`, `packages/email/src/send-via-resend.ts:80-87` | medium | 2.4 (`APP_ENV`) |
| C34 | The locale cookie domain is computed in the browser, where `VERCEL_URL` is undefined, so a client-side locale switch writes a cookie a production browser rejects | `apps/web/src/i18n/routing.public.ts:24-28`, `packages/utils/src/constants/cookies.ts:18-20` | medium | 2.4 |
| C35 | The SMTP fallback drops reply-to, cc and attachments, so invoice PDFs are not attached | `packages/email/src/index.ts:82-92` | medium | 2.5 |
| C36 | The Resend audience ID is a placeholder, and the erasure step records success whether or not unsubscribing worked | `packages/email/src/resend/constants.ts:18`, `packages/api/src/workflows/offboard-user/detach-external-services.ts:64-68` | medium | 2.5 |
| C37 | Discord and GitHub OAuth revocation during offboarding most likely fails silently: no client credentials, an incomplete GitHub URL, every response counted as revoked | `packages/api/src/workflows/offboard-user/revoke-external-identities.ts:24-28,80-86` | medium | 5.4 |
| C38 | Company identity exists in three diverging copies (email footer, JSON-LD, legal MDX) | `packages/email/src/templates/footer.tsx:136-142`, `apps/web/src/ui/seo/default-json-ld.tsx:48-79`, `packages/content/legal/*` | medium | 2.4 |
| C39 | The country list exists three times, and Greece is missing from all three | `packages/integration-lexware/src/constants.ts:26-53`, `packages/api/src/lib/invoicing.ts:23-49`, `apps/web/src/features/checkout/components/stripe-payment-form.tsx:41-68` | medium | 2.4 |
| C40 | The privacy policy and help articles contradict the code: they describe analytics, a cookie banner and a contact form that do not exist, omit processors that do, and state wrong durations | `packages/content/legal/*/privacy.mdx`, help articles | high (legal) | content review, outside this programme |
| C41 | Base cloud-init snippets are seeded only by a development script, so a fresh production database starts without them | `packages/utils/src/cloud-init/base-snippets.ts:37-149`, `apps/web/scripts/dev/seed-cloud-init-snippets.ts` | medium | 2.4 |
| C42 | 13 of 17 email catalogues are translated but never loaded | `packages/email/src/translations/index.ts:21-27` | low | 1 (translation work) |
| C43 | Template hardware settings never reach the VM: the same workflow overwrites them | `packages/api/src/workflows/shared/create-guest-from-image.ts:76-79`, `packages/api/src/workflows/provision-server/apply-hardware-config.ts:91,101,106` | low | 6 |
| C44 | Runtime secrets are part of the turbo build hash, so rotating one invalidates the build cache | `turbo.json:11-51`, `apps/web/turbo.json:13` | low | 2.9 |
| C45 | An Anonpay payment leaves the order's Stripe PaymentIntent open; a second successful payment on the same order is recorded but never refunded | `packages/api/src/router/checkout.ts:438-464`, `packages/api/src/orders/apply-payment-event.ts` | medium | 2.6 (checkout through the payment port) |

## Rollback plan

| Phase | What ships | How to roll back | Point of no return |
| --- | --- | --- | --- |
| 1 | SDK and integration refactors, tests, CI gates; no schema change | revert the PR; each integration is its own PR and its own revert | none |
| 2 | Additive schema (installation columns, setting secrets, the audit log, `int_stripe_customers`); configuration moved from the environment in two releases; encrypted node tokens (dual read) | redeploy the previous release, which works against the expanded schema. From N+1 back to N works while the environment variables are still set. The plaintext token column is kept until its contract release | the contract releases: the old installation index, the environment variables, the plaintext token column. Each happens only after a week on the new path. |
| 3 | Gating, shadow mode first | revert, or switch back to shadow mode with a setting (`features.gating = "log"`) | none |
| 4 | Additive tables; event emission; one PR per domain cutover | revert the domain PR, so its direct calls return. `events.dispatch.paused` stops the drain without losing anything; deliveries wait and resume | none; old outbox rows expire by retention |
| 5 | Additive routes, tables and `integration_data` | revert. An uninstall that already ran is not reversible except by a database point-in-time restore, which the confirmation dialog states | per uninstall, by design |
| 6 | Expand, backfill, dual write, read switch, contract ([migration-plan.md §3](migration-plan.md#3-products-orders-and-subscriptions)) | before the contract: redeploy the previous release, which still reads the old columns it wrote. After the contract: restore only | the contract release, after an explicit go/no-go and a week of soak |
| 7 | CI jobs | disable the jobs | none |
