# Migration plan

How existing data, configuration and code move onto the
[integration-first design](integration-first.md) without downtime and without
losing history.

1. [Rules every migration follows](#1-rules-every-migration-follows)
2. [Integrations to manifest v2](#2-integrations-to-manifest-v2)
3. [Products, orders and subscriptions](#3-products-orders-and-subscriptions)
4. [Configuration from the environment into the store](#4-configuration-from-the-environment-into-the-store)
5. [Notifications and email onto events](#5-notifications-and-email-onto-events)
6. [Data that changes owner](#6-data-that-changes-owner)
7. [Verification](#7-verification)

## 1. Rules every migration follows

- **Schema migrations run in the Vercel build** (`turbo -F @virtbase/db db:migrate`
  in `apps/web/vercel.json`), while the previous deployment still serves.
  Every schema change is therefore *expand* (additive, compatible with the
  running release) or *contract* (removal, only after no deployed release reads
  the removed thing).
- **Every release reads what the next release writes.** A release that
  introduces a new enum value or column already tolerates it in the release
  before. Rolling back one release is therefore always safe until a contract
  step.
- **Data moves in TypeScript backfills, not in SQL.** This follows the precedent
  `packages/api/src/backfill/subscriptions.ts`, run through
  `apps/web/scripts/backfill-*.ts`. Each backfill:
  - is idempotent and keyed by a mapping column;
  - runs as a script for the first pass;
  - also runs from a reconciler cron until the contract release, which catches
    rows written by older code still in flight, such as a Workflow DevKit run
    pinned to the previous deployment.
- **No existing workflow file is moved or renamed.** Step IDs embed the module
  path ([ADR 0013](adr/0013-proxmox-stays-core-for-now.md)).
- **Contract releases need an explicit go.** Each one waits at least a week after
  the read switch, and the PR records the go/no-go.

## 2. Integrations to manifest v2

All in Phase 1, one PR per integration, behaviour unchanged except for the
listed fixes. Every PR includes:

- the four entry points;
- `ctx.http`, `ctx.logger` and `IntegrationError`;
- health with a budget;
- the conformance suite and the contract suite for each port it provides;
- `docs/`;
- the `<id>-integration` translation namespace;
- coverage at 80 % or above.

Coverage figures are for the package's own files, from the lcov files of
2026-10-10.

| Integration | Ports provided / consumed | Specific work | Fixes | Coverage now (lines / functions) |
| --- | --- | --- | --- | --- |
| `powerdns` | `dns` / – | smallest; the template for the others | — | 77.6 % / 83.3 % |
| `webhook` | `notifications` / – | operator channel unchanged; customer webhooks come in Phase 5 | — | 100 % / 75.0 % |
| `alertmanager` | – / `signals` | webhook unchanged; select option labels translated | — | 100 % / 100 %, but only 1 of 5 files is loaded |
| `abuseipdb` | `abuse`, `ipReputation` / – | a settings migration that turns stored string booleans into real ones | C5: switches cannot be turned off, a blank threshold becomes 0, `blockPrefixLength` is never read, the health probe spends quota | 66.6 % / 81.8 % |
| `lexware` | `invoice` / – | invoice copy moves from `messages.ts` into the catalogue (all four locales; the fr and nl copy is unused today) | — | 94.7 % / 90.9 % |
| `prometheus` | `metrics` / new `platformMetrics` | its nine core-table reads move behind `platformMetrics`, served by core | — | 95.1 % / 89.2 % |
| `discord` | `identity`, `notifications` / `serverManagement`, new `identity` lookups | `accounts`/`users` reads become `identity.findLinkedAccount`; command and role-connection text moves into the catalogue for 18 Discord locales; sync moves from health to `onEnable` and a daily job | S8: interaction token in errors; S12: lookup without a provider filter; C4 | 76.9 % / 85.2 % (14 files under 80 %) |
| `stripe` | `payment` / – | tests from zero, including the payment contract suite; new `./manifest` and `./ui` entries. Checkout and webhooks still use the environment until Phase 2.6 | — (C6 in Phase 2.6) | no tests |
| `anonpay` | `payment` / – | tests from zero, including the contract suite; the client imports only `./ui` | S7: webhook secret in errors; S9: the definition shipped to the client | no tests |
| `core` (internal) | `serverManagement`, `notifications` (email), `signals`, new `platformMetrics` / – | a v2 manifest; features in Phase 3, `provisioning` in Phase 6 | — | (in `packages/api`) |

## 3. Products, orders and subscriptions

The target model is in [ADR 0012](adr/0012-products-and-services.md). Today:

- `server_plans` holds list prices and specs.
- `server_plan_prices` holds per-purchase price locks: purchase and renewal
  amounts, with discounts.
- `servers` references both with `restrict`.
- `subscriptions` references the lock as NOT NULL, and is limited to
  `subject_type = 'server'`.
- `order_items` and `orders.configuration` carry the plan IDs.

### 3.1 Releases

| Release | Schema (migration in the build) | Code | Backfill |
| --- | --- | --- | --- |
| **6-A expand** | create `products`, `product_prices`, `service_prices`, `services`, `service_transitions` and `discounts_to_products`; add nullable `server_plans.product_id` (unique), `servers.service_id` (unique), `order_items.product_id`, `order_items.product_price_id`, `order_items.service_id`, `subscriptions.service_price_id`, `invoices.order_id`; add the enum values `new_service`, `renewal` and `plan_change` to `order_types`; relax the subscription check to allow `'service'` | reads tolerate the new enum values and columns, and writes nothing new | first pass, by script (§3.2) |
| **6-B dual write** | none | new orders, servers and subscriptions are written to both models. Fulfilment creates the service row first (status `provisioning`). New orders get the new order types. Readers still use the old model | the reconciler runs every 10 minutes and catches rows written by in-flight runs of 6-A |
| **6-C read switch** | none | checkout, the dashboard, renewals, invoices and admin read the new model. The old columns are still written | a one-off update of `orders.type` for historic rows: `new_server` → `new_service`, `extend_server` → `renewal`, `upgrade_server` → `plan_change` |
| **6-D contract** (after a week's soak and an explicit go) | `subscriptions.server_plan_price_id` made nullable and no longer written; `servers.server_plan_price_id` kept as history; `discounts_to_server_plans` dropped; `order_types` rebuilt without the old values (create the new type, `ALTER COLUMN … USING`, drop the old one); `subscriptions.service_price_id` set NOT NULL | old writes removed | reconciler removed |

**What is never removed:**

- **`server_plans`.** It stays as the server-kind detail of a product: node
  group, specs, the `pck_` IDs used by `GET /offer-list` and the ServerHunter
  feed.
- **The plan and price columns on `order_items`,** kept as history.
- **`orders.configuration`** with its version 2 variants. The schema keeps
  parsing them, and new orders write version 3 (`productId`, `serviceId`,
  `config`).

### 3.2 Backfill rules

Each step is idempotent through its mapping column.

1. **Products.** One `products` row per `server_plans` row:
   - kind `server`, provider `core`;
   - slug, name and sort order taken from the plan;
   - `server_plans.product_id` points back to it.
2. **List prices.** One `product_prices` row per plan: one month, amount
   `server_plans.price`, currency from the column default (EUR).
3. **Price locks.** One `service_prices` row per `server_plan_prices` row:
   - purchase and renewal amounts, discounts and timestamps copied;
   - the product found through the plan;
   - the period from the subscription that references it, or one month;
   - `legacy_server_plan_price_id` unique.
4. **Services.** One `services` row per `servers` row:
   - user, product and price lock as above;
   - `provider_ref` is the `kvm_` ID;
   - `servers.service_id` points back to it.

   Its status is derived from the timestamps:

   | Server state | Service status (reason) |
   | --- | --- |
   | `suspended_at` set | `suspended` (`billing`) |
   | `abuse_locked_at` set | `suspended` (`abuse`) |
   | otherwise | `active` |

   One `service_transitions` row records the backfill, with actor
   `system:backfill`.
5. **Order items and orders.**
   - `order_items.product_id` comes from `server_plan_id`.
   - `order_items.service_id` comes from `orders.server_id` →
     `servers.service_id`.
   - Orders whose server was deleted get no service. Their history keeps the
     plan IDs and the item's name and amount snapshot.
6. **Subscriptions.**
   - `subscriptions.service_price_id` comes from `server_plan_price_id`.
   - The subject stays `('server', kvm_…)` until 6-C. A 6-C update then sets it
     to `('service', svc_…)` in the same transaction for each row, guarded by
     the live-subject unique index.
7. **Discounts.** `discounts_to_products` is copied from
   `discounts_to_server_plans`.

`invoices.order_id` stays null for historic invoices. No reliable link exists
today, and inventing one would be worse than leaving it empty.

### 3.3 Workflows during the switch

**The existing Proxmox workflows keep their files and names.** The new generic
workflows are new files. A provision run started by 6-A code finishes on the
6-A deployment and writes a server without a service. The reconciler of 6-B
gives it one within 10 minutes.

**Terminated servers stop being deleted from 6-B on.** Their rows stay, with a
terminated service, which keeps `subnet_allocations` history (C15).

## 4. Configuration from the environment into the store

### 4.1 Installations (Phase 2.1)

1. **Expand:**
   - add `slug` (default `'default'`), `label` (default: the integration's name)
     and `config_status` (default `'valid'`) to `integration_installations`;
   - create the unique index on `(integration_id, slug)`.
2. **Revalidate.** The health cron revalidates every installation after the
   deploy and corrects `config_status`.
3. **Contract, in the next release:** drop the unique index on `integration_id`.

Secrets are untouched, because they already belong to an installation.

### 4.2 Moving values, release by release

| Values | Release N | Release N+1 |
| --- | --- | --- |
| Stripe (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`) | adds the `publishableKey` setting; checkout, the webhook route and the Stripe client resolve through the registry when the installation is active, and fall back to the environment otherwise | registry only; the environment variables are removed from `env.ts`, so Stripe can be switched off |
| Anonpay (`ANONPAY_*`, `NEXT_PUBLIC_STRIPE_ANONPAY_METHOD_ID`) | adds `stripePaymentMethodId`; the same fallback | registry only |
| Email transport (`RESEND_*`, `SMTP_*`) | the transport is resolved through the registry and injected into `initAuth()`; fallback as above | registry only |
| `AI_GATEWAY_API_KEY`, noVNC, abuse mailbox | the same pattern | registry only |
| `NEXT_PUBLIC_APP_NAME` and the app-setting constants | settings with the current values as fallbacks; readers switch to the store | constants removed. The bootstrap app name stays for better-auth's passkey and TOTP identity until D4 |

**The fallback in release N is the one exception** to "no environment fallback"
(`AGENTS.md`). It exists for a single release, so that the import can run while
traffic is served. It is deleted in N+1.

### 4.3 Operator runbook

1. **Make sure `CONFIG_ENCRYPTION_KEY` is set** in every environment. Generate it
   with `openssl rand -base64 32` if it is missing, and store it with the other
   secrets.
2. **Deploy release N.**
3. **Pull the environment of the deployment to migrate** into a local file, for
   example `vercel env pull --environment=production .env.migrate`. Keep the
   file outside the repository and delete it afterwards.
4. **Dry run:** `bun script config/import-env --from .env.migrate`. It prints
   every target key, masks every secret, and lists the integrations it will
   install and enable (Stripe always, Anonpay only if all four of its
   variables are set).
5. **Apply:** the same command with `--apply`, against the deployment's
   database. It writes in one transaction per target, records `script` entries
   in the audit log, and is safe to run again.
6. **Verify in the admin console:**
   - every imported integration shows as configured;
   - "Check now" is `ok`;
   - a test checkout in Stripe test mode works on a preview.
7. **Deploy release N+1.**
8. **After a week without incident,** delete the moved variables from the
   deployment, and prune them from `turbo.json`'s `build.env`.

**Rollback:** until step 8, redeploy release N. It reads the environment, which
is still there.

### 4.4 Encrypted Proxmox node tokens (Phase 2.8)

1. **Expand:** `token_secret_ciphertext` and a per-node wrapped key, written by
   the admin node form, and backfilled by a script that encrypts the existing
   plaintext. Readers prefer the ciphertext.
2. **Contract, one release later:** drop `token_secret`.

**Credentials leave workflow inputs:** steps load them by node ID inside the
step. Runs already in flight keep their old inputs. They finish on their pinned
deployment, and their event logs age out under the platform's retention.

## 5. Notifications and email onto events

### 5.1 Abuse (Phase 4.4)

| Today (call site) | Key | Becomes event | Audience |
| --- | --- | --- | --- |
| `abuse/intake.ts:188-194` | the signal's own type | `signal.received` (non-abuse types) | operator |
| `abuse/intake.ts:201-212` | `abuse.signal.unattributed` | `abuse.signal.unattributed` | operator |
| `abuse/intake.ts:293-307` | `abuse.case.opened` / `.updated` | `abuse.case.opened`, `abuse.case.signal_attached` | operator |
| `abuse/intake.ts:310-320`, `abuse/case.ts:296-308`, `manage-abuse-cases.ts:142-153` | `abuse.case.notice` | `abuse.case.awaiting_customer` | customer |
| `abuse/enforce.ts:304-314`, `:317-324` | `abuse.case.restricted`, `abuse.case.enforced` | `abuse.case.enforced` | customer, operator |
| `abuse/enforce.ts:603-616` | `abuse.lock.drift_detected` | `abuse.lock.drift_detected` | operator |
| `abuse/reconcile.ts:167-174` | `abuse.case.escalated` | `abuse.case.escalated` | operator |
| `abuse/triage/apply.ts:234-246` | `abuse.case.triaged` | `abuse.case.triaged` | operator |
| `abuse/mailbox/receive.ts:380-392`, `:473-485` | `abuse.report.received` | `abuse.case.reporter_replied`, `abuse.case.opened` (mailbox) | operator |
| `abuse/poll.ts:246-257`, `:265-271` | `abuse.source.poll_incomplete`, `abuse.source.poll_failed` | same names | operator |
| `router/abuse.ts:264-275`, `:322-333` | `abuse.case.customer_replied` | `abuse.case.customer_replied`, `abuse.case.customer_claimed_fixed` | operator |
| `manage-abuse-cases.ts:390-397` | `abuse.case.resolved` | `abuse.case.resolved` | customer |

The admin "Send test" (`manage-notification-targets.ts:169-174`) stays a direct
call.

**The notification subscriber** maps each event to today's key, audience,
severity and params. Today's keys therefore stay valid in every
`notification_targets` glob.

**How each domain cuts over:**

1. Record the current deliveries for a set of scenarios as golden files.
2. Wrap the domain's writes in transactions.
3. Emit the events.
4. Replace the direct calls.
5. Rerun the scenarios, draining the outbox, and compare with the golden files.

Today's per-case dedupe is kept, so the golden files match. It is fixed
afterwards in a separate PR (C7), which updates the golden files and says why.

### 5.2 Direct email sends (Phase 4.5)

These move onto the email channel of the notification subscriber:

- server ready, without the root password (see below), extended and deleted;
- suspended;
- the renewal reminder;
- the three dunning mails;
- invoice created;
- data export ready;
- the inactivity notice and reminder;
- account deletion scheduled and cancelled;
- password changed.

**Mail that carries a credential stays where it is:**

- the reset link, verification link, OTP and magic link;
- the deletion token mail;
- the server-ready mail when it contains a generated root password.

That mail is split: the notification says the server is ready, and the password
is delivered by the existing workflow step, which never puts it in an event.

## 6. Data that changes owner

| Data | From | To | Phase |
| --- | --- | --- | --- |
| Stripe customer IDs | `users.stripe_customer_id` (unique) | `int_stripe_customers` (installation, user, customer ID), copied by a backfill; the column is dropped one release later | 2.6 |
| Discord account lookups | direct reads of `accounts` and `users` | `identity.findLinkedAccount` / `listLinkedAccounts`, served by core | 1 |
| Prometheus gauges | direct reads of nine core tables | `platformMetrics`, served by core | 1 |
| Lexware country contacts | `COUNTRY_CONTACTS` constant | `lexware` installation settings (non-secret), seeded from the constant by the import script | 2.4 |
| Company identity | three copies (email footer, JSON-LD, legal MDX) | `company.*` settings; MDX through `<Company field=…/>` | 2.4 |

## 7. Verification

Every migration is covered by the migration gate
([integration-first.md §13](integration-first.md#13-quality-gates)).

- `drizzle-kit generate` produces no diff, and `drizzle-kit check` passes.
- A migration test applies all migrations in order to PGlite. Before each
  migration that moves data, and before each backfill, it seeds representative
  rows of the previous schema, then asserts the result. For 6-A to 6-D those
  rows include:
  - a plan with a recommended flag and an upsell;
  - a discounted price lock referenced by a server and a subscription;
  - each order type, including an order whose server was deleted;
  - a suspended server and an abuse-locked one.
- Each backfill has a test proving that running it twice changes nothing.
- E2E runs against the expanded schema in each release, before the next one
  ships.
