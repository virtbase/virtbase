# Configuration inventory

Part of the [integration-first design](integration-first.md), deliverable 3 of
Phase 0 (R5). It lists every environment variable the repository reads and
every configuration-like constant, each with a classification and a reason.
State: `a69165e7`, 2026-10-11.

How the values move, release by release, is in
[migration-plan.md §4](migration-plan.md#4-configuration-from-the-environment-into-the-store).
The settings model they move into is in
[integration-first.md §9](integration-first.md#9-settings-and-configuration-r5).

## Classifications

| Classification | Meaning |
| --- | --- |
| bootstrap | stays in the environment: needed before the database is readable, at build time, by infrastructure, or by Vercel and CI |
| integration | moves into an integration's settings (non-secret) or secrets (write-only, envelope-encrypted); new integrations are named explicitly |
| app setting | moves to the global `settings` table under a dotted key (`app.*`, `branding.*`, `company.*`, `billing.*`, `email.*`, `security.*`, …) |
| remove | dead or contradicted by the code, with proof |
| test/CI only, dev tooling only | never read by a running instance |

## How this was compiled

Every file `git ls-files` lists was searched for:

- `process.env` in every form;
- `Bun.env` and `import.meta.env`;
- `env.X` through the t3-env schemas;
- `${VAR}` in YAML, shell and Compose files;
- `secrets.*` in workflows.

Shared constants were cross-checked with LSP `findReferences`. "Is this in a
client bundle" was decided from a module graph built from every `"use client"`
file. Libraries that read the environment themselves are listed in §1.3. The
untracked `.env` was inspected for variable **names only**.

No secret, credential, personal address or phone number is reproduced. Where one
exists in the code it is described, for example "VAT ID: `DE` + 9 digits".

## Bootstrap allowlist

This is the allowlist the `process.env` gate enforces
([integration-first.md §13](integration-first.md#13-quality-gates), gate 9).

### Bootstrap

Rows 1–21 of §1.1:

`DATABASE_URL`, `CONFIG_ENCRYPTION_KEY`, `BETTER_AUTH_SECRET`,
`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `CRON_SECRET`,
`NEXT_PUBLIC_APP_DOMAIN`, `NEXT_PUBLIC_VERCEL_ENV`, `NODE_ENV`,
`NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_CSP_REPORT_URI`, `SENTRY_ORG`,
`SENTRY_PROJECT`, `SENTRY_URL`, `SENTRY_AUTH_TOKEN`, `VERCEL_URL`,
`VERCEL_GIT_COMMIT_REF`, `VERCEL_GIT_PREVIOUS_SHA`, `NEXT_RUNTIME`, `PORT`,
`NODE_EXTRA_CA_CERTS`.

### Test and CI only

`CI`, `VERCEL_AUTOMATION_BYPASS_SECRET`, `E2E_*`, `PATH`.

### Allowed until their phase moves them

- **Deferred integration values.** The six social-login variables
  ([ADR 0014](adr/0014-social-login-stays-in-env-for-now.md)).
- **Scoped to one package.** `NOVNC_PROXY_SECRET` is allowed in `apps/novnc-proxy`
  only, where it is the proxy process's own bootstrap value.

### What the gate starts from

The gate starts in Phase 1 as a ratchet: every read that exists today is
allowed, and nothing new is. It becomes this list at the end of Phase 2.

## When each value moves

| Values | Moves to | Phase |
| --- | --- | --- |
| `STRIPE_*`, `NEXT_PUBLIC_STRIPE_*`, `ANONPAY_*` | the existing `stripe` and `anonpay` integrations | 2.6 |
| `RESEND_*`, `SMTP_*` | an email transport integration (`resend`, `smtp`) | 2.5 |
| `AI_GATEWAY_API_KEY`, `NOVNC_PROXY_URL` and the web side of `NOVNC_PROXY_SECRET`, `ABUSE_MAILBOX_*` | new integrations `ai-gateway`, `novnc`, `abuse-mailbox` | 2.7 |
| `NEXT_PUBLIC_APP_NAME` and the app-setting constants (`branding.*`, `company.*`, `billing.*`, `support.*`, `social.*`, `accounts.*`, `privacy.*`, …) | global settings | 2.4 |
| the hookscript's use of `CRON_SECRET` | a separate `proxmox.hookscriptSecret` | 2.8 |
| `DISCORD_*`, `GITHUB_*`, `GOOGLE_*` client values | identity integrations | after Phase 5 |
| `npm_lifecycle_event` | removed | 1.2 |

---

## 0. Key findings and surprises

1. **The global settings system is unused.** `defineSettings` and
   `SettingsStore` (packages/config/src/settings-store.ts:40, :62) have exactly
   one reference each - their own declaration (LSP findReferences). Nothing reads
   or writes the `settings` table (packages/db/src/schema/settings.ts:32) outside
   the store itself.
2. **Stripe and Anonpay are configured twice.** The integrations already declare
   the secrets/settings (`stripe`: `secretKey`, `webhookSecret` -
   packages/integration-stripe/src/index.ts:28-31, :45-58; `anonpay`:
   `tickerTo`, `networkTo`, `address`, `webhookSecret` -
   packages/integration-anonpay/src/index.ts:28-36, :50-81), and the payment
   *port* uses them (`new Stripe(ctx.secrets.secretKey)`
   packages/integration-stripe/src/adapter.ts:204-205; anonpay adapter.ts:66-71,
   :118), reached through `requirePaymentCapability`
   (packages/api/src/payment-methods/provider.ts:89) from renewals
   (packages/api/src/billing/collect.ts:23, billing/reconcile-renewals.ts:37),
   payment-method removal and offboarding. But checkout, the webhooks, customer
   sessions and invoices use the **environment**: the module-level `stripe`
   client (packages/integration-stripe/src/client.ts:27-33, 38 references in 12
   files), `STRIPE_WEBHOOK_SECRET` (apps/web/src/app/api/stripe/webhook/route.ts:38),
   `ANONPAY_*` (packages/api/src/router/checkout.ts:576-588,
   apps/web/src/app/api/anonpay/webhook/route.ts:29,40). Two sources of truth
   for the same credentials can diverge (e.g. a test key in env, a live key in
   the DB). The Stripe health check even tests the env client, not the stored
   key (packages/integration-stripe/src/index.ts:66-71, message
   "STRIPE_SECRET_KEY is not set.").
3. **"Optional" integrations are mandatory at boot.** t3-env marks
   `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`,
   `CRON_SECRET`, `NOVNC_PROXY_SECRET`, `NOVNC_PROXY_URL`, `UPSTASH_REDIS_REST_*`
   as `.min(1)` required (apps/web/src/env.ts:37-38, :50-55, :91), and
   `next.config.ts` imports the schema at build time (apps/web/next.config.ts:19).
   The only escape is `CI` being set (env.ts:104-105, packages/auth/env.ts:37-38) -
   and the local `.env` does set `CI` (name present), so validation is off in
   local development too.
4. **Vercel system variables double as "is this production?" switches**, which
   breaks a non-Vercel deployment silently: without `NEXT_PUBLIC_VERCEL_ENV=production`
   every public/app/admin/api origin falls back to `http://*.virtbase.localhost:3000`
   (packages/utils/src/constants/main.ts:35-89), every Resend email is redirected
   to `delivered@resend.dev` (packages/email/src/send-via-resend.ts:80-87) and VMs
   are named `vb-dev<id>` (packages/api/src/workflows/shared/create-guest-from-image.ts:63-68);
   without `VERCEL_URL` the auth/locale cookie domain is `.virtbase.localhost`
   (packages/utils/src/constants/cookies.ts:18-20).
5. **`COOKIE_DOMAIN` is evaluated in the browser, where it is always wrong.**
   `routing.public.ts` passes it as next-intl's `localeCookie.domain`
   (apps/web/src/i18n/routing.public.ts:24-28) and is client-reachable
   (`navigation.public.ts` <- `checkout-waivers.tsx`, a `"use client"` file).
   `VERCEL_URL` is not a `NEXT_PUBLIC_` variable, so in the browser it is
   `undefined` and `COOKIE_DOMAIN` is `.virtbase.localhost`; next-intl writes that
   domain into `document.cookie` on a client-side locale switch
   (node_modules next-intl 4.14.9 `navigation/shared/syncLocaleCookie.js:8-33`),
   which a production browser rejects. Likely latent bug (not executed here);
   the server action path (apps/web/src/ui/locale-switcher-action.ts:48) is
   unaffected.
6. **`NODE_ENV === "production"` is also true on Vercel previews.** It decided
   whether Lexware invoices are finalized until risk C32 was fixed; the step now
   calls `isProductionDeployment(process.env.NEXT_PUBLIC_VERCEL_ENV)`
   (packages/api/src/workflows/create-invoice/generate-invoice.ts).
7. **`CRON_SECRET` is baked into every Proxmox node.** It is uploaded as the
   hookscript's `{{HOOKSCRIPT_SECRET}}` together with `{{PUBLIC_DOMAIN}}`
   (apps/web/src/features/admin/lib/proxmox-nodes/hookscript.ts:62-66; callers
   apps/web/src/features/admin/api/proxmox-nodes/create-proxmox-node.ts:252,
   apps/web/scripts/dev/seed-proxmox-cluster.ts:147). Rotating it means
   re-uploading the hookscript to every node; the comment at hookscript.ts:63-65
   already anticipates a dedicated secret.
8. **better-auth reads its secret implicitly, in two instances, including the
   proxy.** `secret` is never passed (packages/auth/src/index.ts:61-351), so
   better-auth falls back to `BETTER_AUTH_SECRET`/`AUTH_SECRET`
   (better-auth 1.7.7 `dist/context/create-context.mjs:71`); `getCookieCache` in
   the admin proxy path does the same (apps/web/src/lib/middleware/admin.ts:49 ->
   better-auth `dist/cookies/index.mjs:301`). Instances are created at module load
   (apps/web/src/lib/auth/server.ts:23) and lazily inside the proxy
   (apps/web/src/lib/middleware/utils/read-session.ts:24). Social providers are
   fixed at construction (packages/auth/src/index.ts:298-319).
9. **The domain and app name are identity-bearing.** Passkeys bind
   `rpName: APP_NAME` and `origin: [APP_DOMAIN, ADMIN_DOMAIN]`, and TOTP uses
   `issuer: APP_NAME` (packages/auth/src/plugins/index.ts:170-175). Changing the
   domain invalidates registered passkeys; changing the name renames future TOTP
   entries only.
10. **The abuse-mailbox signing key falls back to the master key, used raw as an
    HMAC key** (packages/api/src/abuse/mailbox/address.ts:41-42). Rotating
    `CONFIG_ENCRYPTION_KEY` (or setting `ABUSE_MAILBOX_SECRET` later) silently
    changes every case-address tag, so existing reporter threads stop routing by
    tag.
11. **Dead branch:** `process.env.npm_lifecycle_event === "lint"`
    (apps/web/src/env.ts:105, packages/auth/env.ts:38, turbo.json:124) - no
    `package.json` in the repository defines a `lint` script (`git ls-files
    '*package.json' | xargs grep '"lint":'` finds nothing).
12. **Stale comments** say the DB client only routes to the local Neon proxy when
    `NODE_ENV` is development (.github/workflows/ci.yml:167-171,
    apps/web/e2e/auth.setup.ts:44-48); the client keys on the host instead
    (packages/db/src/client.ts:37-46).
13. **The SMTP transport disables TLS verification** (`secure: false`,
    `tls.rejectUnauthorized: false`, packages/email/src/send-via-nodemailer.ts:57-60)
    and sends as `noreply@example.com` (:64) - in every environment, not only
    development.
14. **Layering constrains where settings can be read.** `@virtbase/utils` (Layer 0,
    "may import nothing", .dependency-cruiser.jsonc rule
    `foundation-imports-nothing`) owns `APP_NAME`, all domains and
    `SUPPORT_EMAIL` as module-load constants; `@virtbase/email` and
    `@virtbase/auth` are Layer 1. A DB-backed value has to be resolved in Layer 5
    (`packages/api`, `apps/web`) and passed down, or injected at boot.
15. **Runtime-only secrets are part of the build hash.** `turbo.json:11-51` lists
    Stripe, Anonpay, Resend, SMTP, OAuth and Upstash secrets as `build.env`, and
    `apps/web/turbo.json:13` adds the whole root `.env` as a build input, so
    rotating a runtime credential invalidates the build cache. Prune both as
    values move to the database.

---

## 1. Environment variables

### 1.1 Summary (one row per variable)

| # | Variable | Classification | Target | t3-env |
|---|---|---|---|---|
| 1 | `DATABASE_URL` | bootstrap | - | not declared (throws in db/client.ts:30-32) |
| 2 | `CONFIG_ENCRYPTION_KEY` | bootstrap | - | not declared |
| 3 | `BETTER_AUTH_SECRET` | bootstrap | - | required (auth/env.ts:25) |
| 4 | `UPSTASH_REDIS_REST_URL` | bootstrap | - | required (env.ts:37) |
| 5 | `UPSTASH_REDIS_REST_TOKEN` | bootstrap | - | required (env.ts:38) |
| 6 | `CRON_SECRET` | bootstrap | (split out `proxmox.hookscriptSecret` later) | required (env.ts:52) |
| 7 | `NEXT_PUBLIC_APP_DOMAIN` | bootstrap | - | not declared |
| 8 | `NEXT_PUBLIC_VERCEL_ENV` | bootstrap | (replace by a platform-neutral `APP_ENV`) | not declared |
| 9 | `NODE_ENV` | bootstrap | - | shared, default `development` (env.ts:30-32); `auth/env.ts:26` |
| 10 | `NEXT_PUBLIC_SENTRY_DSN` | bootstrap | - | optional URL (env.ts:88) |
| 11 | `NEXT_PUBLIC_SENTRY_CSP_REPORT_URI` | bootstrap | - | optional URL (env.ts:89) |
| 12 | `SENTRY_ORG` | bootstrap (build) | - | optional (env.ts:46) |
| 13 | `SENTRY_PROJECT` | bootstrap (build) | - | optional (env.ts:47) |
| 14 | `SENTRY_URL` | bootstrap (build) | - | optional URL (env.ts:48) |
| 15 | `SENTRY_AUTH_TOKEN` | bootstrap (build, implicit) | - | not declared |
| 16 | `VERCEL_URL` | bootstrap (platform) | - | optional via `vercel()` preset (env.ts:28) |
| 17 | `VERCEL_GIT_COMMIT_REF` | bootstrap (platform) | - | optional via preset |
| 18 | `VERCEL_GIT_PREVIOUS_SHA` | bootstrap (Vercel build) | - | optional via preset |
| 19 | `NEXT_RUNTIME` | bootstrap (set by Next) | - | not declared |
| 20 | `PORT` | bootstrap | - | not declared (novnc-proxy: zod, config.ts:29-34) |
| 21 | `NODE_EXTRA_CA_CERTS` | bootstrap (runtime trust store) | - | not declared |
| 22 | `NOVNC_PROXY_SECRET` | integration (web side) + bootstrap (proxy process) | new `novnc`: secret `sharedKey` | required (env.ts:54); proxy: zod regex (config.ts:38-46) |
| 23 | `NOVNC_PROXY_URL` | integration | new `novnc`: setting `proxyHost` | required (env.ts:55) |
| 24 | `STRIPE_SECRET_KEY` | integration | `stripe` secret `secretKey` (already declared) | required (env.ts:50) |
| 25 | `STRIPE_WEBHOOK_SECRET` | integration | `stripe` secret `webhookSecret` (already declared) | required (env.ts:51) |
| 26 | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | integration | `stripe` setting `publishableKey` (new, non-secret) | required (env.ts:91) |
| 27 | `NEXT_PUBLIC_STRIPE_ANONPAY_METHOD_ID` | integration | `anonpay` setting `stripePaymentMethodId` (new) | optional (env.ts:92) |
| 28 | `ANONPAY_TICKER_TO` | integration | `anonpay` setting `tickerTo` (already declared) | conditional (env.ts:57-63) |
| 29 | `ANONPAY_NETWORK_TO` | integration | `anonpay` setting `networkTo` (already declared) | conditional (env.ts:64-70) |
| 30 | `ANONPAY_ADDRESS` | integration | `anonpay` setting `address` (already declared) | conditional (env.ts:71-77) |
| 31 | `ANONPAY_WEBHOOK_SECRET` | integration | `anonpay` secret `webhookSecret` (already declared) | conditional (env.ts:78-84) |
| 32 | `RESEND_API_KEY` | integration | new `resend` (email transport): secret `apiKey` | optional (env.ts:39) |
| 33 | `RESEND_WEBHOOK_SECRET` | integration | new `resend`: secret `webhookSecret` | optional (env.ts:40) |
| 34 | `SMTP_HOST` | integration | new `smtp` (email transport): setting `host` | optional (env.ts:41) |
| 35 | `SMTP_PORT` | integration | new `smtp`: setting `port` | optional (env.ts:42) |
| 36 | `SMTP_USER` | integration | new `smtp`: setting `user` | optional (env.ts:43) |
| 37 | `SMTP_PASSWORD` | integration | new `smtp`: secret `password` | optional (env.ts:44) |
| 38 | `AI_GATEWAY_API_KEY` | integration | new `ai-gateway`: secret `apiKey` | optional (env.ts:36) |
| 39 | `ABUSE_MAILBOX_DOMAIN` | integration | new `abuse-mailbox` (or the `resend` inbound side): setting `domain` | not declared |
| 40 | `ABUSE_MAILBOX_SECRET` | integration | new `abuse-mailbox`: secret `signingSecret` | not declared |
| 41 | `DISCORD_CLIENT_ID` | integration (deferred) | `discord` identity: setting `oauthClientId` | optional (auth/env.ts:29) |
| 42 | `DISCORD_CLIENT_SECRET` | integration (deferred) | `discord` identity: secret `oauthClientSecret` | optional (auth/env.ts:30) |
| 43 | `GITHUB_CLIENT_ID` | integration (deferred) | new `github` identity: setting `clientId` | optional (auth/env.ts:31) |
| 44 | `GITHUB_CLIENT_SECRET` | integration (deferred) | new `github` identity: secret `clientSecret` | optional (auth/env.ts:32) |
| 45 | `GOOGLE_CLIENT_ID` | integration (deferred) | new `google` identity: setting `clientId` | optional (auth/env.ts:33) |
| 46 | `GOOGLE_CLIENT_SECRET` | integration (deferred) | new `google` identity: secret `clientSecret` | optional (auth/env.ts:34) |
| 47 | `NEXT_PUBLIC_APP_NAME` | app setting | `branding.name` (env value as the seed/fallback) | not declared |
| 48 | `npm_lifecycle_event` | remove | - | used only in `skipValidation` |
| 49 | `CI` | test/CI only | - | optional via preset |
| 50 | `VERCEL_AUTOMATION_BYPASS_SECRET` | test/CI only | - | optional via preset |
| 51 | `E2E_PUBLIC_URL` | test only | - | - |
| 52 | `E2E_APP_URL` | test only | - | - |
| 53 | `E2E_ADMIN_URL` | test only | - | - |
| 54 | `E2E_PORT` | test only | - | - |
| 55 | `E2E_SKIP_WEB_SERVER` | test only | - | - |
| 56 | `PATH` | test only | - | - |

Totals for the 56 variables the repository reads or sets for the
application: **bootstrap 21, integration 25 (6 of them deferred: social login),
app setting 1, remove 1, test/CI only 8.** CI-workflow, docker-compose and
dev-tooling inputs are listed separately in 1.4; variables only libraries read
are in 1.3.

### 1.2 Per-variable detail

Runtime-context legend: *module load* = evaluated once when the module is first
imported; *per call* = read inside a function on each invocation; *client* =
inlined into a browser bundle; *proxy* = `apps/web/src/proxy.ts` and
`apps/web/src/lib/middleware/**`; *build* = `next build`/`next.config.ts`;
*step* = a Workflow DevKit `"use step"` function.

#### Bootstrap

**1. `DATABASE_URL`** - Postgres (Neon serverless driver) connection string.
- Reads: packages/db/src/client.ts:28 (module load; throws "DATABASE_URL is not
  set" at :30-32; host `db.localtest.me` switches to the local Neon proxy at
  :46); packages/db/drizzle.config.ts:20-24 (drizzle-kit CLI).
- Set in: .env.example:29, .env.test:4, ci.yml:157, e2e.yml:72; turbo.json:17
  (build env), :83/:88/:93/:97 (db:* passThroughEnv). Local `.env`: present.
- Context: every server bundle importing `@virtbase/db/client` - route handlers,
  tRPC, workflow steps, scripts, and the proxy (via `read-session.ts:22` ->
  `@virtbase/auth` -> `@virtbase/db/client`, packages/auth/src/index.ts:19).
- Why bootstrap: the settings store lives in this database.

**2. `CONFIG_ENCRYPTION_KEY`** - master key that unwraps per-installation data keys.
- Reads: packages/api/src/integrations/index.ts:74-79 (module load; null store +
  warning at :81-86 when unset); packages/api/src/notifications/store.ts:29-34
  (module load); packages/api/src/orders/order-secrets.ts:30-33 (per call -
  encrypts the customer's initial root password); packages/api/src/abuse/mailbox/address.ts:42
  (per call, fallback HMAC key for case addresses).
- Set in: .env.example:26 (empty), turbo.json:16. Deliberately absent from CI
  (ci.yml:151-153, e2e.yml:66-68). Local `.env`: **not present** (integrations
  run disabled locally).
- Why bootstrap: needed to decrypt anything in `integration_secrets`; it is the
  root of R7's envelope encryption.

**3. `BETTER_AUTH_SECRET`** - signs session cookies, encrypts OAuth tokens
(`encryptOAuthTokens: true`, packages/auth/src/index.ts:63) and 2FA backup codes.
- Reads: implicit in better-auth (create-context.mjs:71) when the instances are
  built (apps/web/src/lib/auth/server.ts:23 at module load;
  apps/web/src/lib/middleware/utils/read-session.ts:24 lazily in the proxy;
  apps/web/e2e/support/auth.ts:32 in tests); implicit in `getCookieCache`
  (apps/web/src/lib/middleware/admin.ts:49 -> cookies/index.mjs:301, proxy);
  explicit apps/web/src/app/api/cron/sync-linked-account-metadata/route.ts:43
  (`env.BETTER_AUTH_SECRET`, cron) and
  packages/api/src/workflows/offboard-user/revoke-external-identities.ts:72 (step,
  per call - decrypts stored OAuth tokens before revoking them).
- Validated: required, packages/auth/env.ts:25 (extended into apps/web/src/env.ts:28).
- Set in: .env.example:16, .env.test:7, ci.yml:160, e2e.yml:75, turbo.json:15.
- Why bootstrap: needed by the proxy before any DB read, and every stored OAuth
  token is encrypted with it. better-auth already supports rotation through
  `BETTER_AUTH_SECRETS` (create-context.mjs:70) - unused today.

**4-5. `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`** - Upstash REST client.
- Reads: packages/api/src/upstash/redis.ts:21-24 (module load, `|| ""` fallback,
  so an unset value fails at first use, not at boot). Consumers: tRPC rate limit
  (packages/api/src/trpc.ts:50, ratelimit.ts:22-38), step-up markers
  (step-up/marker.ts:20), guest-firewall/guest-os caches and `once()` guards
  (guest-firewall/inspect.ts:28, guest-os/refresh.ts:25).
- Validated: required, apps/web/src/env.ts:37-38.
- Set in: .env.example:33-34, turbo.json:18-19; docker-compose.yml:56-66
  provides a local REST shim (`SRH_TOKEN`). Local `.env`: present.
- Why bootstrap: hit on every tRPC request for rate limiting; the
  `SettingsStore` cache explicitly cannot use it for invalidation
  (settings-store.ts:56-60). Could become an "infrastructure" integration later,
  but a per-request DB round-trip to find the rate limiter is the wrong trade.

**6. `CRON_SECRET`** - bearer token for Vercel Cron and the Proxmox hookscript.
- Reads: apps/web/src/lib/with-cron-secret.ts:26,33 (per request, all 21 routes
  under apps/web/src/app/api/cron/*, schedules in apps/web/vercel.json:6-91);
  apps/web/src/app/api/proxmox/webhook/route.ts:38,46 (per request);
  apps/web/src/features/admin/api/proxmox-nodes/create-proxmox-node.ts:252 (admin
  mutation, uploads it into the node's hookscript);
  apps/web/scripts/dev/seed-proxmox-cluster.ts:147 (CLI).
- Validated: required, apps/web/src/env.ts:52.
- Set in: .env.example:67, turbo.json:36. Implicit: Vercel sends
  `Authorization: Bearer $CRON_SECRET` to cron routes.
- Why bootstrap: Vercel reads it from the project environment. Recommend
  splitting the hookscript use into its own secret (DB-stored
  `proxmox.hookscriptSecret`, rotated by re-uploading), see finding 7.

**7. `NEXT_PUBLIC_APP_DOMAIN`** - the apex domain; every origin and hostname set
is derived from it.
- Reads: packages/utils/src/constants/main.ts:37,39,43-44,50-51,58,60,64-65,72,74,78-79,86,88
  (module load, client-inlined); packages/utils/src/constants/cookies.ts:19
  (module load); packages/api/src/abuse/mailbox/address.ts:31 (per call,
  fallback mailbox domain); packages/api/src/abuse/mailbox/send.ts:53 (per call,
  loop protection); tests: packages/api/src/abuse/__tests__/mailbox.test.ts:61,408.
- Set in: .env.example:12-13, .env.test:6, ci.yml:159, e2e.yml:74, turbo.json:14.
  Local `.env`: present.
- Derived constants and their consumers: see 1.5a/1.5b and section 3.2
  (`PUBLIC_DOMAIN` 38 files, `APP_DOMAIN` 46, `ADMIN_DOMAIN` 7, `API_DOMAIN` 1,
  four hostname sets, `COOKIE_DOMAIN` 7).
- Why bootstrap: host routing in the proxy (apps/web/src/proxy.ts:54-64),
  host-matched headers/redirects/rewrites compiled into `next.config.ts`
  (apps/web/next.config.ts:105,147,176,187,198,201,212), better-auth cookie
  domain and `allowedHosts` (packages/auth/src/index.ts:87-95,120-128), passkey
  origins (packages/auth/src/plugins/index.ts:170-173), CSP (csp/index.ts:90),
  client bundles, and URLs baked into Proxmox nodes (hookscript.ts:62).

**8. `NEXT_PUBLIC_VERCEL_ENV`** - deployment stage (`production`/`preview`/other).
- Reads: packages/utils/src/constants/main.ts:36,38,57,59,71,73,85,87 (module
  load, client-inlined; selects `https://<d>`, `https://staging.<d>` or
  `http://*.virtbase.localhost:3000`); packages/email/src/send-via-resend.ts:80
  (per send; non-production redirects to `delivered@resend.dev`, :87);
  packages/api/src/workflows/provision-server/apply-hardware-config.ts:112-116
  (step; VM tag), packages/api/src/workflows/shared/create-guest-from-image.ts:63-68
  (step; VM name prefix `vb`/`vb-staging`/`vb-dev`); the same logic in
  packages/api/src/workflows/shared/clone-guest.ts:48-53 is dead code
  (`cloneGuestStep` and `rollbackCloneGuestStep` have no references - LSP
  findReferences on clone-guest.ts:34 returns only the declaration).
- Set in: Vercel system env; .env.example:7 (commented); turbo.json:50.
- Why bootstrap: it is a build-time stage marker. Recommend a platform-neutral
  bootstrap variable (e.g. `APP_ENV`) so self-hosting does not depend on a
  Vercel name (finding 4).

**9. `NODE_ENV`** - build/runtime mode.
- Reads: apps/web/src/env.ts:30-32,95 (shared var, client-inlined);
  packages/auth/env.ts:26 (enum without `test` - inconsistent with env.ts:31);
  packages/auth/src/index.ts:191,208,251 and packages/auth/src/plugins/index.ts:115,149
  (per call: in development, auth emails are logged instead of sent);
  packages/email/src/index.ts:64 (per send: missing provider tolerated in
  development); packages/db/src/client.ts:104 (module load, HMR pool cache);
  apps/web/src/lib/csp/index.ts:66,75 (module load -> next.config headers);
  apps/web/src/app/api/trpc/[trpc]/route.ts:42 (`env.NODE_ENV`, error logging);
  apps/web/src/lib/trpc/react.tsx:116 (`env.NODE_ENV`, client logger link);
  scripts: apps/web/scripts/clean-dev-servers.ts:35, apps/web/scripts/run.ts:38,
  apps/web/e2e/auth.setup.ts:48; test: packages/email/src/__tests__/send-email.test.ts:162.
- Why bootstrap: set by the toolchain. The invoice-finalisation use must
  become an explicit setting (`lexware.finalizeInvoices` or
  `billing.invoices.finalize`), not a build mode.

**10. `NEXT_PUBLIC_SENTRY_DSN`** - Sentry DSN; also the on/off switch for Sentry.
- Reads: apps/web/next.config.ts:257 (build: wraps `withSentryConfig`);
  apps/web/src/instrumentation.ts:19,32 (server boot); apps/web/sentry.server.config.ts:21,23
  and apps/web/sentry.edge.config.ts:21,23 (server/edge init);
  apps/web/src/instrumentation-client.ts:63,67,79 (client, runs before React);
  apps/web/src/ui/feedback-button.tsx:54,89 (client component); env.ts:88,96.
- Set in: .env.example:101, turbo.json:45.
- Why bootstrap: client instrumentation initialises before any server data can
  reach it, and the build wiring (`withSentryConfig`, tunnel route `/science`,
  next.config.ts:260-273) depends on it.

**11. `NEXT_PUBLIC_SENTRY_CSP_REPORT_URI`** - CSP `report-uri`.
- Reads: apps/web/src/lib/csp/index.ts:123-125 (module load; the header is
  emitted from `next.config.ts` `headers()`, next.config.ts:61-64); env.ts:89,97-98.
- Set in: .env.example:106 (commented), turbo.json:46.
- Why bootstrap: part of the static header set compiled into the Next config.

**12-14. `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_URL`** - source-map upload target.
- Reads: apps/web/next.config.ts:261-263 (build only); declared env.ts:46-48;
  also read implicitly by `@sentry/bundler-plugin-core` 5.3.0
  (dist/cjs/index.js:5119-5122).
- Set in: .env.example:102-104, turbo.json:47-49.
- Why bootstrap: build-time only.

**15. `SENTRY_AUTH_TOKEN`** - source-map upload credential.
- Reads: implicit only (`@sentry/bundler-plugin-core` dist/cjs/index.js:5121).
- Set in: turbo.json:123 (globalPassThroughEnv). Not in .env.example.
- Why bootstrap: build-time credential of the CI/Vercel build.

**16. `VERCEL_URL`** - deployment URL (Vercel system variable).
- Reads: packages/utils/src/constants/cookies.ts:18 (module load; used as
  "deployed?" flag for the cookie domain); apps/web/src/lib/trpc/react.tsx:152
  (`env.VERCEL_URL`, server-side branch of a client module). Implicit:
  better-auth URL inference (dist/utils/url.mjs:71), Workflow DevKit core.
- Set in: Vercel system env; turbo.json:121.
- Why bootstrap: platform-provided. The cookie-domain use must key on the
  stage variable instead (findings 4-5).

**17. `VERCEL_GIT_COMMIT_REF`** - branch name prefixed to non-production email
subjects (packages/email/src/send-via-resend.ts:81,89). Set by Vercel;
turbo.json:122. Bootstrap (platform).

**18. `VERCEL_GIT_PREVIOUS_SHA`** - used by the Vercel `ignoreCommand`
(apps/web/vercel.json:5). Bootstrap (Vercel build).

**19. `NEXT_RUNTIME`** - `nodejs`/`edge`, set by Next
(apps/web/src/instrumentation.ts:23,27; turbo.json:131). Bootstrap.

**20. `PORT`** - two meanings.
- Web: apps/web/src/lib/trpc/react.tsx:154 (server-side fallback base URL
  `http://localhost:${PORT ?? 3000}`); passed through for e2e (turbo.json:67).
- novnc-proxy: apps/novnc-proxy/src/index.ts:45 (whole `process.env` parsed by
  `ConfigSchema`, config.ts:36-52) and :63 (healthcheck, `PortSchema`
  config.ts:29-34, default 8443); Dockerfile:33 `ENV PORT=8443`;
  docker-compose.yml:12; apps/novnc-proxy/.env.example:17.
- Why bootstrap: process listen port.

**21. `NODE_EXTRA_CA_CERTS`** - extra CA bundle (read natively by Bun) so the
Proxmox client and novnc-proxy trust a private CA.
- Reads: apps/web/e2e/proxmox/cluster.e2e.ts:46, apps/web/e2e/proxmox/patches.e2e.ts:58
  (skip guards); implicit Bun runtime. Written by scripts/setup.sh:41-46.
- Set in: turbo.json:130; apps/novnc-proxy/.env.example:22 (commented);
  documented in apps/novnc-proxy/README.md:25.
- Why bootstrap: process trust store, needed before any TLS connection. (A
  per-cluster CA in the DB would be a separate Proxmox-client feature.)

#### Integration

**22. `NOVNC_PROXY_SECRET`** - AES-256-GCM key shared by the web app and the
console proxy.
- Web reads: packages/api/src/router/servers/console.ts:71 (tRPC `servers ...
  console.get`, console.ts:42; per call; payload encrypted at :102-105, TTL
  `CONSOLE_PAYLOAD_TTL_SECONDS` :39). Validated required, env.ts:54.
- Proxy reads: apps/novnc-proxy/src/index.ts:45 via `ConfigSchema`
  (config.ts:38-46, 64 hex chars, refuses to start). docker-compose.yml:14;
  apps/novnc-proxy/.env.example:9; generated by scripts/setup.sh:33-37.
- Classification: web side -> new `novnc` integration, secret `sharedKey`; the
  proxy is a separate compiled binary with no DB access
  (apps/novnc-proxy/package.json `compile` uses `--no-compile-autoload-dotenv`),
  so it keeps its own environment variable (bootstrap for that process).
  Rotation then means: change the stored secret and redeploy the proxy.

**23. `NOVNC_PROXY_URL`** - public host of the console proxy.
- Reads: packages/api/src/router/servers/console.ts:72 (per call; becomes the
  `host` query parameter of `https://novnc.com/noVNC/vnc.html`, :107-108).
  Validated required, env.ts:55. .env.example:71, turbo.json:37.
- Classification: `novnc` setting `proxyHost` (non-secret; port 443 is
  hard-coded at console.ts:109 and the noVNC client URL at :107 - both belong in
  the same integration).

**24. `STRIPE_SECRET_KEY`**
- Reads: packages/integration-stripe/src/client.ts:27-33 (module load; `stripe`
  is `null` when unset) - consumers by LSP: integration-stripe get-or-create-customer.ts:22,
  index.ts:67,76 (health); packages/api/src/router/checkout.ts:41,99,418,438;
  orders/settle-stripe-payment.ts:22; payment-methods/settle-stripe-setup-intent.ts:19;
  backfill/payment-methods.ts:22; workflows/create-invoice/generate-invoice.ts:21,55
  (step); workflows/offboard-user/detach-external-services.ts:23,52-57 (step);
  apps/web/src/app/api/stripe/webhook/route.ts:26,39,48;
  apps/web/src/app/api/anonpay/webhook/route.ts:24,100-102;
  apps/web/src/app/(public)/[locale]/checkout/return/page.tsx:19,173-177 (server
  component). Also packages/api/src/orders/legacy-snapshot.ts:46 (per call,
  derives the decryption key for pre-order-table Stripe metadata; TODO(WS5.7)
  at :28).
- Validated required, env.ts:50. .env.example:50, turbo.json:28.
- Classification: `stripe` secret `secretKey` - **already declared**
  (integration-stripe/src/index.ts:28-31, :45-58). Work: replace the module-level client
  by one built from the stored secret (resolved per call or cached on the
  installation version). `legacy-snapshot.ts` keeps needing the *old* key until
  WS5.7 deletes it: copy the env value into the store and delete the file, do
  not port it.

**25. `STRIPE_WEBHOOK_SECRET`** - apps/web/src/app/api/stripe/webhook/route.ts:38
(per request). Validated required, env.ts:51; .env.example:52; turbo.json:30.
Classification: `stripe` secret `webhookSecret` (already declared, and already
used by the adapter's own webhook verification, adapter.ts:205,246-270).

**26. `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`** - Stripe.js key.
- Reads: apps/web/src/features/checkout/components/elements-provider.tsx:31-33
  (`loadStripe(...)` at **module scope of a client component**); env.ts:91,99-100.
- Validated required, env.ts:91. .env.example:51, .env (present), ci.yml:161,
  e2e.yml:76, turbo.json:29.
- Classification: `stripe` setting `publishableKey` (new; not secret, may be sent
  to the browser). See 1.5a for the runtime delivery path.

**27. `NEXT_PUBLIC_STRIPE_ANONPAY_METHOD_ID`** - id of the Stripe *custom payment
method* that shows Anonpay inside Stripe Elements.
- Reads: packages/integration-anonpay/src/constants.ts:26-27 (module load,
  exported as `ANONPAY_STRIPE_METHOD_ID`), consumed by client components
  apps/web/src/features/checkout/components/elements-provider.tsx:98-104 and
  stripe-payment-form.tsx:187-188; apps/web/src/env.ts:24-25 (refine
  predicate) and :92,101-102.
- Classification: `anonpay` setting `stripePaymentMethodId` (new). It couples
  two integrations; only the app (Layer 5) may read both.

**28-31. `ANONPAY_TICKER_TO`, `ANONPAY_NETWORK_TO`, `ANONPAY_ADDRESS`,
`ANONPAY_WEBHOOK_SECRET`**
- Reads: packages/api/src/router/checkout.ts:576-588 (tRPC `checkout.customCheckout`,
  :511; destructured from `process.env`; the webhook secret is put into the
  callback URL `${PUBLIC_DOMAIN}/api/anonpay/webhook?secret=...` at :598-599);
  apps/web/src/app/api/anonpay/webhook/route.ts:29,40 (per request; answers 200
  "not configured" when unset).
- Validated: conditionally required when `NEXT_PUBLIC_STRIPE_ANONPAY_METHOD_ID`
  is set (env.ts:24-25, :57-84). .env.example:57-63 (commented), turbo.json:32-35.
- Classification: `anonpay` settings `tickerTo`, `networkTo`, `address` and
  secret `webhookSecret` - **all already declared**
  (integration-anonpay/src/index.ts:28-36, :50-81) and used by the adapter
  (adapter.ts:66-71, :118). Work: route checkout and the legacy webhook through
  the adapter and drop the env reads.

**32. `RESEND_API_KEY`**
- Reads: packages/email/src/resend/client.ts:31 (`getResendClient()`, per send,
  memoised on the key) and :48 (`export const resend = getResendClient()` -
  module load; used by the Resend webhook route,
  apps/web/src/app/api/resend/webhook/route.ts:44, and by
  packages/email/src/resend/unsubscribe.ts:21,28, which the offboarding step
  calls at packages/api/src/workflows/offboard-user/detach-external-services.ts:66 -
  with the placeholder audience id, and recording success even when Resend
  returns an error or is not configured, :64-68); tests:
  packages/api/src/notifications/__tests__/dispatch.test.ts:88-94,142,
  packages/email/src/__tests__/send-email.test.ts:47-53,77.
- Validated optional, env.ts:39. .env.example:38, turbo.json:20.
- Context: every `sendEmail` - better-auth callbacks (packages/auth/src/index.ts:196,227,256;
  plugins/index.ts:125,157), the notifications email channel, workflow steps.
- Classification: new `resend` integration, secret `apiKey`, providing an
  email-transport port. Constraint: `@virtbase/email` is Layer 1 and
  `@virtbase/auth` calls it directly, so the transport must be injected from
  the composition root (finding 14). The audience id is a hard-coded placeholder
  (packages/email/src/resend/constants.ts:18) and belongs in the same integration.

**33. `RESEND_WEBHOOK_SECRET`** - Svix verification for inbound mail/events
(apps/web/src/app/api/resend/webhook/route.ts:53, per request). Optional,
env.ts:40; .env.example:41 (commented); turbo.json:21. Classification: `resend`
secret `webhookSecret`; the route moves under
`/api/integrations/resend/...` per AGENTS.md "Webhooks".

**34-37. `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`**
- Reads: packages/email/src/index.ts:39-45 (`isSmtpConfigured`, per send);
  packages/email/src/send-via-nodemailer.ts:37-40 and :51-55 (per send).
  Tests: send-email.test.ts:150-151, dispatch.test.ts:88-94.
- Validated optional, env.ts:41-44. .env.example:44-47 (local mailpit-style
  values), turbo.json:24-27.
- Classification: new `smtp` integration (settings `host`, `port`, `user`,
  `secure`/TLS options, `from`; secret `password`) providing the same
  email-transport port as `resend`. Today TLS verification is off and the sender
  is `noreply@example.com` (finding 13).

**38. `AI_GATEWAY_API_KEY`** - Vercel AI Gateway credential for abuse triage and
the firewall-rule generator.
- Reads: packages/api/src/abuse/triage/classify.ts:66-67 (`isTriageAvailable`,
  per call; callers triage/apply.ts:104,333 - cron
  apps/web/src/app/api/cron/triage-abuse-reports/route.ts:18 and admin);
  packages/api/src/router/servers/firewall/rules.ts:246 (tRPC `generate`, :226);
  packages/api/src/firewall-ai/eval/run.ts:135 (CLI eval, root package.json
  `eval:firewall-ai`). Implicit: `@ai-sdk/gateway` 4.0.110 reads it itself
  (src/gateway-provider.ts:703-705) because the code passes model **strings**
  (`ABUSE_TRIAGE_MODEL = "anthropic/claude-haiku-4.5"`,
  packages/api/src/abuse/triage/model.ts:19; `FIREWALL_AI_MODEL`), and falls back
  to `VERCEL_OIDC_TOKEN` (:715).
- Validated optional, env.ts:36. .env.example:82 (commented), turbo.json:12.
- Classification: new `ai-gateway` integration, secret `apiKey`, settings for the
  model ids. Requires `createGateway({ apiKey })` instead of model strings, and
  the "is AI available" checks must ask the registry, not the env. The eval CLIs
  can keep reading the env (dev only).

**39. `ABUSE_MAILBOX_DOMAIN`** - inbound/outbound domain of the abuse desk
(`abuse+<n>.<tag>@<domain>`).
- Reads: packages/api/src/abuse/mailbox/address.ts:29-32 (per call; falls back
  to `NEXT_PUBLIC_APP_DOMAIN`, then the literal `"virtbase.com"`);
  packages/api/src/abuse/mailbox/send.ts:52-55 (per call, own-domain loop guard).
  Callers: Resend webhook route (receiveAbuseEmail,
  apps/web/src/app/api/resend/webhook/route.ts:19) and admin case actions
  (send.ts:83,150,285).
- Not validated. .env.example:113, turbo.json:22.
- Classification: new `abuse-mailbox` integration setting `domain` (it needs its
  own MX in Resend, .env.example:108-112, so it is inbound-provider config). If
  the abuse desk stays core, the equivalent is app setting `abuse.mailbox.domain`.

**40. `ABUSE_MAILBOX_SECRET`** - HMAC key for the case-address tag.
- Reads: packages/api/src/abuse/mailbox/address.ts:41-42 (per call; falls back
  to `CONFIG_ENCRYPTION_KEY`); test mailbox.test.ts:60.
- Not validated. .env.example:118, turbo.json:23.
- Classification: `abuse-mailbox` secret `signingSecret`. Migration must keep the
  effective value (which today may be the master key) or existing case addresses
  stop verifying (finding 10).

**41-46. `DISCORD_CLIENT_ID`/`_SECRET`, `GITHUB_CLIENT_ID`/`_SECRET`,
`GOOGLE_CLIENT_ID`/`_SECRET`** - better-auth social login.
- Reads: packages/auth/src/index.ts:299-318 (inside `initAuth`, i.e. module load
  of apps/web/src/lib/auth/server.ts:23 and lazily in the proxy,
  read-session.ts:24). `trustedProviders: ["google"]` (:83) and the Discord
  scope `role_connections.write` (:305) are coupled to these.
- Validated optional, packages/auth/env.ts:29-34. .env.example:86-97,
  turbo.json:39-44.
- Classification: identity integrations - `discord` (already provides the
  `identity` port, used by the sync cron, sync-linked-account-metadata/route.ts:50)
  and new `github`/`google`. **Deferred**: it requires building better-auth from
  configuration (both instances), caching it per configuration version and
  invalidating on change; OAuth redirect URIs and stored-token encryption are
  unaffected. Recommend importing the values into the store now but switching the
  auth construction in a later phase. A second consumer is coming: the
  offboarding step that revokes OAuth grants posts only `token`, without client
  credentials, to Discord and to an incomplete GitHub URL
  (packages/api/src/workflows/offboard-user/revoke-external-identities.ts:24-28,
  :80-86; `revoked++` counts any HTTP response), so Discord and GitHub
  revocation most likely fails silently; fixing it needs these client
  credentials inside a workflow step.

#### App setting

**47. `NEXT_PUBLIC_APP_NAME`** - product/brand name.
- Reads: packages/utils/src/constants/main.ts:18 (`APP_NAME`, module load,
  fallback `"Virtbase"`; client-inlined).
- Consumers (LSP, 148 references in 54 files across 7 packages): 26 files in
  packages/email (templates and translations/index.ts:115), apps/web (18 files incl.
  manifest.ts:23-25, geofeed.csv/route.ts:47, og/route.tsx:130, seo/default-json-ld.tsx:43-91,
  api/docs/page.tsx:65-123, auth pages), packages/auth (index.ts:119 `appName`;
  plugins/index.ts:171,175 passkey `rpName`, TOTP `issuer`), packages/api
  (checkout.ts:608,619 Anonpay order description/name; privacy/export/brand.ts:108,
  document.ts:152), packages/integration-lexware (adapter.ts:113,127),
  packages/integration-anonpay (adapter.ts:89), packages/utils
  (functions/construct-metadata.ts:25,55,60).
- Client readers: apps/web/src/app/app.virtbase.com/[locale]/(auth)/register/page-client.tsx:44,
  apps/web/src/features/account/components/user-id-card.tsx:50,
  apps/web/src/features/servers/components/advanced/server-id-card.tsx:61,
  apps/web/src/ui/nav.tsx:61, apps/web/src/ui/layout/colored-layout.tsx:69
  (client via `unauthorized.tsx`).
- Set in: .env.example:9, .env.test:5, ci.yml:158, e2e.yml:73, turbo.json:13.
- Classification: app setting `branding.name`, seeded from the env value. Hard
  case on every axis: Layer-0 module constant, client-inlined, used at
  better-auth construction, in static metadata/manifest, and in 26 email
  templates. Practical path: a request-scoped `getBranding()` in Layer 5, props
  into client components, an argument into email templates, and the auth
  instance rebuilt (or a restart accepted) when it changes.

#### Remove

**48. `npm_lifecycle_event`** - apps/web/src/env.ts:105, packages/auth/env.ts:38,
turbo.json:124. Only compared with `"lint"`; no workspace defines a `lint`
script (root scripts are `check`, `check:ci`, ...; apps/web has `build`, `dev`,
`typecheck`, ...). Remove the comparison and the pass-through.

Also scheduled for removal (not variables, but env reads): the Stripe/Anonpay
env reads once they go through the integrations, and
packages/api/src/orders/legacy-snapshot.ts:46 with WS5.7.

#### Test / CI only

**49. `CI`** - disables t3-env validation (apps/web/src/env.ts:105,
packages/auth/env.ts:38), Sentry verbosity (apps/web/next.config.ts:264),
Playwright behaviour (apps/web/playwright.config.ts:29-31,36,109,114). Set by
ci.yml:18, e2e.yml:45, novnc-proxy.yml:62; turbo.json:118; present in the local
`.env` (which therefore disables validation locally).

**50. `VERCEL_AUTOMATION_BYPASS_SECRET`** - Playwright header for protected
deployments (apps/web/playwright.config.ts:53-56); turbo.json:67.

**51-55. `E2E_PUBLIC_URL`, `E2E_APP_URL`, `E2E_ADMIN_URL`** (apps/web/e2e/support/urls.ts:35-37),
**`E2E_PORT`** (apps/web/playwright.config.ts:21), **`E2E_SKIP_WEB_SERVER`**
(playwright.config.ts:106); all in turbo.json:125-129.

**56. `PATH`** - apps/novnc-proxy/src/__tests__/cli.test.ts:33 (spawned process env).

Test files that *write* `process.env` and will need updating when values move:
packages/api/src/abuse/__tests__/mailbox.test.ts:60-61,
packages/api/src/notifications/__tests__/dispatch.test.ts:140-154,
packages/email/src/__tests__/send-email.test.ts:74-92,150-151,162.

### 1.3 Variables read implicitly by libraries

Not read by repository code, but part of the environment contract:

| Variable | Read by | Evidence | Classification |
|---|---|---|---|
| `BETTER_AUTH_SECRET`, `AUTH_SECRET`, `BETTER_AUTH_SECRETS` | better-auth 1.7.7 | dist/context/create-context.mjs:70-71; dist/cookies/index.mjs:301,318,329 | bootstrap (`BETTER_AUTH_SECRETS` enables rotation) |
| `BETTER_AUTH_URL` (+ `NEXT_PUBLIC_BETTER_AUTH_URL`, `BASE_URL`, ...) | better-auth | dist/utils/url.mjs:71 | not set; `baseURL` is configured in code (auth/src/index.ts:120-128) |
| `AI_GATEWAY_API_KEY`, `VERCEL_OIDC_TOKEN` | @ai-sdk/gateway 4.0.110 | src/gateway-provider.ts:703-705, :715 | see #38 |
| `VERCEL_DEPLOYMENT_ID`, `VERCEL_ENV`, `VERCEL_REGION`, `VERCEL_PROJECT_ID` | @ai-sdk/gateway; @workflow/world-vercel 5.2.0 | gateway-provider.ts:426-438 | bootstrap (platform) |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`, `SENTRY_URL`, `SENTRY_RELEASE` | @sentry/bundler-plugin-core 5.3.0 | dist/cjs/index.js:5119-5132 | bootstrap (build) |
| `WORKFLOW_TARGET_WORLD`, `WORKFLOW_LOCAL_DATA_DIR`, `WORKFLOW_LOCAL_*`, ~20 `WORKFLOW_*` tuning flags, `VERCEL_TOKEN`, `VERCEL_OIDC_TOKEN` | Workflow DevKit 5.2 (`@workflow/next`, `core`, `world-local`, `world-vercel`) | grep of their `dist/` | bootstrap (platform); none set by the repo |
| `NODE_EXTRA_CA_CERTS` | Bun runtime | - | see #21 |
| `PORT`, `NEXT_RUNTIME`, `NEXT_TELEMETRY_DISABLED` | Next.js | - | bootstrap / CI |
| `VERCEL`, `VERCEL_ENV`, `VERCEL_TARGET_ENV`, `VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_BRANCH_URL`, `VERCEL_GIT_*` (22 in total) | declared optional by t3 `vercel()` preset | @t3-oss/env-nextjs 0.13.11 dist/presets-zod.js:14-44 | bootstrap (platform); `VERCEL` and `VERCEL_ENV` also in turbo.json:119-120 |

Already migrated (only comments remain): `DISCORD_APP_ID`, `DISCORD_BOT_TOKEN`
(packages/integration-discord/src/handlers/types.ts:55,
packages/integration-discord/src/sync/commands.ts:39-40).

### 1.4 CI, container and dev-tooling inputs

All **test/CI only** or **dev tooling only**; none affects a running instance.

| Where | Variables |
|---|---|
| .github/workflows/ci.yml | `CI`, `TURBO_TELEMETRY_DISABLED`, `NEXT_TELEMETRY_DISABLED` (:15-20); `FROM`, `TO` (:35-37, commitlint); runner `RUNNER_TEMP` (:69-70), `GITHUB_STEP_SUMMARY` (:111); writes a placeholder `.env` with `DATABASE_URL`, `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_DOMAIN`, `BETTER_AUTH_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (:154-162) |
| .github/workflows/e2e.yml | service `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB` (:25-28), `PG_CONNECTION_STRING` (:40-41); `CI`, `TURBO_TELEMETRY_DISABLED` (:44-46); same placeholder `.env` (:69-77) |
| .github/workflows/novnc-proxy.yml | `IMAGE` (:45-46), `CI`, `TURBO_TELEMETRY_DISABLED` (:61-63), `secrets.GITHUB_TOKEN` (:87, :147), `GH_TOKEN`, `TAG` (:146-148) |
| .github/actions/setup-bun/action.yml | Vercel remote cache via OIDC, team slug `bw-edv` hard-coded (:15-17) |
| docker-compose.yml | `NOVNC_PROXY_VERSION` (:7), `PORT` (:12), `NOVNC_PROXY_SECRET` (:14), `env_file: .env` (:15-16), `POSTGRES_*` (:24-27), `PG_CONNECTION_STRING` (:38-39), `SRH_MODE`/`SRH_TOKEN`/`SRH_CONNECTION_STRING` (:63-66) |
| apps/novnc-proxy/Dockerfile | `ENV PORT=8443` (:33) |
| tooling/proxmox-cluster | `CLUSTER_NAME`, `CEPH_NETWORK`, `OSD_SIZE` (bootstrap.sh:15-17), `PVE_PASSWORD` (bootstrap.sh:576, docker-compose.yml:25), `CEPH_RELEASE` (Dockerfile:17 ARG) |
| tooling/pve-patches | `BUILD_IMAGE` (build.sh:15), `PVE_BASE`, `PATCH_FILES`, `PATCH_FILE`, `SKIP_RESTART` (patch.sh:5,46-60,257) |
| scripts/setup.sh | writes `NOVNC_PROXY_SECRET` (:33-37) and `NODE_EXTRA_CA_CERTS` (:41-46) into `.env` |
| apps/web/scripts | `NODE_ENV` (run.ts:33-38, clean-dev-servers.ts:35), `CRON_SECRET` (dev/seed-proxmox-cluster.ts:147), `LD_LIBRARY_PATH`/`HF_HOME` set for child processes (video/lib/voice.ts:288,410) |
| bunfig.toml files | no environment variables (bunfig.toml, apps/web, packages/api, packages/ui, packages/utils, tooling/boundaries) |
| package.json scripts | every runtime script loads the root `.env` via `bun --bun --env-file ../../.env` (`with-env`, e.g. apps/web/package.json); tests load `../../.env.test` |

### 1.5 Hard cases

#### a. `NEXT_PUBLIC_*` values inlined into client bundles

| Value | Client readers | Can a server component pass it? |
|---|---|---|
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | elements-provider.tsx:31-33 (`loadStripe` at module scope) | **Yes.** Every mount point has a server ancestor: checkout `(public)/[locale]/checkout/[id]/page.tsx` -> `CheckoutForm` -> `ElementsProvider` (checkout-form.tsx:106); `account/settings/billing/page.tsx` -> `PaymentMethodsCard` (server) -> `AddPaymentMethod` (client, add-payment-method.tsx:250); `servers/[id]/plan/page.tsx` -> `ChangePlanCard` (client) -> `PlanPaymentStep` (plan-payment-step.tsx:47). Read the `stripe` integration's non-secret `publishableKey` in the server page, pass it down (or through a small context provider), and memoise `loadStripe(key)` inside the component. Under Cache Components the DB read makes that subtree dynamic: wrap in `Suspense` or `"use cache"` with a tag invalidated on integration save. |
| `NEXT_PUBLIC_STRIPE_ANONPAY_METHOD_ID` | elements-provider.tsx:98-104, stripe-payment-form.tsx:187-188 (via `ANONPAY_STRIPE_METHOD_ID`, integration-anonpay/src/constants.ts:26-27) | Yes, same props as above (plus `ANONPAY_MIN_AMOUNT`, constants.ts:21). |
| `NEXT_PUBLIC_SENTRY_DSN` | instrumentation-client.ts:63-79, feedback-button.tsx:54,89 | **No** for instrumentation (runs before React and before any props). Keep bootstrap. |
| `NEXT_PUBLIC_APP_NAME` (`APP_NAME`) | register/page-client.tsx:44, user-id-card.tsx:50, server-id-card.tsx:61, nav.tsx:61, colored-layout.tsx:69 | Yes for four: their parents are server components (register/page.tsx, account/settings/page.tsx, servers/[id]/advanced/page.tsx, (public)/[locale]/layout.tsx). `ColoredLayout` is also rendered by the client `unauthorized.tsx` (app.virtbase.com/[locale]/unauthorized.tsx), which Next mounts without props - that one needs a branding context provided by the root layout. Needed only because `branding.name` moves to the DB. |
| `NEXT_PUBLIC_APP_DOMAIN` + `NEXT_PUBLIC_VERCEL_ENV` (`PUBLIC_DOMAIN`, `APP_DOMAIN`, `ADMIN_DOMAIN`, hostname sets) | checkout-waivers.tsx:53,67,89; stripe-payment-form.tsx:210 (Stripe `return_url`); empty-servers.tsx:37; colored-layout.tsx:64; nav-user.tsx:131-152; add-payment-method.tsx:44; admin users-table/columns.tsx:310; lib/trpc/react.tsx:88; nav.tsx:71-93; packages/utils/src/functions/get-safe-redirect-url.ts:19-25 (via auth buttons, e.g. github-button.tsx) | Possible, but not worth it: the domain stays bootstrap. |
| `COOKIE_DOMAIN` (`VERCEL_URL`, not public) | i18n/routing.public.ts:27 -> next-intl client navigation | It is *wrong* in the browser today (finding 5). |

Note: apps/web/src/env.ts (and through `extends`, packages/auth/env.ts) is part
of the client bundle via apps/web/src/lib/trpc/react.tsx:36 - only names, not
values, but the server schema ships to browsers.

#### b. Values read in `proxy.ts` / middleware

- Hostname routing: `APP_HOSTNAMES`, `API_HOSTNAMES`, `ADMIN_HOSTNAMES`
  (apps/web/src/proxy.ts:18,54,58,62) <- `NEXT_PUBLIC_APP_DOMAIN`.
- Admin gate: `getCookieCache` with the implicit `BETTER_AUTH_SECRET`
  (apps/web/src/lib/middleware/admin.ts:49), a full better-auth instance
  (`readSession`, utils/read-session.ts:22-24 -> social provider env, DB), and
  `APP_DOMAIN` (admin.ts:57).
- Redirect allow-list: `getSafeRedirectUrl` (admin.ts:62, app.ts:52) <- hostname sets.
- Locale cookie: `COOKIE_DOMAIN` (apps/web/src/lib/middleware/ensure-locale-cookie.ts:41;
  next-intl middleware via apps/web/src/i18n/routing.public.ts:27).
- Missing-content 404s read the Fumadocs manifest, not configuration
  (proxy.ts:45-49).
All of these are bootstrap values; the proxy must not need a DB read for
routing. A DB-configured identity provider would reach the proxy through
`readSession` - another reason to defer #41-46.

#### c. Values read in `next.config.ts` or at build time

- `import "@/env"` validates the whole schema at build (next.config.ts:19).
- Sentry wiring: `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG/PROJECT/URL`, `CI`
  (next.config.ts:257-274); `SENTRY_AUTH_TOKEN` implicitly.
- Host-matched `headers()`, `redirects()`, `rewrites()` from `ADMIN_DOMAIN`,
  `APP_DOMAIN`, `PUBLIC_DOMAIN` (next.config.ts:21,105,147,176,187,198,201,212).
- CSP from `@/lib/csp` (next.config.ts:27,63): all four origins
  (csp/index.ts:89-91), `NODE_ENV` (:66,75), `NEXT_PUBLIC_SENTRY_CSP_REPORT_URI`
  (:123-125), vendor hosts hard-coded (Stripe, Sentry incl.
  `https://sentry.virtbase.com`, noVNC, avatars, Vercel Live).
- `allowedDevOrigins: ["*.virtbase.localhost"]` (next.config.ts:31).
- Every `NEXT_PUBLIC_*` value is inlined into client chunks at build; turbo
  hashes them (turbo.json:11-51) and the whole root `.env`
  (apps/web/turbo.json:13).
- Prerendered or cached metadata routes use env-derived values:
  apps/web/src/app/manifest.ts:21-25 (plain function, prerendered at build;
  `APP_NAME`), robots.ts:23-26,47 and sitemap.ts:56-59,73,80 (`"use cache"` +
  `cacheLife("max")`; `PUBLIC_DOMAIN`), and every `construct-metadata.ts`
  caller. A DB-backed `branding.name` therefore needs tag invalidation of these
  caches, and `manifest.ts` would have to become dynamic or cached.

#### d. Values read at module load by singletons

| Singleton | Values | Where |
|---|---|---|
| better-auth (`auth`) | `BETTER_AUTH_SECRET` (implicit), `DISCORD/GITHUB/GOOGLE_*`, `COOKIE_DOMAIN`, `APP_NAME`, hostname sets, `APP_DOMAIN`, `ADMIN_DOMAIN` | packages/auth/src/index.ts:61-353, plugins/index.ts:170-175; built at apps/web/src/lib/auth/server.ts:23 and read-session.ts:24 |
| Stripe client | `STRIPE_SECRET_KEY` | packages/integration-stripe/src/client.ts:27-33 |
| Resend client (`resend`) | `RESEND_API_KEY` | packages/email/src/resend/client.ts:48 |
| Upstash `redis` | `UPSTASH_REDIS_REST_*` | packages/api/src/upstash/redis.ts:21-24 |
| `integrationConfigStore`, `notificationTargetStore` | `CONFIG_ENCRYPTION_KEY` | packages/api/src/integrations/index.ts:74-79; packages/api/src/notifications/store.ts:29-34 |
| DB pool | `DATABASE_URL`, `NODE_ENV` | packages/db/src/client.ts:28-32,104 |
| `ANONPAY_STRIPE_METHOD_ID` | `NEXT_PUBLIC_STRIPE_ANONPAY_METHOD_ID` | packages/integration-anonpay/src/constants.ts:26-27 |
| `stripePromise` (client) | `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | elements-provider.tsx:31-33 |
| `@virtbase/utils` constants | `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_DOMAIN`, `NEXT_PUBLIC_VERCEL_ENV`, `VERCEL_URL` | packages/utils/src/constants/main.ts:18-89, cookies.ts:18-20 |
| CSP string | `NODE_ENV`, `NEXT_PUBLIC_SENTRY_CSP_REPORT_URI`, domains | apps/web/src/lib/csp/index.ts:46-70 (generator), :72-164 (policies), :166 (export) |
| Sentry | `NEXT_PUBLIC_SENTRY_DSN` | sentry.server.config.ts:21-27, sentry.edge.config.ts:21-27, instrumentation-client.ts:63-75 |
| novnc-proxy config | `NOVNC_PROXY_SECRET`, `PORT` | apps/novnc-proxy/src/index.ts:45 (process start) |

Each integration-bound singleton has to become a per-call resolution through the
registry (cached on the installation's version), the way the payment adapters
already work.

#### e. Values read inside Workflow DevKit steps

| Step | Value | Location |
|---|---|---|
| provision-server/apply-hardware-config (step at :44) | `NEXT_PUBLIC_VERCEL_ENV` -> VM tag | packages/api/src/workflows/provision-server/apply-hardware-config.ts:112-116 |
| shared/clone-guest (step at :40, **dead code**) | `NEXT_PUBLIC_VERCEL_ENV` -> VM name prefix | packages/api/src/workflows/shared/clone-guest.ts:48-53 |
| shared/create-guest-from-image (step at :57) | `NEXT_PUBLIC_VERCEL_ENV` -> VM name prefix | packages/api/src/workflows/shared/create-guest-from-image.ts:63-68 |
| create-invoice/generate-invoice (step at :53) | `NEXT_PUBLIC_VERCEL_ENV` -> Lexware `finalize` (C32); Stripe client (`STRIPE_SECRET_KEY`) at :55 | packages/api/src/workflows/create-invoice/generate-invoice.ts:55,203 |
| offboard-user/revoke-external-identities (step at :49) | `BETTER_AUTH_SECRET` | packages/api/src/workflows/offboard-user/revoke-external-identities.ts:72 |
| offboard-user/detach-external-services | Stripe client | packages/api/src/workflows/offboard-user/detach-external-services.ts:52-57 |
| any step that sends mail | `RESEND_API_KEY`/`SMTP_*` via `sendEmail` | packages/email/src/index.ts:74-96 |

Steps may do I/O, so DB-backed configuration is fine there as long as it is read
**inside the step** (never in the `"use workflow"` function, which is replayed
deterministically). A step retried after a configuration change sees the new
value - acceptable for credentials, worth stating for the VM naming prefix.

### 1.6 Where t3-env validates, and where it does not

- `apps/web/src/env.ts` declares 26 variables of its own (1 shared, 21 server, 4 client) (plus `authEnv()` and
  the `vercel()` preset), but application code reads only `CRON_SECRET`,
  `BETTER_AUTH_SECRET`, `NODE_ENV` and `VERCEL_URL` through `env.`
  (with-cron-secret.ts:26,33; proxmox/webhook/route.ts:38,46;
  create-proxmox-node.ts:252; sync-linked-account-metadata/route.ts:43;
  trpc/[trpc]/route.ts:42; lib/trpc/react.tsx:116,152). Everything else is read
  through `process.env` directly, so the schema is a boot-time check only.
- Not declared anywhere: `DATABASE_URL`, `CONFIG_ENCRYPTION_KEY`,
  `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_DOMAIN`, `NEXT_PUBLIC_VERCEL_ENV`,
  `ABUSE_MAILBOX_DOMAIN`, `ABUSE_MAILBOX_SECRET`, `SENTRY_AUTH_TOKEN`.
- `skipValidation` whenever `CI` is set (env.ts:104-105, auth/env.ts:37-38).
- A bootstrap allow-list for the planned CI gate (R5) follows directly from 1.1:
  rows 1-21 plus the test/CI rows, with `NOVNC_PROXY_SECRET` allowed only in
  `apps/novnc-proxy` and `AI_GATEWAY_API_KEY` only in `*/eval/*`.

---

## 2. Configuration-like constants

Constants are listed in three areas, each with the same columns (Item,
Location, Value shape, Readers with runtime context, Classification,
Justification). Each area also lists the items it deliberately left out, its
own shared settings and inconsistencies, and its totals. The consolidated view
is in section 3, including where the areas used different key names for the
same concept (3.3) and where their classifications conflicted (3.4).

Path conventions:

- **2.1** paths are relative to `packages/api/src/`; `auth/src/...` means
  `packages/auth/src/...`; anything starting with `packages/` or `apps/` is
  repository-relative.
- **2.2** paths are relative to `apps/web/` (`src/...`) or repository-relative
  when they start with `packages/`. `csp:` is `apps/web/src/lib/csp/index.ts`;
  MDX paths (`legal/*/notice.mdx`, `marketing/*/index.mdx`, ...) are under
  `packages/content/`. Bare file names resolve as follows:
  `default-json-ld.tsx`, `offers-json-ld.tsx` -> `apps/web/src/ui/seo/`;
  `footer.tsx`, `app-footer.tsx`, `nav.tsx`, `nav-user.tsx`, `app-sidebar.tsx`,
  `document.tsx`, `get-on-app-store.tsx` -> `apps/web/src/ui/` (the e-mail footer
  is always written as `packages/email/src/templates/footer.tsx`);
  `auth-layout.tsx`, `colored-layout.tsx` -> `apps/web/src/ui/layout/`;
  `stripe-payment-form.tsx`, `elements-provider.tsx`, `checkout-waivers.tsx`,
  `offer-card.tsx`, `offer-row.tsx`, `order-summary.tsx` ->
  `apps/web/src/features/checkout/components/`; `plan-summary.tsx`,
  `plan-order-dialog.tsx` -> `apps/web/src/features/servers/components/plan/`;
  `add-payment-method-form.tsx` -> `apps/web/src/features/account/components/billing/`;
  `delete-account-card.tsx` -> `apps/web/src/features/account/components/privacy/`;
  `two-factor-enable-dialog.tsx` -> `apps/web/src/features/account/components/authentication/`;
  `discord-bot-demo.tsx`, `operating-system-showcase.tsx` ->
  `apps/web/src/features/landing/components/`; `video.tsx` -> `apps/web/src/ui/fumadocs/`;
  `socials.ts` -> `apps/web/src/lib/`; `description.md` -> `apps/web/src/app/api/docs/`;
  `security.txt` -> `apps/web/public/.well-known/`; `logo.tsx`, `wordmark.tsx` ->
  `packages/ui/src/`; `manifest.ts`, `robots.ts`, `sitemap.ts`,
  `geofeed.csv/route.ts` -> `apps/web/src/app/`; `og/route.tsx` and the
  ServerHunter `route.ts` -> `apps/web/src/app/api/og/` and
  `apps/web/src/app/api/serverhunter-pullapi.json/`.
- **2.3** uses the prefix legend at its top (`utils/` = `packages/utils/src/`,
  `lex/` = `packages/integration-lexware/src/`, ...).

No secret, credential, personal address or phone number is reproduced; where
one exists in the code it is described (e.g. "VAT ID: `DE` + 9 digits").

### 2.1 `packages/api` and `packages/auth`

#### How to read this

- **Scope.** 146 config-like items are defined in scope. Another 19 constants are defined elsewhere but read here; they have their own table (S), which lists only the readers in scope.
- **Method.**
  - Sources: `AGENTS.md` and `packages/api/src/abuse/README.md` (the only README in scope).
  - Every non-test source file in scope was read, in full or by targeted scans.
  - Readers were found with `rg` on unique identifiers. Dead-code claims were checked with LSP `findReferences`.
  - Lines are 1-based. Test files, fixtures and `process.env` reads are excluded. A constant derived from an env var is flagged.
- **Context abbreviations.** Workflow functions are **wf** (`"use workflow"`) and Workflow DevKit steps are **step** (`"use step"`).
  - **tRPC** `x.y` is a procedure. **cron** `<name>` is `apps/web/src/app/api/cron/<name>/route.ts`. **webhook** is a route handler.
  - **admin action** is a `"use server"` action in `apps/web/src/features/admin/api/**`. **dev** is a CLI eval or dev script.
  - Nothing in scope runs on the client.
- **Async settings store.** Unmarked rows are read inside async server code (tRPC, route, cron, step), where an awaited store read is easy.
  - `[awkward: …]` marks call sites that are sync, evaluated at module load, inside `.meta()`, inside a zod schema, inside Better Auth's init-time options, or inside a `"use workflow"` body. A workflow body must stay deterministic, so values belong in a step.
- **Already database-backed (nothing to move).**
  - Storage names come from `proxmox_nodes.*Storage` (`trpc.ts:495-499`, `select-proxmox-node.ts:90-94`).
  - Bridge and VLAN come from subnets (`get-network-adapters.ts:54-55,72-73`).
  - Node group, placement strategy and capacity limits come from the database (`select-proxmox-node.ts:57-58,140-171`).
  - HA failover nodes come from the node group (`get-ha-failover-nodes.ts:65`).
  - Abuse rules (`abuse_rules`), cloud-init vendor snippets (`cloud-init/render-template-vendor-data.ts:63-110`) and plans and prices are already in the database.
  - No Proxmox pool names and no NTP configuration exist anywhere in scope.
- **Quotas that don't exist.** There is no per-customer server cap and no per-server backup cap. The only backup limit is the daily rate limit (G1).

---

#### A. Abuse desk (`abuse/**`)

| # | Item | Location | Value shape | Readers (context) | Classification | Justification |
|---|---|---|---|---|---|---|
| A1 | CASE_JOIN_WINDOW_HOURS | abuse/case.ts:54 | number 72 (h) | case.ts:356 `openOrJoinAbuseCase` ← intake.ts:241 `submitSignal`, reached from the Alertmanager webhook via the `signals` port (integration-alertmanager/src/webhook.ts:94) and from poll.ts:215 (cron poll-abuse-sources) | app setting: abuse.caseJoinWindowHours | Desk policy, and the code comment calls it a trade-off. |
| A2 | REPEAT_WINDOW_DAYS | case.ts:57 | number 90 (d) | case.ts:148 ← intake.ts:222 (webhook/cron); dry-run.ts:198 (admin action manage-abuse-rules.ts:131) | app setting: abuse.repeatWindowDays | Corroboration window that arms trusted third-party rules (README "inside 90 days"). |
| A3 | DEFAULT_RESPONSE_HOURS | case.ts:215 | number 24 (h) | case.ts:253 `awaitCustomerResponse` ← admin action manage-abuse-cases.ts:234, 310 | app setting: abuse.defaultResponseHours | Deadline the customer gets to answer. |
| A4 | No-rule fallbacks | case.ts:208, 209, 210, 421 | `?? true`, `?? 24` (h), `?? 0` (min) | `decideNewCase` (intake + dry-run); `openOrJoinAbuseCase` reopen path (421 sets a real deadline) | app setting: abuse.defaultResponseHours (same key as A3) | Lines 209 and 421 restate A3 and the DB default; 208 and 210 only apply when no rule matched. |
| A5 | THROTTLE_RATE_MBPS | abuse/lock.ts:31 | number 1 (MB/s, Proxmox `rate=`) | lock.ts:218 `applyServerLock` ← enforce.ts:228 (cron reconcile-abuse-cases; admin action manage-abuse-cases.ts:252); enforce.ts:578 (cron reconcile-abuse-locks) | app setting: abuse.throttleRateMbps | How hard the throttle level bites; depends on the network. |
| A6 | TIGHTER escalation ladder | abuse/reconcile.ts:46 | object, 5 keys, tops out at `power_off` | reconcile.ts:135 (cron reconcile-abuse-cases) | keep: safety invariant | README: no clock ever reaches `terminate`. |
| A7 | MAX_TARGETS_PER_RUN | abuse/poll.ts:40 | number 25 | poll.ts:88 (default) ← poll.ts:188 (cron poll-abuse-sources) | keep: bounds one cron run | The provider quota is the integration's `callsPerRun`. |
| A8 | DEFAULT_BLOCK_PREFIX | poll.ts:43 | number 24 (CIDR prefix) | poll.ts:87, 111 ← poll.ts:188, which passes no prefix (cron) | integration setting: abuseipdb.blockPrefixLength | That setting already exists (integration-abuseipdb/src/config.ts:33) and is shown in admin, but nothing reads it (source.ts:80 reads only `callsPerRun`). This constant decides. |
| A9 | CALLS_PER_TARGET_ALLOWANCE | poll.ts:54 | number 2 | poll.ts:208 (cron) | keep: work ceiling | Documented as not a quota. |
| A10 | INITIAL_WATERMARK_DAYS | poll.ts:57 | number 30 (d) | poll.ts:201 (cron) | keep: first-run cursor | Generic to any pull source. Overlaps abuseipdb `maxAgeInDays` (default 30). |
| A11 | DRY_RUN_SIGNAL_LIMIT / DRY_RUN_SAMPLE_LIMIT | abuse/dry-run.ts:36, 39 | numbers 500 / 25 | dry-run.ts:126-127 ← admin action manage-abuse-rules.ts:131 | keep: editor responsiveness | README documents the 500. |
| A12 | MAX_ABUSE_TITLE_LENGTH / MAX_ABUSE_BODY_LENGTH | abuse/sanitize.ts:18, 19 | 500 / 50_000 (chars) | sanitize.ts:73, 77 ← intake.ts:100-101 (webhook/cron); mailbox/receive.ts:265-266 (Resend webhook) | keep: input sanitisation | Bounds untrusted text. |
| A13 | MAX_ABUSE_REPORTER_LENGTH | sanitize.ts:20 | number 320 | none (LSP: declaration only) | remove: dead | Never referenced, not even in tests. |
| A14 | Inline sanitise caps | intake.ts:131, 135; receive.ts:224, 414 | 200 / 500 (chars) | `submitSignal` (webhook/cron); mailbox (Resend webhook) | keep: input sanitisation | receive.ts:414 restates A12's 500 inline. |
| A15 | ABUSE_MAILBOX_LOCAL | mailbox/address.ts:21 | string "abuse" | address.ts:66, 84, 111, 116 ← ensureCaseMailbox (intake.ts:287, send.ts:161), receive.ts:151, 256 (Resend webhook), send.ts:169 | integration setting: abuse-mailbox.localPart | Mailbox identity. Changing it stops tags already stored in `abuse_cases.mailbox_address` from parsing. [awkward: sync helpers] |
| A16 | `abuseMailboxDomain()` last-resort fallback | address.ts:29-32 | string "virtbase.com" after env `ABUSE_MAILBOX_DOMAIN` → `NEXT_PUBLIC_APP_DOMAIN` | address.ts:66, 111 (same callers as A15) | integration setting: abuse-mailbox.domain | Env-derived, with the brand domain as the final fallback. send.ts:52-55 builds "our domains" from the same env vars. [awkward: sync] |
| A17 | TAG_LENGTH | address.ts:45 | number 6 (hex chars) | address.ts:51 | keep: wire format | Changing it invalidates every address already minted. |
| A18 | Case reference prefix | case.ts:543; address.ts:121, 125 | "AB-" plus regex | email subjects, both consoles, `parseSubjectToken` (Resend webhook) | keep: wire format | Reply routing depends on it. Three copies. |
| A19 | NEW_CASE_WINDOW_SECONDS | receive.ts:88 | number 3600 (s, Redis `once()` TTL) | receive.ts:295 (Resend webhook) | app setting: abuse.mailbox.newCasePerSenderSeconds | Flood control on the public inbox. |
| A20 | Defaults for cases opened from email | receive.ts:433-434 | "other" / "medium" | `openCaseFromEmail` (Resend webhook) | app setting: abuse.mailbox.defaultSeverity (category stays code) | Sets the queue position of an unattributed report. |
| A21 | ABUSE_DESK_NAME | mailbox/send.ts:40 | string "Virtbase Abuse Desk" | send.ts:215 (From name) ← receive.ts:280, 301 (Resend webhook); admin actions manage-abuse-cases.ts:191, 403 | app setting: abuse.deskName (default "{branding.name} Abuse Desk") | Brand literal on mail to third parties. |
| A22 | Reporter canned replies | send.ts:296-300, 314-318 | 2 English multi-line strings | `acknowledgeReporters` (Resend webhook); `notifyReportersResolved` (admin action manage-abuse-cases.ts:403) | app setting: abuse.reporterAcknowledgementText / abuse.reporterResolvedText | Operator-owned outbound copy, English only. |
| A23 | NOTIFICATION_SEVERITY map | intake.ts:65 | object, 4 keys | intake.ts:290 | keep: internal mapping | Notification targets already filter by minimum severity. |
| A24 | Cron batch limits | reconcile.ts:72; enforce.ts:496 | 100 / 200 | cron reconcile-abuse-cases / reconcile-abuse-locks | keep: bounds function duration | Not business configuration. |

#### B. AI (triage, firewall rule generation)

| # | Item | Location | Value shape | Readers (context) | Classification | Justification |
|---|---|---|---|---|---|---|
| B1 | ABUSE_TRIAGE_MODEL | abuse/triage/model.ts:19 | string "anthropic/claude-haiku-4.5" | triage/classify.ts:90 ← `sweepUntriagedCases` (cron triage-abuse-reports); triage/eval/run.ts:47 (dev) | app setting: ai.abuseTriage.model | Model choice. The gateway key belongs in a proposed integration `ai-gateway`. |
| B2 | TRIAGE_TIMEOUT_MS | model.ts:22 | 20_000 ms | classify.ts:100; eval/run.ts:72 | app setting: ai.abuseTriage.timeoutMs | |
| B3 | MAX_TRIAGE_BODY_CHARS | model.ts:31 | 8_000 chars | triage/apply.ts:106 (cron) | app setting: ai.abuseTriage.maxInputChars | Spend control. |
| B4 | TRIAGE_BATCH_SIZE | model.ts:34 | 10 | apply.ts:322 (cron) | app setting: ai.abuseTriage.batchSize | The code comment calls the spend per run "a number somebody chose". |
| B5 | FIREWALL_AI_MODEL | router/servers/firewall/generation.ts:23 | string "anthropic/claude-haiku-4.5" | firewall/rules.ts:282 (tRPC servers.firewall.rules.generate); firewall-ai/eval/run.ts:50 (dev) | app setting: ai.firewallGeneration.model | Same literal as B1. |
| B6 | GENERATION_TIMEOUT_MS | generation.ts:28 | 25_000 ms | rules.ts:293; firewall-ai/eval/run.ts:109 | app setting: ai.firewallGeneration.timeoutMs | |
| B7 | Firewall-AI quota | firewall/rules.ts:232-235 | 10 requests / "1 d" per user | tRPC servers.firewall.rules.generate | app setting: ai.firewallGeneration.perUserDailyLimit | Cost cap. [awkward: declared in `.meta()` at module load; resolve in the async rate-limit middleware, trpc.ts:174] |
| B8 | AI retry counts | classify.ts:99 (1); rules.ts:292 (2) | numbers | cron / tRPC | keep | Already bounded by B2 / B6. |

#### C. Notifications

| # | Item | Location | Value shape | Readers (context) | Classification | Justification |
|---|---|---|---|---|---|---|
| C1 | SEND_TIMEOUT_MS | notifications/deliver.ts:38 | 10_000 ms | deliver.ts:63-64 ← dispatch.ts:274 (every `dispatchNotification`: tRPC, webhooks, crons, admin actions); retry.ts:63 (cron retry-notifications) | app setting: notifications.sendTimeoutMs | Third-party channel latency. |
| C2 | MAX_DELIVERY_ATTEMPTS | deliver.ts:41 | 5 | deliver.ts:139; retry.ts:50 (cron) | app setting: notifications.retry.maxAttempts | Must equal `len(C3) + 1`. |
| C3 | BACKOFF_MINUTES | deliver.ts:44 | [5, 15, 60, 360] (min) | deliver.ts:47 | app setting: notifications.retry.backoffMinutes | Prefer one setting from which C2 is derived. |
| C4 | Retry BATCH_SIZE | notifications/retry.ts:24 | 100 | retry.ts:54 (cron) | keep: bounds function duration | |
| C5 | Email target placeholder | notifications/channels/email.ts:65 | "abuse@virtbase.com" | admin notification-target form (field descriptor) | keep: placeholder only | Not configuration, but swap the brand address for a neutral example. |
| C6 | Test-notification text | notifications/text.ts:203 | string containing "Virtbase" | `renderNotification("notifications.test")` ← admin action manage-notification-targets.ts:170 | app setting: branding.name | [awkward: sync renderer; pass the name in params] |
| C7 | Email sender keys | channels/email.ts:109, 142, 144 | "primary"; replyTo "noreply" | `EmailNotificationChannel.send` | keep | These are keys into the `@virtbase/email` sender map. |

#### D. Billing, pricing, orders, subscriptions, invoices

| # | Item | Location | Value shape | Readers (context) | Classification | Justification |
|---|---|---|---|---|---|---|
| D1 | Currency literal | router/checkout.ts:444 ("eur", Stripe PaymentIntent), 571 (Anonpay minimum guard); orders/create-order.ts:65; orders/apply-payment-event.ts:127 (fallback); subscriptions/create-subscription.ts:81 (default); workflows/create-invoice/generate-invoice.ts:198; privacy/export/document.ts:266 (default, used for invoices at 384-385) | "EUR", 7 sites | tRPC checkout.order / customCheckout; Stripe and Anonpay webhooks (applyPaymentEvent); step createServerSubscriptionStep; step generateInvoiceStep; export step | app setting: billing.currency | One concept in 7 places, plus DB defaults. [awkward: document.ts `money()` is sync] |
| D2 | MIN_CHARGE_EUR_CENTS | lib/pricing.ts:43 | 50 (cents) | pricing.ts:101 (default) ← checkout.ts:301 (tRPC checkout.order), router/servers/plan.ts:128 (tRPC servers.plan) | keep: Stripe-dictated | Must become a per-currency lookup once D1 is a setting. |
| D3 | MONTH_MS | pricing.ts:34 | 30 d in ms | pricing.ts:108 (same readers as D2) | keep: proration convention | Documented 30-day convention. |
| D4 | Billing term "1 month" | workflows/provision-server/store-provisioned-server.ts:88; workflows/extend-server/store-server-extension.ts:206, 412; subscriptions/create-subscription.ts:80; backfill/subscriptions.ts:67 | SQL `INTERVAL '1 month'` ×3, number 1 ×2 | steps storeProvisionedServerStep, storeServerExtensionStep (and its rollback), createServerSubscriptionStep; one-off backfill script | app setting: billing.termMonths | Term length in 5 places. [awkward: SQL literal; needs `make_interval(months => n)`] |
| D5 | EU_VAT_RATES | lib/invoicing.ts:23 | object, 26 ISO-3166 codes → % | generate-invoice.ts:90 (step); orders/record-billing-details.ts:53 ← fulfill-order.ts:88 (Stripe/Anonpay webhooks, reconcile crons) and checkout.ts:593 (tRPC customCheckout) | app setting: billing.taxRates | Rates change ("Last updated: 2026-04-14"). The keys double as the list of countries we sell to. Greece is missing. [awkward: type `InvoiceCountry` at invoicing.ts:52 derives from it] |
| D6 | COUNTRY_LOCALE and fallback | invoicing.ts:57-61, 72 | object, 3 keys; "en" | generate-invoice.ts:147 (step) | app setting: billing.invoiceLocaleByCountry (+ app.defaultLocale) | The code comment calls it a customer-facing decision. |
| D7 | upgradeLineItemNames | invoicing.ts:78 | object, 4 locales | generate-invoice.ts:150 | keep: translations | |
| D8 | Invoice line description | generate-invoice.ts:188-196 | template: "vCore(s)", "RAM", "NVMe SSD", "Uplink", "1x IPv4 /32 + 1x IPv6 /64" | step generateInvoiceStep | app setting: billing.invoiceLineTemplate | Product claims hard-coded (TODO "Translate / more dynamic"). Restates E5. |
| D9 | Anonpay widget colours | checkout.ts:616-618 | "0a0a0aff", "ffffff", "000000" | tRPC checkout.customCheckout | integration setting: anonpay.theme | Brand palette on a hosted page. |
| D10 | Anonpay widget flags | checkout.ts:610-615 | direct false, donation false, remove_direct_pay true, simple_mode true | same | keep: flow semantics | |
| D11 | Stripe customer-session features | checkout.ts:421-433 | object (redisplay/save/remove enabled, save_usage `off_session`) | tRPC checkout.order | keep | Required for off-session renewals. |
| D12 | Default SSH key name | checkout.ts:342 | "SSH Key" | tRPC checkout.order | keep: UI copy | |
| D13 | Renewal charge description | billing/collect.ts:73, 285 | "Subscription renewal", `${name} renewal` | ← renew-subscription.ts (crons renew-subscriptions / retry-renewals; tRPC subscriptions.retryNow) | keep: copy | |
| D14 | RENEWAL_TRANSPORT_BACKOFF_MINUTES | billing/record-outcome.ts:63 | 15 min | record-outcome.ts:631 ← renew-subscription.ts:254 (crons; tRPC retryNow) | keep: operational | Comment: "operational limit rather than a business decision". |
| D15 | RENEWAL_TRANSPORT_ESCALATION_HOURS | record-outcome.ts:102 | 12 h | record-outcome.ts:679 | keep: operational | Separates a provider outage from a misconfiguration. |
| D16 | DEAD_CREDENTIAL_CODES | record-outcome.ts:120 | Set of 10 Stripe decline codes | record-outcome.ts:408 | keep: provider semantics | |
| D17 | RENEWAL_COLLECTION_GRACE_MINUTES | billing/reconcile-renewals.ts:57 | 10 min | reconcile-renewals.ts:312 (cron reconcile-renewals) | keep: operational | |
| D18 | RENEWAL_IN_FLIGHT_RECHECK_HOURS | reconcile-renewals.ts:92 | 6 h | reconcile-renewals.ts:361 (cron, in `sql.raw`) | keep: operational | |
| D19 | ORDER_FULFILMENT_GRACE_MINUTES | orders/reconcile-orders.ts:47 | 10 min | reconcile-orders.ts:166 (cron reconcile-orders) | keep: operational | The comment says it belongs in utils `limits.ts`. |
| D20 | Sweep batch sizes | billing/due-renewals.ts:37, 40; reconcile-renewals.ts:66; reconcile-orders.ts:53 | 50, 50, 100, 100 | crons renew-subscriptions, retry-renewals, reconcile-renewals, reconcile-orders | keep: bounds function timeout | |
| D21 | RENEWAL_LADDER_RUNGS / RENEWAL_LADDER_EXHAUSTED_AFTER_DAYS | billing/retry-schedule.ts:33, 59 | derived from S13 (length 4, max 7) | dunning-mail.ts:122, 154; retry-schedule.ts:121 | keep: derived | [awkward: computed at module load from a value that becomes `billing.dunning.retryScheduleDays`] |
| D22 | SAVED_CREDENTIAL_PROVIDER_ID | payment-methods/provider.ts:29 | "stripe" | router/payment-methods.ts:146, 160 (tRPC paymentMethods.createSetupSession) | keep | Stripe is the only provider with `createSetupSession`. Duplicated at backfill/payment-methods.ts:77. |
| D23 | SETUP_RETURN_URL | router/payment-methods.ts:50 | `${APP_DOMAIN}/account/settings` | payment-methods.ts:152 | keep: derived route | Derived from APP_DOMAIN at module load. |

#### E. Provisioning and Proxmox defaults

| # | Item | Location | Value shape | Readers (context) | Classification | Justification |
|---|---|---|---|---|---|---|
| E1 | DEFAULT_IPV4_DNS_SERVERS | proxmox/generate-cloud-init-network-config.ts:25 | array of 2 IPv4 (Quad9) | :59 ← workflows/shared/apply-cloud-init.ts:74 (step; provisioning only, since change-template omits adapters) | app setting: provisioning.dnsResolvers.ipv4 | Deployment choice. [awkward: sync generator; pass the value in] |
| E2 | DEFAULT_IPV6_DNS_SERVERS | :26 | array of 2 IPv6 (Quad9) | :62 (same) | app setting: provisioning.dnsResolvers.ipv6 | Same as E1. |
| E3 | DNS search domain | :83 | "localdomain" | same | app setting: provisioning.dnsSearchDomain | Same as E1. |
| E4 | MAC OUI prefix | proxmox/generate-random-mac-address.ts:20 | "BC:24:11" (Proxmox OUI) | workflows/shared/get-network-adapters.ts:71, 87, 95 (step) | app setting: provisioning.macPrefix | Low priority. [awkward: sync] |
| E5 | Per-server allocation prefix | get-network-adapters.ts:44, 45 | 32 (IPv4) / 64 (IPv6) | step getNetworkAdaptersStep ← provision-server/index.ts:91 | app setting: provisioning.allocationPrefix.{ipv4,ipv6} | Product shape. Restated in D8. |
| E6 | VM naming | workflows/shared/create-guest-from-image.ts:63-68 | "vb{id}" / "vb-staging{id}" / "vb-dev{id}" (derived from env `NEXT_PUBLIC_VERCEL_ENV`) | step createGuestFromImageStep ← provision-server/index.ts:103 (change-template passes its own name at :158) | app setting: provisioning.vmNamePrefix | Brand abbreviation; suffix comes from env. |
| E7 | Disk and controller options | create-guest-from-image.ts:80-83 | "virtio-scsi-single"; "discard=on,iothread=1,ssd=1,cache=writeback"; ide2 cloudinit; boot order | same steps | app setting: provisioning.diskOptions | Cache mode and ssd emulation depend on the storage backend. |
| E8 | Guest hardware defaults | provision-server/apply-hardware-config.ts:90-108 | object: kvm, cpu "cputype=host", tablet false, rng0, vga "std", machine "q35", onboot true, agent "enabled=1,fstrim_cloned_disks=1", ostype "l26", freeze false, hotplug "0" | step applyHardwareConfigStep ← provision-server/index.ts:151 | app setting: provisioning.guestDefaults | CPU model affects migration. Overrides template metadata (see list 2, item 4). |
| E9 | Hookscript reference | apply-hardware-config.ts:109 | "&lt;snippetStorage&gt;:snippets/hookscript.pl" | same step | keep | Must match the file admin node setup uploads. Duplicate of apps/web/src/features/admin/lib/proxmox-nodes/hookscript.ts:23; move to a shared lower-layer constant. |
| E10 | VM tags | apply-hardware-config.ts:110-118 | "virtbase" plus env name | same step | app setting: provisioning.vmTags | Brand literal. |
| E11 | Cloud-init user | apply-hardware-config.ts:120 | "root" | same step; restated at provision-server/send-server-ready-email.ts:77 (step) | app setting: provisioning.cloudInitUser | The two sites must agree. |
| E12 | ciupgrade | apply-hardware-config.ts:122 | true | same step | app setting: provisioning.upgradeOnFirstBoot | Operator choice; slows first boot. |
| E13 | Generated root password length | apply-hardware-config.ts:86 | `generatePassword(12)` | same step | app setting: provisioning.generatedPasswordLength | Credential policy. |
| E14 | Default guest firewall | provision-server/apply-network-config.ts:66-72 | enable true; policy_in/out "ACCEPT"; log levels "nolog" | step applyNetworkConfigStep ← provision-server/index.ts:195 | app setting: servers.firewall.defaults | Business default. The anti-spoofing flags at :74-82 stay code. |
| E15 | NIC string | proxmox/get-network-adapter-config.ts:29 | "model=virtio,…,firewall=1" | apply-network-config.ts:55 (step) | keep | `firewall=1` is required for the IP filter. |
| E16 | HA resource policy | workflows/shared/update-ha-settings.ts:53-55 | max_relocate 1, max_restart 1, state "started" | step updateHASettingsStep ← provision-server/index.ts:317 | app setting: provisioning.ha.{maxRelocate,maxRestart} | Cluster policy. |
| E17 | HA rule shape | update-ha-settings.ts:71, 75 | priority 0 per node; strict 1 | same | app setting: provisioning.ha.strict | |
| E18 | MAX_HA_FAILOVER_NODES | workflows/shared/get-ha-failover-nodes.ts:28 | 5 | :70 (step) ← provision-server/index.ts:312 | app setting: provisioning.ha.maxFailoverNodes | |
| E19 | HA always on | provision-server/index.ts:309-328 | implicitly true | wf | app setting: provisioning.ha.enabled | [awkward: decided in a workflow body; read it in a step] |
| E20 | Power-action timeout | proxmox/perform-power-action.ts:41, 46, 67, 72 | 30 s, 4 sites | workflows/shared/perform-guest-action.ts:74 (steps in 6 workflows); router/servers/status.ts:199 (tRPC servers.status.update) | app setting: servers.powerActionTimeoutSeconds | Depends on the guest OS. |
| E21 | Task-wait retry policy | workflows/shared/wait-for-proxmox-task.ts:121, 112, 90 | maxRetries 10; `min(attempt², 60)` s; 2 s | every workflow | keep: Workflow DevKit semantics | [awkward: static property set at module load] About 5 minutes in total, which may be short for large restores. |
| E22 | Other step backoffs | workflows/shared/get-template.ts:122; provision-server/select-proxmox-node.ts:340 | `min(a²·30 s, 10 min)`; `min(a·60 min, 60 min)` | steps | keep | The select-proxmox-node formula contradicts its own comment at :339 (it is always 60 min). |
| E23 | Workflow sleeps | provision-server/index.ts:111; change-template/index.ts:127, 162, 232; restore-server-backup/index.ts:115, 160, 241; upgrade-server/index.ts:127; extend-server/index.ts:121; shared/delete-one-server.ts:59, 73 | "3s" / "5s" / "30s" | wf | keep: deterministic workflow code | |
| E24 | FAILED_RETRY_AFTER_MINUTES | template-images/ensure-template-image.ts:317 | 30 min | :320 ← workflows/shared/get-template.ts:97 (step), template-images/refresh-template-images.ts:143 (cron refresh-template-images), admin action download-template-image.ts:86 | keep: operational | |
| E25 | clone-guest defaults | workflows/shared/clone-guest.ts:48-53, 56 | "vb…" naming; bwlimit 0 | none: `cloneGuestStep` (:34) and `rollbackCloneGuestStep` (:69) each have one reference, their declaration (LSP), and are not re-exported by workflows/index.ts | remove: dead | Superseded by createGuestFromImageStep. |

#### F. Server runtime (console, guest agent, guest OS, guest firewall, ISO, API surface)

| # | Item | Location | Value shape | Readers (context) | Classification | Justification |
|---|---|---|---|---|---|---|
| F1 | noVNC client URL | router/servers/console.ts:107 | "https://novnc.com/noVNC/vnc.html" | tRPC servers.console.get | integration setting: novnc.clientUrl (new) | Third-party-hosted client. Duplicated in the CSP and the OpenAPI example (list 2). |
| F2 | noVNC proxy port | console.ts:109 | "443" | same | integration setting: novnc.proxyPort | Depends on the proxy deployment (its URL is env). |
| F3 | noVNC UI parameters | console.ts:112-114 | encrypt, resize "scale", autoconnect | same | keep | |
| F4 | CONSOLE_PAYLOAD_TTL_SECONDS | console.ts:39 | 300 s | console.ts:100 | keep | Coupled to the client refetch interval (comment). |
| F5 | DETECTION_GUARD_SECONDS | guest-os/refresh.ts:41 | 60 s (Redis `once()` TTL) | refresh.ts:182 ← router/servers/status.ts:105 (tRPC servers.status.get); cron detect-guest-os route.ts:131 | app setting: servers.guestOs.probeIntervalSeconds | Documented detection and retry cadence. |
| F6 | DETECTION_MAX_AGE_HOURS | refresh.ts:49 | 24 h | refresh.ts:104 `isDetectionStale` ← status.ts:99 (tRPC); cron detect-guest-os route.ts:127; apps/web/scripts/dev/verify-guest-os.ts (dev) | app setting: servers.guestOs.maxAgeHours | [awkward: sync function; pass the value in] |
| F7 | Guest-inspection cache TTL | guest-firewall/inspect.ts:41 | 90 s | inspect.ts:96 ← router/servers/firewall/analysis.ts:63, guest.ts:49, rules.ts:259 (tRPC) | keep | Protects customer VMs from tab polling. |
| F8 | Agent-status cache TTL | router/servers/agent.ts:44 | 60 s | agent.ts:88 (tRPC servers.agent.get) | keep | |
| F9 | Guest exec budget | proxmox/agent/exec.ts:27, 33 | 6_000 ms / 400 ms | exec.ts:91-92 ← guest-firewall/detect.ts:123, read-rules.ts:68, read-sockets.ts:40 (tRPC via inspectGuest) | keep | Bounds three fixed internal probe scripts. |
| F10 | HA_FOLLOW_UP_GRACE_SECONDS | proxmox/get-last-task.ts:30 | 30 s | :76 (tRPC servers.status.get) | keep | Tracks Proxmox CRM/LRM timing. |
| F11 | ISO upload quota | router/iso/index.ts:219-221 | 10 / "1 h" | tRPC iso.upload | app setting: servers.iso.uploadsPerHour | [awkward: in `.meta()`] |
| F12 | API key header | trpc.ts:77 | "x-virtbase-api-key" | `createTRPCContext` (all tRPC/OpenAPI) | keep: public API contract | Brand in a wire name; renaming breaks clients. |
| F13 | OpenAPI descriptions | router/servers/firewall/analysis.ts:46; guest.ts:37 | strings mentioning "Virtbase firewall" | OpenAPI generation | keep: documentation copy | Static at module load. |

#### G. Backups

| # | Item | Location | Value shape | Readers (context) | Classification | Justification |
|---|---|---|---|---|---|---|
| G1 | Backup create quota | router/servers/backups/index.ts:287-289 | 5 / "1 d" per user | tRPC servers.backups.create | app setting: backups.maxCreatesPerDay | The only backup quota. [awkward: in `.meta()`] |
| G2 | Backup restore quota | index.ts:676-678 | 5 / "1 d" per user | tRPC servers.backups.restore | app setting: backups.maxRestoresPerDay | [awkward: in `.meta()`] |
| G3 | vzdump tuning | index.ts:337, 339, 342, 344 | bwlimit 10·120·1024 KiB/s; ionice 7; compress "zstd"; lockwait 180 min | tRPC create | app setting: backups.vzdump.* | Depends on storage and network. |
| G4 | Notes template | index.ts:349 | "Created by Virtbase system - …" | tRPC create | app setting: branding.name | Brand literal, visible in Proxmox. |
| G5 | Restore bandwidth | workflows/restore-server-backup/restore-backup.ts:58 | bwlimit 0 (unlimited) | step restoreBackupStep | app setting: backups.restoreBwlimitKibps | Pairs with G3. |
| G6 | Active-task probe | index.ts:729 | limit 5, source "active" | tRPC restore | keep | |
| G7 | Purge note | workflows/delete-server/purge-all-backups.ts:61 | "Safe to delete - …" | step | keep | |

#### H. Privacy, data export, offboarding

| # | Item | Location | Value shape | Readers (context) | Classification | Justification |
|---|---|---|---|---|---|---|
| H1 | Export JSON attachment description | privacy/export/document.ts:176 | "Every record Virtbase holds about you…" | export step (buildExportArtifactStep) | app setting: branding.name | Literal brand string. |
| H2 | Logo vector paths | privacy/export/brand.ts:29, 36 (sizes at :31-34, 40-43) | SVG path strings (mark and wordmark) | document.ts:155-156, 216-217 (export step) | app setting: branding.logo | [awkward: the PDF needs raw path data and dimensions, not an image URL] |
| H3 | COLOR_SECONDARY | brand.ts:45 | "#f0f0f0" | document.ts:572 | app setting: branding.colors.secondary | |
| H4 | COLOR_BACKGROUND | brand.ts:46 | "#ffffff" | none (LSP: declaration only) | remove: dead | |
| H5 | WORDMARK_ALT | brand.ts:108 | `${APP_NAME} Logo` | document.ts:216 | app setting: branding.name | [awkward: derived at module load] |
| H6 | Watermark styling | brand.ts:62-63, 91 | opacity 0.02, "#000" | export step | keep: layout | |
| H7 | Embedded fonts | privacy/export/fonts.generated.ts:21, 24 | gzip + base64 Arial / Arial Black | document.ts:47-52 | keep | PDF/A requires embedded fonts. |
| H8 | Export timezone | document.ts:254 | "UTC" | export step | keep: deliberate (comment) | |
| H9 | DOCUMENT_LOCALES and fallback | privacy/export/messages.ts:29, 313 | ["en","de","fr","nl"]; "en" | export step | keep: translation catalogue | The fallback could follow app.defaultLocale. |
| H10 | Tombstone identity | workflows/offboard-user/anonymize-user.ts:66, 141 | "deleted+{id}@invalid", "Deleted user" | step | keep | |
| H11 | REVOCATION_ENDPOINTS | workflows/offboard-user/revoke-external-identities.ts:24-28 | object, 3 URLs | step revokeExternalIdentitiesStep | keep: provider protocol | See the note under exclusions. |

#### I. tRPC core: rate limiting, caching, internal sessions

| # | Item | Location | Value shape | Readers (context) | Classification | Justification |
|---|---|---|---|---|---|---|
| I1 | Default rate limit | upstash/ratelimit.ts:23, 29 | 120 requests / "1 m" sliding window | trpc.ts:202 (every procedure without its own meta) | app setting: security.rateLimit.default | The middleware is async, so this is easy. |
| I2 | Per-procedure anti-abuse limits | router/auth.ts:28-30 (8/1m); public.ts:35-39 (10/1m); step-up.ts:95-97 (5/5m); invoices.ts:111-113 (4/1m); payment-methods.ts:133-135, 199-201 (8/1m); checkout.ts:70-72, 513-515 (8/1m); subscriptions.ts:447-449, 537-539, 830-832 (20/1m), 733-739 (30/1m), 913-915 (3/1h); servers/actions/index.ts:56-58 (2/60s), 130-132 (3/60s); servers/status.ts:171-173 (5/60s); servers/rdns.ts:266-268 (10/1h); privacy.ts:59-61, 207-209 (3/1h) | 19 {requests, window} pairs | the tRPC procedures named | app setting: security.rateLimits (map keyed by procedure path) | Optional overrides. Business quotas are split out as B7, F11, G1, G2. [awkward: in `.meta()`; resolve in the middleware] |
| I3 | Upstash timeout | ratelimit.ts:36 | 1000 ms | all procedures | keep | |
| I4 | Redis key prefixes | ratelimit.ts:35; upstash/cache.ts:22; step-up/marker.ts:23, 36 | "vb", "vb:cache:", "vb:stepup:", "vb:stepup-spent:" | all Redis users | keep: key namespaces | Changing them orphans live keys. |
| I5 | Client-IP header trust | upstash/default-fingerprint.ts:29, 34 | trusts `x-real-ip`, then `x-forwarded-for` | trpc.ts:194 | keep | Tied to Vercel. Self-hosting would need an app.trustedProxyHeader. |
| I6 | Synthetic port session | integrations/server-management.ts:121 | 30 d expiry | `callerFor` (Discord bot via the serverManagement port) | keep | In-memory only, never persisted. |

#### J. Auth (`packages/auth`)

All rows below are built into Better Auth options by `initAuth()`. That runs at module load in apps/web/src/lib/auth/server.ts:23 and lazily in the proxy at apps/web/src/lib/middleware/utils/read-session.ts:24. **[awkward for every row: options are fixed at init, so settings need an async/lazy factory or a re-init when they change]**

| # | Item | Location | Value shape | Readers (context) | Classification | Justification |
|---|---|---|---|---|---|---|
| J1 | Session lifetime | auth/src/index.ts:289 | 259_200 s (3 d) | Better Auth | app setting: security.session.expiresInSeconds | |
| J2 | Session cookie cache | index.ts:292 | 300 s | Better Auth | app setting: security.session.cookieCacheSeconds | Also governs how stale a role or ban can be in the proxy. |
| J3 | freshAge | index.ts:296 | 0 | Better Auth | keep | Replaced by step-up. |
| J4 | Password reset token TTL | index.ts:188 | 600 s | Better Auth | app setting: security.passwordResetTtlSeconds | |
| J5 | Email verification TTL | index.ts:246 | 600 s | Better Auth | app setting: security.emailVerificationTtlSeconds | |
| J6 | Email-and-password sign-in | index.ts:181-182 | enabled true; requireEmailVerification true | Better Auth | app setting: accounts.emailPassword.{enabled,requireVerification} | |
| J7 | Password length | auth/src/password-policy.ts:63-64 | 8 / 64 | index.ts:185-186 (Better Auth) | app setting: security.password.{minLength,maxLength} | [awkward: `PasswordSchema` (validators/src/auth.ts:23-25) is a static zod schema shared with client forms] |
| J8 | Account linking | index.ts:64-67 | enabled, allowDifferentEmails, allowUnlinkingAll all true | Better Auth | app setting: accounts.linking.* | |
| J9 | trustedProviders | index.ts:83 | ["google"] | Better Auth | keep: security invariant | Reasoning is in the comment at :68-82. |
| J10 | Gravatar on sign-up | index.ts:171-173 | `getGravatarImage(email)` default avatar | `user.create.before` hook | app setting: privacy.gravatarEnabled | Sends an email hash to a third party by default. |
| J11 | Change email | index.ts:347-348 | enabled true; updateEmailWithoutVerification false | Better Auth | app setting: accounts.changeEmailEnabled | The verification requirement stays code. |
| J12 | Misc invariants | index.ts:187, 247-248, 305 (Discord scopes), 321, 337 ("CUSTOMER") | booleans / arrays | Better Auth | keep | |
| J13 | API key default expiry | auth/src/plugins/index.ts:53 | 31_536_000 s (365 d) | :68 → apiKey plugin :95; auth/src/__tests__/config.test.ts:61-72 | app setting: security.apiKeys.defaultExpiryDays | Capped by Better Auth's maxExpiresIn of 365 d. |
| J14 | Email OTP | plugins/index.ts:134, 135, 138-139 | ttl 600 s; 3 attempts; 2 per 60 s | module-level `plugins` array | app setting: security.emailOtp.* | |
| J15 | Magic link | plugins/index.ts:163, 164, 166-167 | ttl 300 s; 1 attempt; 2 per 60 s | same | app setting: security.magicLink.* | |
| J16 | 2FA attempts | plugins/index.ts:182 | 3 | same | app setting: security.twoFactor.maxAttempts | |
| J17 | Sign-up guards | plugins/index.ts:97, 102, 147, 176 | sendVerificationOnSignUp; disableSignUp ×2; allowPasswordless | same | keep: security invariant | Comment at :98-101. |
| J18 | lastLoginMethod cookie | plugins/index.ts:144 | 30 d | same | keep | UX hint only. |
| J19 | Cookie and host topology | index.ts:87-95, 120-128; plugins/index.ts:172 | crossSubDomainCookies enabled; protocol "auto"; domain sets (see S3) | Better Auth | keep: deployment bootstrap | Needed before any database read. |
| J20 | Password-policy error text | password-policy.ts:100 | "Password must be 8-64 characters…" | `assertPasswordPolicy` (hooks.before) | keep: copy | Derive the numbers from J7. |

#### K. Integrations and one-off scripts

| # | Item | Location | Value shape | Readers (context) | Classification | Justification |
|---|---|---|---|---|---|---|
| K1 | Core integration name | integrations/index.ts:54 | "Virtbase" | IntegrationRegistry | keep | Internal, hidden from the hub; appears only in logs and health output. |
| K2 | Backfill constants | backfill/subscriptions.ts:67, 71; backfill/payment-methods.ts:69, 74, 77 | 1 (month), 200, 100, 100 (Stripe max page), "stripe" | one-off scripts apps/web/scripts/backfill-*.ts | keep: one-off migration | :67 restates D4 and :77 restates D22. |

#### S. Read here, defined elsewhere (readers in scope only)

| # | Constant (definition) | Value | Readers in scope (context) | Classification |
|---|---|---|---|---|
| S1 | APP_NAME (utils/src/constants/main.ts:18, env `NEXT_PUBLIC_APP_NAME` or "Virtbase") | string | auth/src/index.ts:119; auth/src/plugins/index.ts:171, 175; router/checkout.ts:608, 619 (tRPC customCheckout); privacy/export/document.ts:152 and brand.ts:108 (export step) | app setting: branding.name [awkward: module load in auth plugins and brand.ts] |
| S2 | SUPPORT_EMAIL (main.ts:24) | "support@virtbase.com" | checkout.ts:612 (sent to Anonpay as contact) | app setting: support.email |
| S3 | APP/ADMIN/PUBLIC_DOMAIN, *_HOSTNAMES (main.ts:35-70), COOKIE_DOMAIN (cookies.ts:18) | env-derived | notifications/deliver.ts:181; router/payment-methods.ts:50; router/privacy.ts:253; checkout.ts:598; auth/src/index.ts:91, 94, 122-124, 127; plugins/index.ts:172 | keep: deployment bootstrap (env) |
| S4 | STEP_UP_WINDOW_SECONDS (limits.ts:86) | 600 s | step-up/marker.ts:47, 106; step-up/freshness.ts:35 (stepUpProcedure; step-up.verifyPassword) | app setting: security.stepUpWindowSeconds |
| S5 | BACKUP_STALE_AFTER_HOURS (limits.ts:46) | 12 h | backups/reconcile-backup.ts:201, 225 (tRPC backups.status.get / create / delete; cron reconcile-server-backups) | app setting: backups.staleAfterHours |
| S6 | BACKUP_ARCHIVE_GRACE_MINUTES (limits.ts:53) | 10 min | reconcile-backup.ts:272 | keep: operational |
| S7 | TEMPLATE_IMAGE_STALE_AFTER_HOURS (limits.ts:70) | 6 h | template-images/reconcile-template-image.ts:170 (step, cron, admin action) | app setting: provisioning.templateImageStaleAfterHours |
| S8 | INVOICE_RETENTION_YEARS (limits.ts:98) | 10 y | privacy/subject-data.ts:166, 173, 180, 187, 194, 209, 217, 225 (module-level `SUBJECT_DATA`); workflows/offboard-user/record-erasure.ts:52 (step) | app setting: legal.invoiceRetentionYears [awkward: interpolated into a module-level object] |
| S9 | DATA_EXPORT_TTL_DAYS / DATA_EXPORT_MIN_INTERVAL_HOURS (limits.ts:107, 116) | 7 d / 24 h | router/privacy.ts:101, 77 (tRPC privacy.requestExport; :77 in `sql.raw`, so validate the value as numeric) | app setting: privacy.export.{ttlDays,minIntervalHours} |
| S10 | DATA_EXPORT_PASSPHRASE_LENGTH (limits.ts:119) | 24 | privacy.ts:94 | keep: security |
| S11 | ACCOUNT_DELETION_TOKEN_TTL_HOURS / ACCOUNT_DELETION_GRACE_PERIOD_DAYS (limits.ts:137, 129) | 24 h / 14 d | privacy/deletion/lifecycle.ts:57 (tRPC privacy.requestDeletion), :114 (route /api/privacy/confirm-deletion) | app setting: privacy.deletion.{tokenTtlHours,graceDays} |
| S12 | ACCOUNT_INACTIVITY_MONTHS / _GRACE_PERIOD_DAYS / _REMINDER_DAYS (limits.ts:146, 154, 157) | 6 mo / 30 d / 7 d | privacy/inactivity/eligibility.ts:98 (sync); inactivity/sweep.ts:158, 177 (cron notify-inactive-accounts) | app setting: privacy.inactivity.* [awkward: eligibility check is sync] |
| S13 | RENEWAL_RETRY_SCHEDULE_DAYS (limits.ts:179) | [1, 3, 5, 7] | billing/retry-schedule.ts:33, 60, 84, 88 (crons; tRPC retryNow) | app setting: billing.dunning.retryScheduleDays [awkward: derived at module load, here and in limits.ts:209] |
| S14 | RENEWAL_AUTHENTICATION_WINDOW_HOURS (limits.ts:190) | 72 h | billing/record-outcome.ts:379; billing/reconcile-renewals.ts:520 | app setting: billing.renewals.authenticationWindowHours |
| S15 | MAX_SSH_KEYS_PER_USER (limits.ts:18) | 100 | router/ssh-keys.ts:245 (tRPC sshKeys.create). Bypassed by checkout.ts:335-356 (comment at :332). | app setting: accounts.maxSshKeys |
| S16 | MAX_ACTIVE_ISO_DOWNLOADS_PER_USER / MAX_ISO_DOWNLOAD_SIZE_BYTES / ISO_DOWNLOAD_EXPIRATION_MINUTES (limits.ts:29, 34, 39) | 3 / 10 GiB / 60 min | router/iso/index.ts:248, 266, 337 (tRPC iso.upload; :337 in `sql.raw`) | app setting: servers.iso.* |
| S17 | DEFAULT_EMAIL_LOCALE (packages/email/src/translations/index.ts:28) | "en" | notifications/deliver.ts:102, 110 | app setting: app.defaultLocale |
| S18 | SUBSCRIPTION_MANDATE_TEXT_VERSION (packages/validators/src/subscriptions.ts:171) | "2026-08-30" | router/subscriptions.ts:459, 484 (tRPC acceptMandate) | keep: tied to mandate wording shipped in code; must move with the text if that becomes editable |
| S19 | ANONPAY_MIN_AMOUNT (packages/integration-anonpay/src/constants.ts:21) | 500 (EUR cents) | checkout.ts:570 | keep: provider-dictated (only enforced when currency is "EUR", :571) |

---

#### Borderline items excluded

- **Security and IANA tables.**
  - Reserved IP ranges: abuse/cidr.ts:45.
  - SSRF block lists: lib/safe-iso-download-url.ts:22-36, 188-217. These duplicate the cidr.ts ranges.
- **State machines and status sets.**
  - lib/subscription-status.ts:34, 56, 84; lib/order-status.ts:28, 44.
  - abuse/case.ts:74, 77; abuse/reconcile.ts:31; mailbox/receive.ts:79; router/abuse.ts:46.
  - router/subscriptions.ts:368, 378; billing/renew-subscription.ts:57, 84.
- **Identifiers persisted in the database.**
  - Failure codes and actors: billing/collect.ts:62, 70; record-outcome.ts:41, 76; reconcile-renewals.ts:95, 98; orders/reconcile-orders.ts:55; subscriptions/transition-subscription.ts:66.
  - Draft id: dry-run.ts:49.
- **Proxmox protocol details.**
  - proxmox/find-follow-up-guest-power-task.ts:27, 35.
  - proxmox/agent/classify-agent-error.ts:33, 41; proxmox/agent/probe.ts:23.
  - TPM and EFI disk options, including `pre-enrolled-keys=1`: router/servers/advanced.ts:130, 146.
  - ISO cdrom drive and boot order: router/servers/mounts.ts:96-103.
- **Guest probe scripts:** guest-firewall/commands.ts:47, 76, 92; guest-firewall/detect.ts:31.
- **AI prompts and eval fixtures.**
  - abuse/triage/system-prompt.ts:27, with a brand example at :29.
  - firewall-ai/system-prompt.ts:29, 106; triage/eval/cases.ts:45; firewall-ai/eval/cases.ts:81.
  - Gateway caching option: classify.ts:101.
- **Copy and format constants.**
  - English operator notification texts: notifications/text.ts:56-209.
  - EXPORT_SCHEMA_VERSION: privacy/export/collect.ts:55.
  - Data map: privacy/subject-data.ts:80, 319.
  - Token length: privacy/deletion/tokens.ts:29.
  - Fallback plan name: orders/settle-stripe-payment.ts:62.
- **Calendar and column facts:** subscriptions/period.ts:39; guest-os/columns.ts:33.
- **Test fixtures:** testing/fixtures.ts.
- **Probable bug, not configuration.** revoke-external-identities.ts:25 and :27 call Discord and GitHub with only a `token` form field and no client credentials. `revoked++` at :86 counts any HTTP response, because `fetch` does not throw on a 4xx. Revocation for those two providers likely fails silently.

---

#### (1) Shared-settings candidates (more than one package reads the value)

- **branding.name**
  - APP_NAME is read by apps/web, api, auth, email, integration-anonpay, integration-lexware and utils.
  - The literal "Virtbase" also appears in api: mailbox/send.ts:40, notifications/text.ts:203, export/document.ts:176, backups/index.ts:349, firewall/analysis.ts:46, firewall/guest.ts:37, integrations/index.ts:54.
  - Also in integration-alertmanager/dashboards/virtbase-abuse.json:3, and as "vb"/"virtbase" in VM names and tags (E6, E10).
- **support.email**: SUPPORT_EMAIL is read by apps/web, api, email, integration-anonpay and utils.
- **billing.currency**
  - api: D1 sites and MIN_CHARGE_EUR_CENTS.
  - db column defaults: schema/orders.ts:76, payments.ts:70, subscriptions.ts:111, 308.
  - "EUR" literals in apps/web (13 files, e.g. features/checkout/components/order-summary.tsx).
  - "EUR" literals in email templates (renewal-final-warning.tsx, renewal-payment-failed.tsx, invoice-created.tsx).
  - integration-discord (features/lifecycle/index.ts), integration-lexware (adapter.ts), integration-stripe (adapter.ts), integration-anonpay (constants.ts:21).
- **billing.termMonths**: api (D4, 5 sites) and apps/web features/servers/components/plan/current-plan-card.tsx:136 (`interval_months ?? 1`).
- **billing.taxRates / sellable countries**: api lib/invoicing.ts:23, and apps/web features/checkout/components/stripe-payment-form.tsx:41 (`countries`, the same 26 codes).
- **security.password.\***: auth password-policy.ts:63-64, 100; validators src/auth.ts:23-25; the client forms that use `PasswordSchema` (per the comment at password-policy.ts:24-26).
- **legal.invoiceRetentionYears**: apps/web, api, email, utils.
- **privacy.\*** (the definitions all live in utils):

  | Value | Read by |
  |---|---|
  | DATA_EXPORT_TTL_DAYS | api, email |
  | ACCOUNT_DELETION_GRACE_PERIOD_DAYS | apps/web, api, email |
  | ACCOUNT_DELETION_TOKEN_TTL_HOURS | api, email |
  | ACCOUNT_INACTIVITY_MONTHS | api, email |

- **servers.iso.\***: apps/web and api.
- **app.defaultLocale**: email (DEFAULT_EMAIL_LOCALE) and api (deliver.ts:102, 110; export/messages.ts:313; invoicing.ts:72).
- **legal.mandateTextVersion**: validators (definition), api, apps/web.
- **novnc.clientUrl**: api console.ts:107; apps/web src/lib/csp/index.ts:107 (frame-src); validators src/server/console.ts:35 (OpenAPI example).
- **Hookscript filename**: api apply-hardware-config.ts:109 and apps/web features/admin/lib/proxmox-nodes/hookscript.ts:23.
- **Trustpilot** (proposed new integration `trustpilot`):
  - api: send-server-ready-email.ts:78-83 (opts in).
  - email: resend/constants.ts:31-32 (AFS address).
  - utils: constants/urls.ts:39-43 (review and profile URLs for virtbase.com).
- **abuse.defaultResponseHours**: api case.ts:209, 215, 421 and db schema/abuse-rules.ts:81.
- **abuse.observationHours**: set in apps/web features/admin/api/abuse/manage-abuse-cases.ts:352 (24 h inline), read by api reconcile.ts:191.
- **abuseipdb.blockPrefixLength**: api poll.ts:43 and integration-abuseipdb config.ts:33 (declared, never read).
- **Anonpay minimum**: integration-anonpay constants.ts:21 and adapter.ts:59; api checkout.ts:570; also read in apps/web.
- **Domains (APP/ADMIN/PUBLIC)**: apps/web, api, auth, email, integration-discord, utils. These stay env/bootstrap.

#### (2) Duplicates and inconsistencies

1. **Currency is "EUR" in 7 places in scope.**
   - Sites: checkout.ts:444 (lower-case "eur"), 571; create-order.ts:65; apply-payment-event.ts:127; create-subscription.ts:81; generate-invoice.ts:198; document.ts:266.
   - Invoice rows have no currency column, so the export assumes EUR (document.ts:384-385).
   - The Anonpay minimum is only enforced when currency is "EUR" (checkout.ts:570-571).
2. **The billing term is hard-coded as one month in 5 places** (D4).
   - Proration uses a flat 30 days instead (pricing.ts:34). This mismatch is documented in pricing.ts:27-33.
3. **Root user name appears twice:** apply-hardware-config.ts:120 (`ciuser`) and send-server-ready-email.ts:77 (`rootUsername` in the email).
4. **Template metadata never reaches the real VM.**
   - create-guest-from-image.ts:76-79 sets ostype, machine, cpu and bios from the template.
   - In the same workflow, apply-hardware-config.ts:91, 101, 106 overwrites cpu ("cputype=host"), machine ("q35") and ostype ("l26") (provision-server/index.ts:103 runs before :151).
   - Change-template reuses the original VM's config, so the hard-coded values win there too.
5. **Same AI model id twice:** model.ts:19 and generation.ts:23.
6. **Allocation sizes /32 and /64** are hard-coded at get-network-adapters.ts:44-45 and repeated in invoice text at generate-invoice.ts:193.
7. **Response hours and rule defaults are hard-coded in two layers.**
   - Response hours of 24: case.ts:209, 215, 421 and DB default abuse-rules.ts:81.
   - Grace of 0: case.ts:210 and DB :78.
   - Notify true: case.ts:208 and DB :80.
8. **Abuse text caps.**
   - Title cap 500: sanitize.ts:18, restated inline at receive.ts:414.
   - Name and organisation cap 200: intake.ts:131, 135 and receive.ts:224, with no constant.
   - MAX_ABUSE_REPORTER_LENGTH (sanitize.ts:20) is unused.
9. **The "AB-" case reference** is written in three places: case.ts:543 and address.ts:121, 125.
10. **The AbuseIPDB "Block size" setting has no effect.**
    - It is declared at integration-abuseipdb/src/config.ts:33, shown in admin (index.ts:61), and documented in README.md:400-405.
    - The roll-up actually uses poll.ts:43 through :87/:111/:188.
11. **Two "how far back to look" defaults of 30 days:** poll.ts:57 and abuseipdb config.ts:25 (`maxAgeInDays`).
12. **noVNC URL in three places** and **hookscript filename in two** (see list 1).
13. **VM naming is duplicated** at create-guest-from-image.ts:63-68 and clone-guest.ts:48-53. The second copy is dead.
14. **Country list duplicated, and Greece is missing from both.** EU_VAT_RATES keys (invoicing.ts:24-49) and apps/web stripe-payment-form.tsx:41 hold the same 26 codes, not all 27 EU states.
15. **Password length 8/64** appears at password-policy.ts:63-64, in the message at :100, and in validators/src/auth.ts:23-25 (including the regex `{8,}`).
16. **Brand string vs. APP_NAME.** The "Virtbase" literals listed in (1) bypass APP_NAME, which env can override. So a renamed instance still says "Virtbase" in those places.
    - Brand-tied artifacts: the "abuse@virtbase.com" placeholder (email.ts:65), the "virtbase.com" fallback (address.ts:32) and the `x-virtbase-api-key` header (trpc.ts:77).
17. **"stripe" provider id twice:** provider.ts:29 and backfill/payment-methods.ts:77.
18. **The observation window has no constant.** The 24 h is set inline in apps/web (manage-abuse-cases.ts:352), and the README calls it "fixed".
19. **Locale fallback "en" in three places:** messages.ts:313, invoicing.ts:72, and DEFAULT_EMAIL_LOCALE.
20. **Retry formula contradicts its comment:** select-proxmox-node.ts:339-340 (the code always waits 60 min).
21. **Coupled constants that must change together.**
    - MAX_DELIVERY_ATTEMPTS (5) and the length of BACKOFF_MINUTES (4) (deliver.ts:41, 44).
    - The dunning schedule (S13) and RENEWAL_SUSPENSION_GRACE_DAYS (utils limits.ts:209). That schedule's documentation also ties its length to SERVER_DELETION_GRACE_PERIOD_DAYS (limits.ts:24).

#### (3) Totals

| Classification | Rows defined in scope (A–K) | S table (defined elsewhere) |
|---|---|---|
| app setting | 70 | 14 |
| integration setting | 6 (abuseipdb ×1, abuse-mailbox ×2, novnc ×2, anonpay ×1) | 0 |
| keep as code constant | 67 | 5 |
| remove (dead) | 3 (A13 MAX_ABUSE_REPORTER_LENGTH, E25 clone-guest, H4 COLOR_BACKGROUND) | 0 |
| **Total** | **146** | **19** |

App settings by section: A 9, B 7, C 4, D 5, E 18, F 3, G 5, H 4, I 2, J 13.

Proposed new integrations implied by this list: `abuse-mailbox`, `novnc`, `ai-gateway` (holds the AI key; the models stay in `ai.*` app settings), and `trustpilot`.

### 2.2 `apps/web`, `packages/content`, `packages/ui`

Sources: AGENTS.md plus the READMEs at the repo root, `packages/content/` and `apps/web/public/assets/static/flags/`. References were found with grep and checked with LSP `findReferences` on `APP_NAME`, `SUPPORT_EMAIL`, `locales`, `SOCIALS`, `DefaultJsonLd` and `Wordmark`. Environment reads are left out, except where a constant is derived from one.

**Scope facts:**
- **Rate limits:** apps/web defines none. All of them live in packages/api: the default is 120 requests per 1 m (`packages/api/src/upstash/ratelimit.ts:23,29`), with per-route overrides such as `router/public.ts:38` (10), `router/auth.ts:29` (8) and `router/invoices.ts:112` (4).
- **`features/checkout/constants.ts`** holds only `PAYMENT_FORM_ID` at :31, which is a pure code constant.
- **Absent from the whole scope:**
  - a status-page URL
  - a data-protection officer
  - bank details
  - tax rates
  - any `abuse@` address in the content
- **Last-updated dates:** the dates on legal and help pages come from git (`source.config.ts:58`), not from frontmatter.

**Context tags:**
- **NC:** `next.config.ts`, evaluated at build time.
- **DEP:** `vercel.json`, read at deploy time.
- **PX:** `proxy.ts`.
- **RH:** route handler.
- **SC:** server component.
- **SC-shell:** server component that ends up in a prerendered static shell (through `generateStaticParams` or a layout).
- **CC:** client component, either marked `"use client"` or only ever imported by one.
- **UC max / UC days:** code inside `"use cache"` with `cacheLife("max")` or `cacheLife("days")`.
- **META:** metadata or `generateMetadata`.
- **GSP:** `generateStaticParams`.
- **MDX:** compiled at build time.
- **CB:** client bundle at module scope.
- **STATIC:** a file in `public/`.

**`HARD:`** marks a value that is hard to move into a DB-backed setting.

#### A. Build and deploy config

| # | Item | Location | Value shape | Readers (context) | Classification | Justification |
|---|---|---|---|---|---|---|
| A1 | allowedDevOrigins | next.config.ts:31 | array, 1 glob `*.virtbase.localhost` | NC (dev server) | bootstrap/deploy config: dev hostnames, needed before DB | Brand appears in the dev host. Mirrors the dev fallbacks in `packages/utils/src/constants/main.ts:44-89`. |
| A2 | HSTS | next.config.ts:79-80 | `max-age=63072000; includeSubDomains; preload` | NC, all routes | bootstrap/deploy config: commits the operator's whole apex domain | **HARD:** build-time header |
| A3 | Immutable 1-year caching | next.config.ts:115-141 (:120 manifest PNGs, :129 `manifest.webmanifest`, :138 `/assets/static`) | 3× `public, max-age=31536000, immutable` | NC | keep as code constant | **HARD:** a name, colour or icon edited in admin would stay pinned in the manifest for a year. Needs versioned URLs, or `immutable` dropped. |
| A4 | Public-page edge cache | next.config.ts:142-156 (value :153; locale regex :143) | `public, s-maxage=300, stale-while-revalidate=86400` | NC, every `/<locale>/*` on the public host | bootstrap/deploy config | Freshness decision: a settings edit reaches visitors only after the edge cache expires (up to 5 min, then up to 1 day stale), even after `revalidateTag`. |
| A5 | `/legal` → `/legal/notice` | next.config.ts:171-181 | redirect rule | NC | keep as code constant | Using the imprint as the landing page is a German convention. |
| A6 | Sentry tunnel route | next.config.ts:266; proxy.ts:36,40 (matcher) | `"/science"` | NC + PX | keep as code constant | The two literals must stay in sync. |
| A7 | automaticVercelMonitors | next.config.ts:271 | `true` | NC | bootstrap/deploy config | Couples Sentry to Vercel crons. |
| A8 | Vercel build settings | vercel.json:3-5 | bun `1.4.x`, build command (runs `db:migrate`), ignore command | DEP | bootstrap/deploy config | Hosting platform. |
| A9 | Cron schedules (21) | vercel.json:6-91 | 21 `{path, schedule}` (breakdown below the table) | DEP → RH `src/app/api/cron/*/route.ts` (all 21 handlers exist) | bootstrap/deploy config | **HARD:** Vercel reads this at deploy. Cadence is coupled to code (`reconcile-renewals/route.ts:31`, `renew-subscriptions/route.ts:24`, `retry-renewals/route.ts:24`). Schedules from the DB would need one dispatcher cron. |
| A10 | Git-derived lastModified | source.config.ts:58 | plugin | NC → legal `page.tsx:146-149`, help article `page.tsx:151-157`, `sitemap.ts:44` | keep as code constant | Once legal text pulls company data from settings, "Last updated" no longer reflects legal changes. |

The 21 cron schedules in A9:
- **Every 5 min (4):** :9, :77, :81, :89
- **Every 10 min (4):** :33, :45, :49, :73
- **Every 15 min (2):** :13, :17
- **Every 30 min (3):** :29, :41, :57
- **Hourly (3):** :37 (`7 *`), :53 (`17 *`), :85 (`37 *`)
- **Daily (5):** :21 and :25 (`0 0`), :61 (`23 3`), :65 (`41 2`), :69 (`13 4`)

#### B. CSP

The CSP lives in `src/lib/csp/index.ts`. It is built once at module load and sent as a build-time header via next.config.ts:27 and :63.

| # | Item | Location | Value shape | Readers | Classification | Justification |
|---|---|---|---|---|---|---|
| B1 | Own-domain img-src | csp:89-91 | 4 origins derived from env | NC | bootstrap/deploy config | Comes from `NEXT_PUBLIC_APP_DOMAIN` through utils. |
| B2 | Vercel Live / Pusher | csp:93-104 | 4 hosts | NC | bootstrap/deploy config | Hosting vendor's preview toolbar. |
| B3 | noVNC client page | csp:106-108 | 1 URL (`novnc.com/noVNC/vnc.html`) | NC; duplicates `packages/api/src/router/servers/console.ts:107` | integration setting: novnc.clientUrl (proposed new console integration) | **HARD:** build-time header, and must match the API literal. |
| B4 | Avatar hosts | csp:110-117 | 4 hosts (Libravatar, GitHub, `*.googleusercontent.com`, Discord CDN) | NC; Libravatar also in `packages/utils/src/functions/get-gravatar-image.ts:26` | keep as code constant | The list follows the OAuth providers (H12). |
| B5 | Sentry hosts | csp:119-121 | `https://sentry.virtbase.com`, `*.sentry.io`, `*.sentry-cdn.com` | NC | bootstrap/deploy config: derive from SENTRY_URL/DSN | The operator's self-hosted Sentry host is hard-coded. `report-uri` (:123-125) already comes from env. |
| B6 | Stripe hosts | csp:128-148 | 9 entries, including maps.googleapis.com (:132, :143) and fonts.googleapis.com (:145) | NC | keep as code constant (belongs to the stripe integration) | **HARD:** build-time. If Stripe becomes optional, these hosts must come from the integration definition. |
| B7 | YouTube no-cookie | csp:157-159 | 1 host | NC; `ui/fumadocs/video.tsx:68,112` | keep as code constant | Vendor for the help-article videos. |

#### C. Hostnames and domains

| # | Item | Location | Value shape | Readers | Classification | Justification |
|---|---|---|---|---|---|---|
| C1 | `*_DOMAIN` / `*_HOSTNAMES` | packages/utils/src/constants/main.ts:35-89 (derived from env; contains a literal `staging.` prefix and `*.virtbase.localhost:3000` fallbacks) | URLs and host sets | 78 non-import uses in 45 files (examples below the table) | bootstrap/deploy config | **HARD:** needed before the DB is reachable: proxy host routing, build-time headers and redirects, cookie domain. |
| C2 | Route-group folders `app.virtbase.com` and `admin.virtbase.com` | `src/app/app.virtbase.com/`, `src/app/admin.virtbase.com/`; rewrites in `lib/middleware/app.ts:68` and `admin.ts:80`; about 13 `revalidatePath("/admin.virtbase.com/[locale]")` calls, e.g. `features/admin/api/integrations/update-integration.ts:58,185` | internal path segments | PX, server actions | keep as code constant | Never visible to users; the brand only leaks into internal paths. |
| C3 | Absolute production URLs in the API docs | `src/app/api/docs/description.md:7, 61-64` | 5 URLs | read from disk at runtime (`docs/page.tsx:40-54`), UC max (:62) | bootstrap/deploy config: substitute APP/PUBLIC_DOMAIN when the file is read | Easy, because the file is read at runtime. The OpenAPI `baseUrl` already uses `PUBLIC_DOMAIN` (:68). |

Example readers for C1:
- **NC:** next.config.ts:105, 147, 176, 187, 198, 201, 212
- **PX:** proxy.ts:54, 58, 62
- **CSP:** csp:90
- **UC max:** robots.ts:47, sitemap.ts
- **RH:** og/route.tsx:137
- **SC-shell:** default-json-ld.tsx:32-33, 39-41
- **CC:** nav.tsx, nav-user.tsx, checkout-waivers.tsx, stripe-payment-form.tsx, add-payment-method.tsx:44

#### D. Brand and app identity (apps/web)

| # | Item | Location | Value shape | Readers | Classification | Justification |
|---|---|---|---|---|---|---|
| D1 | `APP_NAME` | packages/utils/src/constants/main.ts:18 (`NEXT_PUBLIC_APP_NAME` or "Virtbase") | string | 21 apps/web files (list below the table) | app setting: app.name | **HARD:** inlined at build into 4 CCs; used in static shells, UC max code and module-level metadata; manifest and OG image are cached immutably. |
| D2 | Stripe Payment Element business name | stripe-payment-form.tsx:269-270; add-payment-method-form.tsx:173 | literal "Virtbase" ×2 | CC | app setting: app.name (or company.legalName for the SEPA mandate wording) | Bypasses `APP_NAME`. |
| D3 | 17 translatable msgids containing the literal "Virtbase" | help/page.tsx:48 (META, UC max) and 16 more (list below the table) | msgid text, copied into all 17 `.po` catalogs | as listed | app setting: app.name (rewrite as `{appName}`) | Needs re-translation in Crowdin. Nine more such msgids come from packages/integration-discord. |
| D4 | Discord demo bot identity | features/landing/components/discord-bot-demo.tsx:105 (name), :150 (avatar is the manifest icon) | literal and icon path | SC inside UC max marketing pages | app setting: app.name / branding.icons | — |
| D5 | Tagline "Hosting, but secure." | manifest.ts:25; discord-bot-demo.tsx:158; `marketing/*/index.mdx:8` | string | static metadata route; SC; MDX | app setting: app.tagline | The manifest copy is English for every locale. |
| D6 | Organisation description | default-json-ld.tsx:49 | sentence | SC-shell | app setting: seo.organizationDescription | Wording differs from index.mdx:10. |
| D7 | Icon files | src/app/favicon.ico, icon0.svg, icon1.png, apple-icon.png; public/web-app-manifest-192x192.png and -512x512.png (also manifest.ts:32,38 and default-json-ld.tsx:40-41) | 6 binary files | NC (file-convention metadata routes); STATIC | app setting: branding.icons (uploads) | **HARD:** emitted at build, and cached immutably (A3). |
| D8 | Centre mark in the 2FA QR code | two-factor-enable-dialog.tsx:118 | path `/assets/static/bimi.svg` | CC | app setting: branding.logoMark | — |
| D9 | Manifest colours | manifest.ts:28-29 | `#000000` / `#ffffff` | static metadata route | app setting: branding.themeColor, branding.backgroundColor | Do not match the viewport colours in D10. |
| D10 | Viewport theme colours and default theme | ui/document.tsx:41-44, :64 | 2 hex colours, `"dark"` | SC (every layout via `defaultViewport`) | keep as code constant (design tokens) | Becomes branding.* only if theming becomes configurable. |
| D11 | OG image look | og/route.tsx:56-61, :144-147 | colours, fonts, 1200×630, 1-year immutable | RH | keep as code constant | The immutable cache pins the app name and hostname in the image. |
| D12 | Stripe Elements appearance and font | elements-provider.tsx:115-149 (Google Fonts CSS :117-118; colours :125-133) | URL plus about 10 hex colours | CC | keep as code constant | The Stripe iframe fetches the font from Google, which matters for the privacy policy. |
| D13 | Data-export file name | api/privacy/exports/[id]/route.ts:99 | `virtbase-data-export.pdf` | RH | app setting: app.name (slugified) | — |

Readers of `APP_NAME` (D1):
- **Static metadata route:** manifest.ts:23-25
- **RH:** geofeed.csv/route.ts:47; og/route.tsx:130 (immutable)
- **API docs:** api/docs/page.tsx:65 and :83 (UC max); :122-123 (module-level `metadata`)
- **SC-shell:** default-json-ld.tsx:43, 48, 49, 87, 91; footer.tsx:49 and :249; get-on-app-store.tsx:35
- **SC:** colored-layout.tsx:69; auth-layout.tsx:50
- **META:** checkout/[id]/page.tsx:90 and :102 (UC max); login/page.tsx:34, 37, 60; forgot-password/page.tsx:33, 35; register/page.tsx:32, 35; reset-password/page.tsx:33, 35
- **CC:** nav.tsx:61; register/page-client.tsx:44; user-id-card.tsx:50; server-id-card.tsx:61
- **Title template on every page:** packages/utils/src/functions/construct-metadata.ts:25, 55, 60

The other 16 msgids in D3:
- **CC:**
  - iso-catalog-grid.tsx:128
  - checkout-form.tsx:160
  - use-agent-status-mapping.ts:63, 88, 117
  - use-finding-mapping.ts:82, 100
  - guest-firewall-alert.tsx:61
  - firewall-rules-table/index.tsx:156
  - delete-firewall-rule-dialog.tsx:104
  - server-operating-system.tsx:102, 109
  - mandate-dialog.tsx:145, 177, 213
- **SC:** discord-bot-demo.tsx:158

#### E. Company and legal identity in code

| # | Item | Location | Value shape | Readers | Classification | Justification |
|---|---|---|---|---|---|---|
| E1 | Legal name | default-json-ld.tsx:50 | string (UG legal form) | SC-shell: `(public)/[locale]/layout.tsx:69`; app `(auth)/layout.tsx:27` | app setting: company.legalName | **HARD:** prerendered per locale (layout GSP :35-37). |
| E2 | Alternate names | default-json-ld.tsx:48, :91 | `${APP_NAME} Hosting` plus a short company name | SC-shell | app setting: seo.alternateNames | Short form drops "(haftungsbeschränkt)". |
| E3 | Postal address | default-json-ld.tsx:51-58 | PostalAddress: street, postcode, town, region "Saxony", country "DE" | SC-shell | app setting: company.address.{street,postalCode,locality,region,country} | — |
| E4 | VAT ID | default-json-ld.tsx:59 | `DE` + 9 digits | SC-shell | app setting: company.vatId | — |
| E5 | Tax number | default-json-ld.tsx:60 | German tax-number format | SC-shell | app setting: company.taxNumber | Appears only here. |
| E6 | DUNS number | default-json-ld.tsx:65 | `0060:` + 9 digits | SC-shell | app setting: company.dunsNumber | — |
| E7 | Founding date | default-json-ld.tsx:66 | ISO date | SC-shell | app setting: company.foundingDate | — |
| E8 | Founder | default-json-ld.tsx:67-74 | Person: name, jobTitle "CEO", personal website URL | SC-shell | app setting: company.managingDirector.{name,title,url} | — |
| E9 | Employee range | default-json-ld.tsx:75-79 | 1–10 | SC-shell | app setting: company.employeeRange | — |
| E10 | Copyright line | footer.tsx:245-251 (msgid with the legal name at :246; `year: "2026"` at :248) | msgid + year literal | SC-shell | app setting: company.legalName passed as `{legalName}`; derive the year | **HARD:** the legal name is inside the msgid in all 17 `.po` catalogs. The year is a literal because `new Date()` is not allowed in a prerendered shell. |
| E11 | Jurisdiction in UI copy | features/account/components/privacy/delete-account-card.tsx:182 | msgid "…as German tax law requires" | CC | app setting: legal.jurisdiction | — |
| E12 | VAT-inclusive price notice | (public)/[locale]/checkout/[id]/page.tsx:180 | msgid | SC (checkout shell) | app setting: billing.pricesIncludeTax | Duplicates terms.mdx:244. |
| E13 | Withdrawal-waiver consent | features/checkout/components/checkout-waivers.tsx:42-97 (waiver msgid :80) | 2 required checkboxes linking to /legal/{terms,privacy,revocation} | CC (checkout-form.tsx:213; plan-order-dialog.tsx:270) | app setting: legal.requireWithdrawalWaiver | Wording is EU consumer-law specific. |
| E14 | Legal page set and links | footer.tsx:202-229; app-footer.tsx:32, 44, 56; auth-layout.tsx:53, 63; checkout-waivers.tsx:51-89; video.tsx:104; next.config.ts:171-181 | 4 slugs: notice, privacy, terms, revocation | SC-shell / SC / CC / NC | keep as code constant | The slugs are MDX file names; the set itself is DE/EU-specific. |

#### F. Contacts, social and product links

| # | Item | Location | Value shape | Readers | Classification | Justification |
|---|---|---|---|---|---|---|
| F1 | `SUPPORT_EMAIL` | packages/utils/src/constants/main.ts:24 (a literal, not from env) | string | default-json-ld.tsx:42, 63 (SC-shell); contact/page.tsx:97 (UC max); api/docs/page.tsx:85 (UC max); ui/app-sidebar.tsx:86 (SC) | app setting: support.email | **HARD:** static shell and UC max code need a revalidated tag on save. |
| F2 | Support address hard-coded instead of `SUPPORT_EMAIL` | public/.well-known/security.txt:1; src/instrumentation-client.ts:56 | `support@virtbase.com` ×2 | STATIC; CB | app setting: security.disclosureEmail | **HARD:** a static file would have to become a route handler; the other copy is in the client bundle. |
| F3 | Other security.txt fields | security.txt:2-4 | Expires 2034-10-21, Preferred-Languages "de, en", Canonical production URL | STATIC | app setting: security.txt.{expires,preferredLanguages} (generate the file; canonical from PUBLIC_DOMAIN) | — |
| F4 | `DISCORD_INVITE_URL` | utils urls.ts:18 | URL | contact/page.tsx:85 (UC max); lib/socials.ts:42 | app setting: social.discordInviteUrl | — |
| F5 | `SOCIALS` | lib/socials.ts:33-59 (URLs from utils urls.ts:18, 26, 28, 30, 32) | 5 × {name, icon, href}: YouTube, Discord, X, Instagram, GitHub | socials-row.tsx:27 → footer.tsx:53 (SC-shell) and app-footer.tsx:29 (SC); default-json-ld.tsx:80 sameAs (SC-shell) | app setting: social.{youtube,discord,x,instagram,github}Url | A second list exists in `packages/email/src/templates/socials.tsx:34-40`. |
| F6 | Looking Glass link | footer.tsx:182 (`LOOKING_GLASS_URL`, utils urls.ts:24); untranslated label at :191 | URL + label | SC-shell | app setting: app.links.lookingGlassUrl (hide when empty) | — |
| F7 | iOS App Store link | get-on-app-store.tsx:28, 34 (utils urls.ts:20-22); badges `public/assets/static/apple/badge_{de,en,fr,nl}.svg` | URL + 4 SVGs | SC-shell (footer.tsx:54) | app setting: app.links.iosAppStoreUrl | Badges exist for only 4 locales. |
| F8 | Contact page cards | (public)/[locale]/contact/page.tsx:76-124 | 4 cards (Discord, mailto, /help, /api/docs) | UC max (:45, :73) | keep as code constant | Layout only; the values come from F1/F4. |
| F9 | Personal e-mail address as placeholder | user-email-card.tsx:100; email-sign-in.tsx:190; signup-email.tsx:121; forgot-password-form.tsx:91 | the founder's personal @virtbase.com address ×4 | CC | keep as code constant, but use a neutral example.com address | The same default is used in about 25 packages/email templates. |
| F10 | Browser console banner | instrumentation-client.ts:29-58 | ASCII art with the author's signature | CB, every page | keep as code constant (or drop) | Not configuration; its address is covered by F2. |

#### G. SEO, docs and listing feeds

| # | Item | Location | Value shape | Readers | Classification | Justification |
|---|---|---|---|---|---|---|
| G1 | robots rules | robots.ts:29-46 | 2 allow, 6 disallow, plus a block for user agent `nsa` (:43-44) | UC max (:26) | keep as code constant | Mirrors route structure. |
| G2 | Offer JSON-LD category and units | offers-json-ld.tsx:88, :115, :140 | "vCPU", "VPS Hosting", unitCode "MON" | SC inside UC max | keep as code constant | — |
| G3 | API contract strings | api/docs/page.tsx:67, 70-76, 148-149; description.md:5, 12 | version "1.0.0"; header `X-Virtbase-API-Key` | UC max | keep as code constant | The header is the API contract (`packages/api/src/trpc.ts:77`). |
| G4 | ServerHunter hardware, product and feature fields | api/serverhunter-pullapi.json/route.ts:52-73, :80-88 | setup_fee 0, vps, kvm, amd/EPYC ×1, ddr4/eccreg, 1 SSD, 7 feature flags | RH, UC days (:33), 1-day immutable (:98) | integration setting: serverhunter.* (proposed new listing-feed integration, with an enable flag) | The feed is always on today. |
| G5 | ServerHunter location | route.ts:76-78 | country NL, "Eygelshoven, Netherlands", coordinates | RH | remove (redundant, not dead): derive from `datacenters` | The table holds only name and country (`packages/db/src/schema/datacenters.ts:42-48`). |
| G6 | ServerHunter payment methods | route.ts:79 | 4 strings (altcoin, bitcoin, creditcard, paypal) | RH | integration setting: serverhunter.paymentMethods, defaulting to what the enabled payment integrations offer | Contradicts the terms (I4). |
| G7 | ServerHunter OS list | route.ts:74 | 5 strings (custom, ubuntu, debian, fedora, freebsd) | RH | remove (redundant): derive from the enabled templates | Contradicts H10. |

#### H. Commerce and product facts

| # | Item | Location | Value shape | Readers | Classification | Justification |
|---|---|---|---|---|---|---|
| H1 | Currency "EUR" | 14 literals in 11 files, plus offers-json-ld.tsx:26 (SC, UC max) and serverhunter route.ts:50 (RH) (list below the table) | string | as listed | app setting: billing.currency. Rows that carry their own currency must use it, as `subscription-detail.tsx:77-81` and `auto-renew-section.tsx:189` already do. | **HARD:** most readers are CCs. |
| H2 | Billing countries | stripe-payment-form.tsx:41-68 (used at :246) | 26 ISO codes (EU-27 without GR) | CC (checkout-form.tsx:67; plan-payment-step.tsx:21) | app setting: billing.allowedCountries | **HARD:** must be passed down as a prop. |
| H3 | Payment Element options | stripe-payment-form.tsx:247, 279-283; add-payment-method-form.tsx:180-181 | PO boxes blocked; terms shown "always" for card and SEPA; Link wallet "never" | CC | integration setting: stripe.paymentElement.* | Low priority. |
| H4 | AnonPay minimum amount | packages/integration-anonpay/src/constants.ts:21 (500 = €5.00), read at elements-provider.tsx:100 | integer cents | CC | integration setting: anonpay.minAmount | **HARD:** CC. The method id is inlined from env (constants.ts:26-27). |
| H5 | Hard-coded datacenter | offer-row.tsx:61-66 (marked "TODO: Make dynamic"); checkout/[id]/page.tsx:129-133; upsell/[from]/[to]/page.tsx:169-173 | `{id:"dc_1", name:"SkyLink Data Center", country:"NL"}` ×3 | SC: home and marketing pages (UC max), checkout, upsell (UC max) | remove (redundant, not dead): read the plan's datacenter from the DB | — |
| H6 | Network inclusion | offer-card.tsx:197; order-summary.tsx:119 | msgid "1 IPv4 + IPv6 /64 Subnet" | SC | app setting: servers.offer.includedNetwork (better as a plan column) | A product fact frozen into translations. |
| H7 | Storage type | offer-card.tsx:188; order-summary.tsx:110; plan-specs.tsx:81 (CC); offers-json-ld.tsx:79 | "NVMe SSD" ×4 | SC / CC | app setting: servers.offer.storageType | — |
| H8 | Traffic policy | offer-card.tsx:238, 243; order-summary.tsx:145 | "Unlimited traffic" plus a fair-use tooltip | SC | app setting: servers.offer.trafficPolicy | Also stated in terms.mdx:388-390 and index.mdx:68-70. |
| H9 | Monthly billing wording | offer-card.tsx:142; order-summary.tsx:176; plan-list.tsx:163; plan-summary.tsx:150, 158; plan-order-dialog.tsx:177 | "per month" / "one month" | SC / CC | keep as code constant | The billing model is monthly (`INTERVAL '1 month'` in packages/api). |
| H10 | OS showcase | features/landing/components/operating-system-showcase.tsx:20-41 (via ui/mdx/marketing-components.tsx:94) | 5 × {logo, name}: Debian, Ubuntu, CentOS, AlmaLinux, Fedora | SC inside UC max | remove (redundant): derive from the enabled templates and utils `OPERATING_SYSTEMS` | AGENTS.md says live data must not be copied. |
| H11 | Password length literals | password-requirements.tsx:40-41; user-password-card.tsx:112-113, 143-144; confirm-password-dialog.tsx:105-106; reset-password-form.tsx:103; signup-email.tsx:174; checkout-form.tsx:178 | 8 / 64 | CC | keep as code constant: import `PASSWORD_MIN/MAX_LENGTH` (`packages/auth/src/password-policy.ts:63-64`) | Duplicates; the values are equal today. |
| H12 | Sign-in and sign-up methods | features/auth/components/login-form.tsx:60-91; register/signup-form.tsx:25 | google, github, discord, email, passkey / email, google, github, discord | CC | app setting: accounts.authMethods | The buttons render even when the optional OAuth env vars are unset. **HARD:** CC. |

Currency literals in H1:
- **SC:** offer-card.tsx:126, 138; order-summary.tsx:165, 172
- **SC and CC:** format-discount.ts:45
- **CC:**
  - invoices-table/columns.tsx:95, plus unit "€" at :102
  - latest-invoices-list.tsx:105
  - plan-list.tsx:126
  - plan-summary.tsx:81
  - plan-order-dialog.tsx:94
  - current-plan-card.tsx:137 (fallback)
  - admin revenue-over-time.tsx:80, 104
- **SC (admin):** activity-stats-row.tsx:60

#### I. Geofeed

| # | Item | Location | Value shape | Readers | Classification | Justification |
|---|---|---|---|---|---|---|
| I1 | Geofeed location | geofeed.csv/route.ts:29 (`DE`), :34 (`DE-SN`), :39 (`Lichtenstein/Sachsen`), :45 (empty postal code); applied to every row at :99-102 | 4 constants | RH, UC days (:64), 1-day immutable (:108) | app setting: network.geofeed.{countryCode,regionCode,city,postalCode} (better as per-datacenter columns) | The IP ranges already come from the DB `subnets` table (top-level only, :70-95). The location used is the company's registered office, not the datacenter. |

#### J. Locales

| # | Item | Location | Value shape | Readers | Classification | Justification |
|---|---|---|---|---|---|---|
| J1 | Enabled locales | src/i18n/config.ts:20 | `["en","de","fr","nl"]` | LSP finds 41 references in 18 files (list below the table) | bootstrap/deploy config | **HARD:** used by GSP, the build-time header regex, the proxy, the `Locale` type and the MDX directories. 17 fully translated `.po` catalogs exist, so an "enabled subset" setting is feasible later. |
| J2 | Default and source locale | config.ts:22; next.config.ts:241 | "en" | — | bootstrap/deploy config | — |
| J3 | Search stemmer map | api/search/route.ts:23-28 | 4 locale → language entries | RH | keep as code constant | A second locale list that must grow with J1. |
| J4 | Crowdin mapping | crowdin.yml:1-10 (repo root) | 3 mappings | Crowdin | bootstrap/deploy config | Locales are directories. |

Readers of the locale list (J1):
- **GSP:**
  - (public)/[locale]/layout.tsx:36
  - app.virtbase.com/[locale]/layout.tsx:27
  - admin.virtbase.com/[locale]/layout.tsx:44
- **PX:**
  - proxy.ts:69
  - console-locale.ts:57, 64
  - ensure-locale-cookie.ts:33
- **Routing and request config:**
  - routing.public.ts:23
  - routing.console.ts:36
  - request.ts:111-160
- **Content and SEO:**
  - lib/source.ts:32, 145
  - hreflang.ts:41
  - default-json-ld.tsx:93
- **CC:** locale-switcher.tsx:96; locale-switcher-circle.tsx:78
- **Locale switching and cookies:** locale-switcher-action.ts:42; lib/auth/locale-cookie.ts:71
- **Types:** next-intl.d.ts:18, 22
- **Via `routing.locales`:** next.config.ts:143 (NC); sitemap.ts:76

#### K. Observability

| # | Item | Location | Value shape | Readers | Classification | Justification |
|---|---|---|---|---|---|---|
| K1 | Sentry sample rates | sentry.server.config.ts:24; sentry.edge.config.ts:24; instrumentation-client.ts:72-74 | traces 1.0 ×3; replay session 0.1; replay on error 1.0 | server and edge init; CB | bootstrap/deploy config | Initialised before the DB is reachable. The replay rate is a privacy decision the policy does not mention. |

#### L. Caching

| # | Item | Location | Value shape | Readers | Classification | Justification |
|---|---|---|---|---|---|---|
| L1 | `cacheLife("max")` on public content | 21 call sites in 13 files (list below the table) | "max" | UC | keep as code constant | Every settings-backed value read inside needs a tag that is revalidated on save. Existing tags: home, marketing, checkout, sitemap.xml, robots.txt, api-docs. |
| L2 | Feed and OG caches | geofeed.csv/route.ts:64, 108; serverhunter route.ts:33, 98; og/route.tsx:144 | "days" + 86400 immutable; 1-year immutable | RH | keep as code constant | External consumers cache these too. |

`cacheLife("max")` call sites in L1:
- **Home, marketing, legal and help pages:**
  - (public)/[locale]/page.tsx:40, 86
  - [...slug]/page.tsx:65, 108
  - legal/[[...slug]]/page.tsx:53, 95
  - help/article/[[...slug]]/page.tsx:66, 109
  - help/page.tsx:43, 71
  - contact/page.tsx:45, 73
- **Checkout and upsell:**
  - checkout/[id]/page.tsx:74
  - upsell/[from]/[to]/page.tsx:92, 141
  - checkout/return/page.tsx:52
- **Sitemap, robots, API docs:** sitemap.ts:59; robots.ts:26; api/docs/page.tsx:62
- **Checkout data:** get-available-plans.ts:26; get-server-plan.ts:27; get-template-groups.ts:38

#### M. MDX in packages/content (76 files: 4 locales × 19 documents)

How every row in this section is read:
- **Compile:** all MDX is compiled at build time by fumadocs-mdx (source.config.ts:22-58).
- **Legal pages:** legal/[[...slug]]/page.tsx — GSP at :36, UC max at :49-54 and :90-96. Its component map is only `defaultMdxComponents` plus Steps (:130-134).
- **Help articles:**
  - help/article/[[...slug]]/page.tsx — GSP at :49, UC max at :62-67 and :104-110, component map at :171-183.
  - The help text is also indexed for search at build time by api/search/route.ts:22.
- **Marketing pages:**
  - (public)/[locale]/page.tsx, UC max at :36-41 and :82-87.
  - [...slug]/page.tsx — GSP at :45, UC max at :61-66.
  - Both use the component map in ui/mdx/marketing-components.tsx.
- **Frontmatter:** feeds generateMetadata, the OG image and the sitemap.
- **FAQ answers:** become FAQPage JSON-LD via faq-section.tsx:56.

| # | Item | Location | Value shape | Classification | Justification |
|---|---|---|---|---|---|
| M1 | Company block | legal/*/notice.mdx:10-12; privacy.mdx:19-21; revocation.mdx:11 and 32-34 (de 33-35); terms.mdx:13 and 273-276 (de 274-277, fr 267-270); ×4 locales | legal name, street, postcode and town (plus country in terms) | keep in content (MDX), but parameterise company.legalName and company.address | **HARD:** compiled prose; the legal component map is minimal. |
| M2 | Register, VAT ID, seat, managing director | notice.mdx:14-24 ×4 | 4 fields | parameterise company.registerCourt / registerNumber / vatId / seat / managingDirector | — |
| M3 | General contact | notice.mdx:28-30 ×4 | support@ address + +49 phone number | parameterise support.email, support.phone | The phone number appears nowhere else. |
| M4 | TCO and DSA contact points | notice.mdx:32-40 ×4 | tco@, dsa@, languages "German, English" | parameterise legal.tcoContactEmail, legal.dsaContactEmail, legal.contactLanguages | — |
| M5 | Support e-mail in privacy and revocation | privacy.mdx:23; revocation.mdx:11, 36 (de 37) ×4 | e-mail | parameterise support.email | — |
| M6 | Tracking, consent and contact-form sections that describe nothing real | privacy.mdx:75 (cookie banner), 121-154 (contact form with 16 fields), 172-194 (Google Analytics, Google Ireland address, 2-year cookie, 14-month retention, opt-out link) ×4 | prose | remove: the code has no analytics or consent mechanism (no gtag, GTM or analytics dependency in apps/web) and the contact page has no form (contact/page.tsx:76-124) | Legal accuracy. |
| M7 | Sub-processor list | privacy.mdx:111-119 ×4 | 3 categories (IT, Logistics, Telecommunications) | keep in content (MDX), but parameterise the processor list from the enabled integrations and infrastructure vendors | See inconsistency I3. |
| M8 | Payment-provider clauses | terms.mdx:126-132 (Stripe), 250-252 (PayPal), 254-256 (SOFORT, with its Munich address), 258-260 (bank transfer / SEPA) ×4 (fr about 6 lines earlier) | prose + vendor address | parameterise by the enabled payment integrations | AnonPay is missing. |
| M9 | Platform URL in the terms | terms.mdx:167 and 268 (de 168/269, fr 163/262) ×4 | `https://app.virtbase.com` | parameterise the app domain | — |
| M10 | Governing law, jurisdiction, contract language, consumer arbitration | terms.mdx:149-151, 420-428; notice.mdx:42-44 ×4 | prose | keep in content (MDX); nothing to parameterise | Operator-authored legal text. |
| M11 | Statutory and contractual periods | revocation.mdx:8-10, 21 (14 days); terms.mdx:69-70 (4 weeks / 3 business days), 115-122 (5-day acceptance), 364-366 (domains for at least 1 year) ×4 | numbers in prose | keep in content (MDX); nothing to parameterise | The domain clauses (13.3-13.5) describe a product that apps/web does not have. |
| M12 | Brand name in prose and frontmatter | 552 occurrences of "Virtbase" across all 76 files (legal 344, help 125, marketing 83); 88 frontmatter title/description lines | brand | parameterise app.name | **HARD:** frontmatter is static YAML (needs substitution in generateMetadata, all UC max). The terms use "Virtbase" as a defined party name (terms.mdx:13). |
| M13 | Absolute production URLs | 80 total (breakdown below the table) | URLs | parameterise (relative links or an `<AppLink path>` component) | **HARD:** public-api.mdx:54-57 sits inside a code fence. |
| M14 | Support claims and addresses in marketing | index.mdx:44-46 ("around the clock"), 88-90 (24/7 plus support@); open-source.mdx:62 (Stat "48h"), 98-101, 166-170 ×4 | e-mail + response-time claims | parameterise support.email, support.hours, security.disclosureEmail, security.disclosureResponseHours | **HARD:** FAQ answers go through `toPlainText` (ui/mdx/plain-text.ts:48-63), which drops any component without children, so a `<SupportEmail/>` would vanish from the JSON-LD. |
| M15 | Datacenter facts | marketing/*/datacenter.mdx (name and location :3, 15-25, 44-50; operator address :109-110; exchanges :82-83, 140; diagrams :62, 76, 90); index.mdx:92-94; ddos-protection.mdx:86 (inside a code fence) ×4 | prose + 3 SVG diagrams per locale | keep in content (MDX), but parameterise the datacenter name and location from `datacenters` | **HARD:** code fence; the text targets a different market per locale. |
| M16 | DDoS vendor | help/*/about-ddos-protection.mdx:8; marketing/*/ddos-protection.mdx:3, 47, 64, 80, 163 ×4 | vendor name (aurologic) | keep in content (MDX); nothing to parameterise | Also an unlisted processor. |
| M17 | API rate-limit claims | public-api.mdx:3, 22, 101, 114, 196 ×4; how-to-use-public-api.mdx:40 ×4; api/docs/description.md:48 | 120/min, 2/s | parameterise from `packages/api/src/upstash/ratelimit.ts:23,29` | See I9. |
| M18 | Policy numbers in help articles | how-to-renew-server.mdx:8, 19, 25, 30 (de 8, 24, 30, 35); how-to-change-operating-system.mdx:36; discord-integration.mdx:73; manage-from-discord.mdx:93 (de 96, nl 97, fr 99); how-to-backup-server.mdx:31; how-to-delete-account.mdx:17, 25; ×4 | 5 days, 30 days, 3 ISOs, 10 s, 5 min, "immediate" | parameterise from utils limits.ts:24, 29, 129 and packages/api console.ts:39 | Several are already wrong (I6-I8). |
| M19 | Language count and list | open-source.mdx:58 (Stat "4"), 105 (de/fr/nl :108) ×4 | number + names | parameterise from the locale list | — |
| M20 | Source repository and translation portal | open-source.mdx:43 (`git clone` of the GitHub repo, inside a code fence), 106, 163 ×4 | 2 URLs | parameterise app.links.sourceRepositoryUrl and app.links.translationPortalUrl | Under AGPL §13 a modifying operator must point users to its own source. **HARD:** code fence. |
| M21 | "€0" price stats | ddos-protection.mdx:26; public-api.mdx:34 ×4 | currency literal | keep in content (MDX); nothing to parameterise | — |
| M22 | Help videos | help/articles/de/how-to-backup-server.mdx:13-17; how-to-change-operating-system.mdx:39-43; how-to-use-server-firewall.mdx:14-18 | 3 YouTube IDs + posters (German only) | keep in content (MDX); nothing to parameterise | Operator's own channel. |
| M23 | Security-posture claims | help/*/about-security.mdx:12-28; open-source.mdx:75-77; datacenter.mdx:94-102 ×4 | HSTS, CSP, SHA-384 SRI, self-hosted fonts, TPM/BIOS lock, LUKS2 | keep in content (MDX); nothing to parameterise | The SRI claim matches next.config.ts:48-50. "Fonts are self-hosted" conflicts with D12. |

The 80 absolute URLs in M13 (counts across all 4 locales):
- **56 to app.virtbase.com:**
  - help articles: 10 per locale
  - terms: 2 per locale
  - manage-from-discord.mdx:109
  - public-api.mdx:148
- **16 to virtbase.com:** public-api.mdx:55, 173, 208; how-to-use-public-api.mdx:32
- **8 to crowdin.virtbase.com:** open-source.mdx:106, 163

#### N. packages/ui/src

| # | Item | Location | Value shape | Readers | Classification | Justification |
|---|---|---|---|---|---|---|
| N1 | Logo | logo.tsx:20-46 | single-path SVG using currentColor | footer.tsx:50 (SC-shell); nav.tsx:60 (CC); app-sidebar.tsx:51 (SC); admin-sidebar.tsx:49 (SC); colored-layout.tsx:68 (SC); og/route.tsx:103 (RH, rendered by satori); iso-catalog-grid.tsx:198 (CC) | app setting: branding.logo | **HARD:** OG rendering, client readers, currentColor theming. |
| N2 | Wordmark | wordmark.tsx:20 | SVG | none | remove: LSP `findReferences` returns only the definition | Dead code. |
| N3 | Social and provider icons | icons/{discord,github,google,instagram,twitter,youtube}.tsx | 6 SVG components | lib/socials.ts:17-23; auth buttons | keep as code constant | Must cover SOCIALS and the OAuth providers. |

#### Hard to move: summary

1. **Build time.**
   - The CSP and all headers, redirects and rewrites in next.config.ts (A2-A6, section B).
   - MDX compilation (section M).
   - File-convention icons (D7).
   - Module-level metadata: `ui/document.tsx:47` (re-exported by `(public)/[locale]/layout.tsx:30-33` and the app layout) and `api/docs/page.tsx:125`.
2. **Deploy time.** The vercel.json crons (A9).
3. **Proxy.** Host routing and locales (C1, J1). These stay bootstrap configuration.
4. **Static shells and `cacheLife("max")`.**
   - Public layout: `DefaultJsonLd`, `Footer` and `Nav` are prerendered per locale.
   - The admin console shell is deliberately free of request-time reads (`admin.virtbase.com/[locale]/layout.tsx:33`).
   - Every public page, the sitemap, robots, the API docs, and the immutable manifest and OG image.
5. **Client components.**
   - D1 (4 readers), D2, D3, D8, D12.
   - H1 (most readers), H2-H4, H11, H12.
   - E11, E13, F9.
   - N1 (nav, ISO catalog).
   - Client bundle: F2, K1.
6. **GSP and sitemap.** The locale list, and the legal/help/marketing GSP that iterate the collections.
7. **MDX.**
   - Each of the three collections has its own component map that would need extending.
   - Frontmatter needs a substitution step in generateMetadata.
   - Code fences cannot hold components.
   - FAQ answers go through `toPlainText`, which drops children-less components.
   - Crowdin has to preserve any placeholders.
   - The search index is built from build-time text.
8. **Translations.** The legal name sits inside a msgid in 17 `.po` catalogs (E10), and 17 msgids contain the literal brand (D3).

**Observation:** the legal documents will differ in substance between operators, not just in a few fields. A DB-backed, admin-editable document per locale is a better target than templating German-law texts. The privacy policy has to be rewritten regardless (I3).

#### (1) Shared settings: values needed in more than one place or package

1. **company.legalName**
   - Legal MDX ×4 locales: notice.mdx:10; privacy.mdx:19; revocation.mdx:11, 32; terms.mdx:13, 273.
   - footer.tsx:246 (and all 17 `.po` catalogs).
   - default-json-ld.tsx:50, with the short form at :48 and :91.
   - packages/email/src/templates/footer.tsx:136.
   - Candidate for the Stripe business name (D2).
2. **company.address**
   - Legal MDX ×4 (M1).
   - default-json-ld.tsx:51-58.
   - packages/email/src/templates/footer.tsx:138.
   - geofeed.csv/route.ts:29-45, which uses the registered office.
3. **company.registerCourt, company.registerNumber, company.vatId, company.managingDirector**
   - notice.mdx:14-24 ×4.
   - default-json-ld.tsx:59, 67-74.
   - packages/email/src/templates/footer.tsx:142.
4. **support.email**
   - Readers of `SUPPORT_EMAIL`, listed in F1.
   - packages/integration-anonpay/src/adapter.ts:82.
   - packages/api/src/router/checkout.ts:612.
   - packages/email/src/send-via-resend.ts:93 and templates/server-ready.tsx:121.
   - Hard-coded copies:
     - security.txt:1 and instrumentation-client.ts:56
     - MDX ×4 locales: notice.mdx:29; privacy.mdx:23; revocation.mdx:11, 36; index.mdx:89; open-source.mdx:99, 167
5. **app.name**
   - apps/web readers: D1.
   - packages/email: about 25 templates plus translations/index.ts:115.
   - packages/auth: plugins/index.ts:171, 175 and index.ts:119.
   - packages/api: privacy/export/brand.ts:108, privacy/export/document.ts:152, router/checkout.ts:608, 619.
   - packages/integration-anonpay/src/adapter.ts:89.
   - packages/integration-lexware/src/adapter.ts:113, 127.
   - Literal copies: D2, D3, D4, D13, M12.
6. **social.\***
   - lib/socials.ts:33-59 → footer.tsx:53, app-footer.tsx:29, default-json-ld.tsx:80.
   - contact/page.tsx:85.
   - packages/email/src/templates/socials.tsx:34-40 (separate list); email footer.tsx:110 (Trustpilot).
7. **billing.currency**
   - H1, offers-json-ld.tsx:26, serverhunter route.ts:50.
   - integration-anonpay constants.ts:21.
   - The MDX "€0" stats ×8.
   - packages/api router/checkout.ts:610 already uses `order.currency`.
8. **Datacenter facts**
   - H5 (×3), G5.
   - Geofeed, which must use them.
   - M15 and index.mdx:93.
   - DB `datacenters` table.
9. **Locales**
   - J1 readers.
   - search/route.ts:23-28.
   - open-source.mdx:58, 105.
   - The Apple badges, the MDX locale directories, crowdin.yml.
   - default-json-ld.tsx:93.
10. **App domains**
    - C1.
    - The 80 MDX URLs (M13).
    - description.md (C3) and security.txt:4.
    - The Sentry host in the CSP (B5).
    - utils `VIRTBASE_EMAIL_ASSETS` (main.ts:31), which uses the production host for e-mail images served from apps/web/public.
11. **Legal page slugs.** The E14 readers plus packages/email/src/templates/footer.tsx:125.
12. **security.disclosure\*.** security.txt:1-3; instrumentation-client.ts:56; open-source.mdx:62, 98-101, 166-170.
13. **Source repository URL.** `GITHUB_URL` (feeds the footer, JSON-LD and e-mail socials) and open-source.mdx:43.
14. **Brand assets.**
    - Logo readers (N1).
    - Icons (D7).
    - bimi.svg (D8).
    - wordmark.png and social/*.png, sent in e-mails via `VIRTBASE_EMAIL_ASSETS` (main.ts:31-33; email socials.tsx:54).
15. **API rate limit.** `packages/api/src/upstash/ratelimit.ts:23,29`, restated in description.md:48 and M17.
16. **Policy durations.**
    - In code: utils limits.ts:24 (5 days), :29 (3 ISOs), :98 (10 years), :129 (14 days); packages/api console.ts:39 (300 s).
    - Restated in M18 and in delete-account-card.tsx:182-195.
17. **Payment methods.**
    - In the terms (M8).
    - The ServerHunter feed (G6).
    - elements-provider.tsx:98-111 (AnonPay).
    - stripe-payment-form.tsx:267-285.
18. **Tagline and description.** manifest.ts:25; discord-bot-demo.tsx:158; index.mdx:8, 10; default-json-ld.tsx:49.

#### (2) Duplicates and inconsistencies

- **I1. Datacenter name.**
  - Written "SkyLink Data Center" in offer-row.tsx:64, checkout/[id]/page.tsx:131, upsell/[from]/[to]/page.tsx:171 and datacenter.mdx:3, 17, 109.
  - Written "Skylink Datacenter" in index.mdx:93 (all 4 locales).
  - The DB schema example says "Skylink Data Center" (datacenters.ts:40).
  - The literal id `"dc_1"` ignores the real DB row.
- **I2. Geofeed location.** It places every subnet in DE-SN / Lichtenstein (geofeed.csv/route.ts:29-39), while the servers are in Eygelshoven, NL (datacenter.mdx; serverhunter route.ts:76-78; H5).
- **I3. Privacy policy against the code.**
  - It describes three things that do not exist:
    - Google Analytics (privacy.mdx:172-194)
    - a cookie banner and settings dialog (:75, :194)
    - a contact form (:121-154)
  - It omits vendors that the code actually uses:
    - Stripe (csp:128-148)
    - Sentry, including 10% session replay (instrumentation-client.ts:73)
    - YouTube (video.tsx:68)
    - Google Fonts inside the Stripe iframe (elements-provider.tsx:117-118)
    - Libravatar (csp:112)
    - Discord, GitHub and Google OAuth
    - Vercel (csp:93-104)
    - aurologic (about-ddos-protection.mdx:8)
    - AnonPay
    - Resend
  - The YouTube notice in video.tsx:100-108 links to this policy, which does not mention YouTube.
- **I4. Payment methods.**
  - The terms list Stripe, PayPal, SOFORT and bank transfer/SEPA (terms.mdx:126-132, 250-260).
  - The code offers the Stripe Payment Element plus AnonPay crypto (elements-provider.tsx:98-111); crypto is not in the terms.
  - The ServerHunter feed advertises altcoin, bitcoin, creditcard and paypal (route.ts:79).
- **I5. Operating systems.** The showcase lists Debian, Ubuntu, CentOS, AlmaLinux and Fedora (operating-system-showcase.tsx:20-41). The ServerHunter feed lists custom, ubuntu, debian, fedora and freebsd (route.ts:74). Neither comes from the templates in the DB.
- **I6. Console-link expiry.**
  - The content says links expire after "ten seconds": discord-integration.mdx:73 (×4), and manage-from-discord.mdx en:93, de:96, nl:97, fr:99.
  - The code uses `CONSOLE_PAYLOAD_TTL_SECONDS = 5*60` (packages/api/src/router/servers/console.ts:39).
  - The Discord bot goes through the same router (packages/api/src/integrations/server-management.ts:179).
- **I7. Renewal term.**
  - The help article says a server is renewed for "another 30 days" (how-to-renew-server.mdx en:19, de:24).
  - The code extends by a calendar month (store-server-extension.ts:206; the UI says "one month" in plan-summary.tsx:158).
  - The article also says a server is suspended at the end of its term (:27). That ignores the auto-renewal retry schedule and its 8-day grace before suspension (utils limits.ts:179, 209).
- **I8. Account deletion.**
  - The help article says deletion is immediate and removes all data (how-to-delete-account.mdx:17, 25, ×4).
  - The code applies a 14-day grace period and keeps invoices for 10 years (limits.ts:98, 129; delete-account-card.tsx:182-195).
- **I9. Rate limit.**
  - The content says the limit applies "per key" (public-api.mdx:196; how-to-use-public-api.mdx:40).
  - The code keys the limit on the user id (packages/api/src/trpc.ts:200).
  - The French help article says "= 1 requête par seconde" (fr/how-to-use-public-api.mdx:40), where every other locale says 2 per second.
- **I10. JSON-LD against the legal notice.**
  - The founder's jobTitle is "CEO" (default-json-ld.tsx:72); the notice says "Managing Director" (notice.mdx:23).
  - The alternate name drops the legal-form suffix (:48, :91).
  - The tax number and DUNS appear only in the JSON-LD (:60, :65); the phone number appears only in the notice (:30).
  - The region is written three ways: "Saxony", "Lichtenstein/Sa." and "Lichtenstein/Sachsen" (geofeed :39).
- **I11. Support address hard-coded.** security.txt:1 and instrumentation-client.ts:56 bypass `SUPPORT_EMAIL`. Security reports go to the general support mailbox in 3 places (also open-source.mdx:99, 167).
- **I12. Brand name hard-coded.** D2, D3, D4, D13 and 552 MDX occurrences bypass `APP_NAME`.
- **I13. Theme colours.**
  - manifest.ts:28-29: `#000000` / `#ffffff`.
  - document.tsx:42-43: `#0a0a0a` / `#ffffff`.
  - elements-provider.tsx:126: `#0a0a0a` / `#ffffff`.
- **I14. Description wording.** default-json-ld.tsx:49 says "is your provider"; index.mdx:10 says "is the provider".
- **I15. Locales.** Four are enabled (config.ts:20) while 17 complete `.po` catalogs exist. The MDX and the App Store badges cover 4 locales, and open-source.mdx:58 hard-codes "4".
- **I16. Billing countries.**
  - Greece (GR) is missing from the 26-country list (stripe-payment-form.tsx:41-68).
  - The marketing copy targets Switzerland (datacenter.mdx en:48-50; de/fr :50), but Swiss customers cannot enter a billing address.
- **I17. Password limits.** 8/64 is written into 6 client files (H11) instead of using `packages/auth/src/password-policy.ts:63-64`.
- **I18. Social lists.** There are two lists in different orders: apps/web lib/socials.ts:33-59 and packages/email socials.tsx:34-40.
- **I19. Sentry host.** The CSP hard-codes the self-hosted Sentry host (csp:120), while `SENTRY_URL` and the DSN come from env (next.config.ts:263).
- **I20. Copyright year.** The footer year is the literal "2026" (footer.tsx:248).
- **I21. API docs domain.** description.md:7 and :61-64 always point at the production host, while the OpenAPI `baseUrl` follows `PUBLIC_DOMAIN` (page.tsx:68).
- **I22. security.txt expiry.** `Expires: 2034` (security.txt:2) is far beyond RFC 9116's advice of less than one year.
- **I23. Domain clauses.** terms.mdx:360-370 (sections 13.3-13.5) cover domain registration, but no domain product exists in apps/web/src/features.
- **I24. Abuse contact.** The abuse desk receives mail at abuse@ (comment at resend/webhook/route.ts:32), but neither the legal notice nor any help page publishes an abuse contact.
- **I25. VAT, traffic and storage statements repeated.**
  - VAT appears twice: checkout/[id]/page.tsx:180 and terms.mdx:244.
  - Traffic policy appears 3 times: H8, terms.mdx:388-390, index.mdx:68-70.
  - "NVMe SSD" appears 4 times (H7).

#### (3) Totals per classification (110 rows)

| Classification | Rows | Which rows |
|---|---|---|
| app setting | 38 | D: 10, E: 13, F: 7, H: 6, I: 1, N: 1 |
| integration setting | 5 | B3 (novnc), G4 and G6 (serverhunter, proposed new), H3 (stripe), H4 (anonpay) |
| keep as code constant | 24 | A: 4, B: 3, C: 1, D: 3, E: 1, F: 3, G: 3, H: 2, J: 1, L: 2, N: 1 |
| keep in content (MDX), but parameterise | 16 | M1-M5, M7-M9, M12-M15, M17-M20 |
| keep in content (MDX), nothing to parameterise | 6 | M10, M11, M16, M21-M23 |
| bootstrap/deploy config | 15 | A: 6, B: 3, C: 2, J: 3, K: 1 |
| remove | 6 | 1 dead code (N2), 1 content describing absent features (M6), 4 redundant copies of DB data (G5, G7, H5, H10) |

Proposed setting keys, about 50 in total:

**App settings**
- **app:**
  - `app.name`, `app.tagline`
  - `app.links.lookingGlassUrl`, `app.links.iosAppStoreUrl`, `app.links.sourceRepositoryUrl`, `app.links.translationPortalUrl`
- **branding:** `branding.logo`, `branding.logoMark`, `branding.icons`, `branding.themeColor`, `branding.backgroundColor`
- **company:**
  - `company.legalName`, `company.address.*`, `company.seat`
  - `company.registerCourt`, `company.registerNumber`, `company.vatId`, `company.taxNumber`, `company.dunsNumber`
  - `company.foundingDate`, `company.managingDirector.*`, `company.employeeRange`
- **support:** `support.email`, `support.phone`, `support.hours`
- **security:**
  - `security.disclosureEmail`, `security.disclosureResponseHours`
  - `security.txt.expires`, `security.txt.preferredLanguages`
- **social:** `social.youtubeUrl`, `social.discordInviteUrl`, `social.xUrl`, `social.instagramUrl`, `social.githubUrl`
- **seo:** `seo.alternateNames`, `seo.organizationDescription`
- **legal:**
  - `legal.jurisdiction`, `legal.requireWithdrawalWaiver`
  - `legal.tcoContactEmail`, `legal.dsaContactEmail`, `legal.contactLanguages`
- **billing:** `billing.currency`, `billing.allowedCountries`, `billing.pricesIncludeTax`
- **servers:** `servers.offer.includedNetwork`, `servers.offer.storageType`, `servers.offer.trafficPolicy`
- **accounts:** `accounts.authMethods`
- **network:** `network.geofeed.*`

**Integration settings**
- `anonpay.minAmount`
- `stripe.paymentElement.*`
- `serverhunter.*` (new integration)
- `novnc.clientUrl` (new integration)

#### Borderline items left out of the tables

- **`features/checkout/constants.ts:31` `PAYMENT_FORM_ID`:** a DOM id.
- **`lib/middleware/utils/missing-content.ts:20` `ROUTED_SEGMENTS`:** route structure.
- **next.config.ts plumbing:**
  - :61-97 COOP, Permissions-Policy, Referrer-Policy and X-* headers
  - :100-114 admin noindex
  - :162 image TTL
  - :205-217 legacy `/api/v1/kvm` rewrite
  - :224-236 extraction source paths
  - :218-219 package lists
- **csp:72-87 (default policy) and :161-164 (Scalar `blob:`):** code.
- **sitemap.ts:68-73 page list:** route structure.
- **Query and polling tuning:**
  - trpc/query-client.ts:102 (stale time 30 s)
  - trpc/react.tsx:95-96 (retry backoff)
  - use-server-status.ts:35 (5 s)
  - use-server-graphs.ts:35 (30 s)
  - backups-table/columns.tsx:190 (5 s)
  - server-custom-image-select.tsx:50 (3 s)
- **features/admin/api/verify-session.ts:61 (300 s admin verdict cache):** coupled to Better Auth's cookie cache.
- **Admin list caches such as get-users-list.ts:30:** technical.
- **Cron throughput tuning:** batch sizes in detect-guest-os/route.ts:36 and reconcile-server-backups/route.ts:30 (200 each); `maxworkers` 10 and `SUSPENSION_BATCH_SIZE` 200 in packages/api/src/subscriptions/suspend-terminated-servers.ts.
- **i18n/config.ts:29, 31 (locale cookie name, 1-year lifetime) and i18n/utils.ts:21 (en shows the US flag):** code.
- **random-password-addon.tsx:26 (generated password length 12):** could become a security setting later.
- **feedback-button.tsx:52-62 and lib/sentry.ts:18 (scrubbed-header list):** code.
- **"Shared" uplink fallback (offer-card.tsx:216; untranslated literal in order-summary.tsx:135):** derived from the plan's bandwidth.
- **Demo data in discord-bot-demo.tsx and server-stats-demo.tsx:** illustrative.
- **Admin form placeholders:** create-datacenter-dialog.tsx:100, 117; create-node-group-dialog.tsx:101; create-node-dialog.tsx:193, 234; template image URLs.
- **Vendor deep links:**
  - Stripe dashboard link in users-table/columns.tsx:324 assumes live mode.
  - Proxmox UI link in servers-table/columns.tsx:309.
- **api/docs/tags/*.md:** 8 empty files read by page.tsx:88-97.
- **packages/ui UI constants:** sidebar.tsx:45-50, hooks/use-mobile.ts:20; config/data-table.ts uses untranslated labels, which is an i18n gap rather than config.
- **e2e/support/urls.ts:31-33:** test origins, overridable through env.
- **scripts/dev/seed-fixtures.ts:89-92 and scripts/dev/seed.ts:64:** dev fixtures.
- **src/app/.well-known/workflow/\*\*:** generated.
- **checkout/return/page.tsx:75 `KNOWN_STATUSES`:** Stripe's status enum.

### 2.3 Libraries, integrations, novnc-proxy, scripts and tooling

**Method.** References were found two ways:
- word-boundary grep on each identifier across `packages/`, `apps/`, `scripts/` and `tooling/`, skipping node_modules, .next, .source, drizzle snapshots and coverage, and dropping import lines and comments;
- LSP `findReferences` as a cross-check on SUPPORT_EMAIL, HOME_COUNTRY, Discord `commands`, TRUSTPILOT_PROFILE_URL, Resend `subscribe`, `SettingsStore` and `defineSettings`. LSP and grep agreed every time.

**How "client" was decided.** A file counts as client if it has a `"use client"` directive, or if a file with one imports it (checked one level deep).

**Credentials.** Lexware contact UUIDs, the Trustpilot token, VAT and tax ids, and the dev-cluster password are described, not reproduced.

#### Legend

**Path prefixes**

| Prefix | Path |
|---|---|
| `utils/` | packages/utils/src/ |
| `val/` | packages/validators/src/ |
| `db/` | packages/db/src/ |
| `email/` | packages/email/src/ |
| `tpl/` | packages/email/src/templates/ |
| `cfg/` | packages/config/src/ |
| `sdk/` | packages/integration-sdk/src/ |
| `ports/` | packages/ports/src/ |
| `lex/` `anon/` `stripe/` `disc/` `pdns/` `aipdb/` `am/` `prom/` `wh/` | packages/integration-{lexware, anonpay, stripe, discord, powerdns, abuseipdb, alertmanager, prometheus, webhook}/src/ |
| `api/` | packages/api/src/ |
| `auth/` | packages/auth/src/ |
| `web/` | apps/web/src/ |
| `web-scripts/` | apps/web/scripts/ |
| `web-e2e/` | apps/web/e2e/ |
| `nv/` | apps/novnc-proxy/src/ |
| `content/` | packages/content/ |

**Context tags**

| Tag | Meaning |
|---|---|
| [srv] | server module |
| [init] | evaluated at module load or while a config object is built |
| [rsc] | server component |
| [route] | route handler |
| [proxy] | Next proxy or middleware |
| [build] | next.config.ts (build time) |
| [act] | server action |
| [cli] | client component, or a module bundled into one |
| [tpl] | email template. Templates are async; `Footer` and `Socials` are synchronous children. |
| [int] | integration code |
| [wf] | Workflow DevKit step |
| [zod] | zod schema at module scope |
| [nv] | compiled novnc-proxy binary (no DB access) |
| [script] | dev or ops script |
| [test] | test only |

"AWKWARD:" in a Justification marks a call site where an async, DB-backed read would be awkward. R1 to R8 refer to the reader appendix at the end.

---

#### packages/utils

| # | Item | Location | Value shape | Readers (context) | Classification | Justification |
|---|---|---|---|---|---|---|
| U1 | APP_NAME fallback | utils/constants/main.ts:18 | string "Virtbase"; env NEXT_PUBLIC_APP_NAME overrides | R1, about 60 sites | app setting: branding.name | The brand. AWKWARD: [init] better-auth passkey rpName and TOTP issuer (auth/plugins/index.ts:171,175) and appName (auth/index.ts:119); [cli] web/ui/nav.tsx:61, register/page-client.tsx:44, user-id-card.tsx:50, server-id-card.tsx:61; the synchronous constructMetadata default. |
| U2 | SUPPORT_EMAIL | main.ts:24 | string "support@virtbase.com" | api/router/checkout.ts:612 [srv]; anon/adapter.ts:82 [int]; email/send-via-resend.ts:93 [srv]; tpl/server-ready.tsx:121; web/ui/app-sidebar.tsx:86, web/ui/seo/default-json-ld.tsx:42,63, web/app/(public)/[locale]/contact/page.tsx:97, web/app/api/docs/page.tsx:85 [rsc] | app setting: support.email | Instance contact address. Also hard-coded in content MDX (see the duplicates list). |
| U3 | VIRTBASE_EMAIL_ASSETS | main.ts:31 | URL "https://virtbase.com/assets/static" | main.ts:33 (derives U4); tpl/socials.tsx:54 | app setting: branding.emailAssetsBaseUrl | A white-label instance must not load mail images from virtbase.com. It deliberately does not follow PUBLIC_DOMAIN (main.ts:26-30). AWKWARD: `Socials` is a sync child. |
| U4 | VIRTBASE_WORDMARK | main.ts:33 | URL `<U3>/wordmark.png` | 25 templates, at the header `<Img>` (R2) | app setting: branding.emailLogoUrl | Logo in every email. Needs an uploaded asset or a URL. |
| U5 | PUBLIC_DOMAIN non-env literals | main.ts:35-40 | dev fallback "http://virtbase.localhost:3000"; preview prefix "https://staging." | R3, about 45 sites incl. [build] and [cli] | keep as code constant | Env-derived bootstrap. The literals are dev/preview topology, needed at build time, in the proxy and in client bundles before any DB read. |
| U6 | PUBLIC/APP/ADMIN/API_HOSTNAMES | main.ts:42-47, 49-54, 63-68, 77-82 | 4 Sets, each with 2 env-derived entries and "\<sub\>.virtbase.localhost[:3000]" | auth/index.ts:122-124 [init]; utils/functions/get-safe-redirect-url.ts:25 (module-level set; 12 callers in web/lib/middleware/{app,admin}.ts [proxy], web/lib/auth/client.ts, web/features/auth/components/*, 7 of them [cli]); web/proxy.ts:54,58,62 [proxy]; web/ui/nav-user.tsx:131 [cli] | keep as code constant | Bootstrap and dev hostnames, read synchronously in the proxy, in auth init and in client redirects. |
| U7 | APP/ADMIN/API_DOMAIN literals | main.ts:56-61, 70-75, 84-89 | prefixes "app." / "admin." / "api."; "staging." infix; dev fallbacks `http://<sub>.virtbase.localhost:3000` | APP_DOMAIN: R4. ADMIN_DOMAIN: auth/plugins/index.ts:172 [init], api/notifications/deliver.ts:181 [srv], apps/web/next.config.ts:105,198 [build], web/ui/nav-user.tsx:133,152 [cli], web/lib/csp/index.ts:90. API_DOMAIN: web/lib/csp/index.ts:90 | keep as code constant | Same as U5. The subdomain topology is fixed by app routing. |
| U8 | COOKIE_DOMAIN fallback | utils/constants/cookies.ts:18-20 | ".virtbase.localhost" when VERCEL_URL is unset | auth/index.ts:91,94 [init]; web/ui/locale-switcher-action.ts:48 [act]; web/lib/middleware/ensure-locale-cookie.ts:41 [proxy]; web/lib/auth/locale-cookie.ts:74; web/i18n/routing.console.ts:41, routing.public.ts:27 (also shipped to the client); web-e2e/support/auth.ts:62 [test] | keep as code constant | Env-derived plus a dev literal. Note it keys on the Vercel-specific VERCEL_URL. |
| U9 | DISCORD_INVITE_URL | utils/constants/urls.ts:18 | discord.gg invite URL | tpl/socials.tsx:35; web/lib/socials.ts:42; web/app/(public)/[locale]/contact/page.tsx:85 [rsc] | app setting: support.discordInviteUrl | The instance's community server. An empty value hides it. |
| U10 | APPLE_APP_STORE_ID | urls.ts:20 | numeric string | urls.ts:22; utils/functions/construct-metadata.ts:117 (itunes meta) [srv] | app setting: branding.appleAppStoreId | The instance's iOS app. Empty must suppress the meta tag and the badge. |
| U11 | APPLE_APP_STORE_URL | urls.ts:22 | URL template with slug "virtbase" + U10 | web/ui/get-on-app-store.tsx:28 [rsc] | app setting: branding.appleAppStoreUrl | Brand slug is baked in. |
| U12 | LOOKING_GLASS_URL | urls.ts:24 | URL "https://lg.virtbase.com" | web/ui/footer.tsx:182 [rsc] | app setting: support.lookingGlassUrl | Network tool specific to the operator. |
| U13 | YOUTUBE_URL | urls.ts:26 | URL | tpl/socials.tsx:38; web/lib/socials.ts:37 | app setting: branding.social.youtube | web/lib/socials.ts feeds web/ui/socials-row.tsx:27 and the JSON-LD `sameAs` at web/ui/seo/default-json-ld.tsx:80. |
| U14 | X_URL | urls.ts:28 | URL (handle virtbasecom) | tpl/socials.tsx:36; web/lib/socials.ts:47 | app setting: branding.social.x | The handle is repeated in U47. |
| U15 | INSTAGRAM_URL | urls.ts:30 | URL | tpl/socials.tsx:37; web/lib/socials.ts:52 | app setting: branding.social.instagram | Social profile. |
| U16 | GITHUB_URL | urls.ts:32 | URL github.com/virtbase | tpl/socials.tsx:39; web/lib/socials.ts:57 | app setting: branding.social.github | Shown as the instance's social link. |
| U17 | TRUSTPILOT_REVIEW_URL | urls.ts:39-40 | Trustpilot "evaluate" URL | tpl/footer.tsx:110, rendered only where `showReview` is set: tpl/invoice-created.tsx:111, server-ready.tsx:112, server-renewal-reminder.tsx:102, server-extended.tsx:92 | integration setting: trustpilot.reviewUrl (proposed new) | Third-party review profile. The integration's enable flag must gate `showReview` and AFS (E2). |
| U18 | TRUSTPILOT_PROFILE_URL | urls.ts:42-43 | URL | none (LSP finds only the declaration) | remove | Dead export. |
| U19 | MAX_SSH_KEYS_PER_USER | utils/constants/limits.ts:18 | number 100 | api/router/ssh-keys.ts:245 [srv]; ssh-keys.test.ts:95 [test] | app setting: accounts.maxSshKeys | Quota. |
| U20 | SERVER_DELETION_GRACE_PERIOD_DAYS | limits.ts:24 | number 5 (days) | utils/functions/server-state.ts:84 (sync helper used by web/features/servers/components/server-status-bar.tsx:57 [cli] and web/features/dashboard/components/server-status-small.tsx:62,86 [cli]); tpl/server-deleted.tsx:86, renewal-final-warning.tsx:164, server-renewal-reminder.tsx:85, server-suspended.tsx:90; web/app/api/cron/delete-suspended-servers/route.ts:67 [route], send-renewal-notifications/route.ts:80,88 [route] | app setting: servers.deletionGracePeriodDays | Core lifecycle policy. Also reused as the renewal-reminder lead time. AWKWARD: sync helper inside client components; inlined via `sql.raw`. |
| U21 | MAX_ACTIVE_ISO_DOWNLOADS_PER_USER | limits.ts:29 | number 3 | api/router/iso/index.ts:248 [srv]; web/features/account/components/custom-images/custom-images-card.tsx:60 [rsc]; web-scripts/video/iso.ts:254 [script] | app setting: servers.isoDownloads.maxActivePerUser | Quota. |
| U22 | MAX_ISO_DOWNLOAD_SIZE_BYTES | limits.ts:34 | number 10 GiB | api/router/iso/index.ts:266 [srv]; web/features/account/components/custom-images/create-custom-image-dialog.tsx:205 [cli] | app setting: servers.isoDownloads.maxSizeBytes | Storage quota. AWKWARD: client dialog, so it needs a prop. |
| U23 | ISO_DOWNLOAD_EXPIRATION_MINUTES | limits.ts:39 | number 60 (min) | api/router/iso/index.ts:337 [srv]; web-scripts/video/iso.ts:405,616 | app setting: servers.isoDownloads.expirationMinutes | Retention of customer ISOs. |
| U24 | BACKUP_STALE_AFTER_HOURS | limits.ts:46 | number 12 (h) | api/backups/reconcile-backup.ts:201,225 [srv]; tests | keep as code constant | Reconciliation internal, tied to how long the PVE task index lives (limits.ts:41-45). |
| U25 | BACKUP_ARCHIVE_GRACE_MINUTES | limits.ts:53 | number 10 (min) | api/backups/reconcile-backup.ts:272 [srv]; tests | keep as code constant | Storage-propagation guard, not policy. |
| U26 | TEMPLATE_IMAGE_REFRESH_DAYS | limits.ts:63 | number 7 (days) | utils/functions/template-image.ts:170 (sync `isTemplateImageFresh`, called from api/template-images/ensure-template-image.ts:166 [srv]); tests | app setting: provisioning.templateImageRefreshDays | Global default; the per-template override already exists in the DB (db/schema/proxmox-templates.ts:138). AWKWARD: sync pure function, so the caller must pass the default in. |
| U27 | TEMPLATE_IMAGE_STALE_AFTER_HOURS | limits.ts:70 | number 6 (h) | api/template-images/reconcile-template-image.ts:170 [srv]; tests | keep as code constant | Reconciliation internal. |
| U28 | STEP_UP_WINDOW_SECONDS | limits.ts:86 | number 600 (s) | api/step-up/marker.ts:47,106 (Redis TTL), api/step-up/freshness.ts:35 [srv]; tests | app setting: security.stepUpWindowSeconds | Security policy knob. |
| U29 | INVOICE_RETENTION_YEARS | limits.ts:98 | number 10 (years) | api/privacy/subject-data.ts:166,173,180,187,194,209,217,225 [srv, SQL]; api/workflows/offboard-user/record-erasure.ts:52 [wf]; tpl/account-deleted.tsx:90; web/features/account/components/privacy/delete-account-card.tsx:183 [cli] | app setting: privacy.invoiceRetentionYears | Jurisdiction-specific (German law). The email text also says "German tax law" (E18). AWKWARD: client card. |
| U30 | DATA_EXPORT_TTL_DAYS | limits.ts:107 | number 7 | api/router/privacy.ts:101 [srv]; tpl/data-export-ready.tsx:115 | app setting: privacy.dataExportTtlDays | Privacy policy. |
| U31 | DATA_EXPORT_MIN_INTERVAL_HOURS | limits.ts:116 | number 24 | api/router/privacy.ts:77 [srv] | app setting: privacy.dataExportMinIntervalHours | Rate policy. |
| U32 | DATA_EXPORT_PASSPHRASE_LENGTH | limits.ts:119 | number 24 | api/router/privacy.ts:94 [srv] | keep as code constant | Cryptographic strength, not policy. |
| U33 | ACCOUNT_DELETION_GRACE_PERIOD_DAYS | limits.ts:129 | number 14 | api/privacy/deletion/lifecycle.ts:114 [srv]; tpl/account-deletion-requested.tsx:99; delete-account-card.tsx:195 [cli]; test | app setting: accounts.deletionGracePeriodDays | AWKWARD: client. |
| U34 | ACCOUNT_DELETION_TOKEN_TTL_HOURS | limits.ts:137 | number 24 | api/privacy/deletion/lifecycle.ts:57 [srv]; tpl/account-deletion-requested.tsx:106 | app setting: security.accountDeletionTokenTtlHours | Security policy. |
| U35 | ACCOUNT_INACTIVITY_MONTHS | limits.ts:146 | number 6 | api/privacy/inactivity/eligibility.ts:98 [srv]; tpl/account-inactivity-notice.tsx:95, account-inactivity-reminder.tsx:95; tests | app setting: accounts.inactivity.months | Account lifecycle policy. |
| U36 | ACCOUNT_INACTIVITY_GRACE_PERIOD_DAYS | limits.ts:154 | number 30 | api/privacy/inactivity/sweep.ts:158 [srv] | app setting: accounts.inactivity.gracePeriodDays | Account lifecycle policy. |
| U37 | ACCOUNT_INACTIVITY_REMINDER_DAYS | limits.ts:157 | number 7 | api/privacy/inactivity/sweep.ts:177 [srv] | app setting: accounts.inactivity.reminderDays | Account lifecycle policy. |
| U38 | RENEWAL_RETRY_SCHEDULE_DAYS | limits.ts:179 | number[] [1,3,5,7] (day offsets) | limits.ts:210 (U40); api/billing/retry-schedule.ts:33,60 (module-level RENEWAL_LADDER_RUNGS and _EXHAUSTED_AFTER_DAYS, read by api/billing/dunning-mail.ts:122,154) and :84,88 (sync) [srv]; tests | app setting: billing.renewalRetryScheduleDays | Dunning policy quoted in emails. AWKWARD: two derivations at module load plus sync pure functions. |
| U39 | RENEWAL_AUTHENTICATION_WINDOW_HOURS | limits.ts:190 | number 72 | api/billing/record-outcome.ts:379, api/billing/reconcile-renewals.ts:520 [srv] | app setting: billing.renewalAuthenticationWindowHours | Billing policy. |
| U40 | RENEWAL_SUSPENSION_GRACE_DAYS | limits.ts:209-210 | derived: max(U38)+1 = 8 | api/subscriptions/suspend-terminated-servers.ts (`selectDueServers`) [cron]; tests | keep as code constant | A derivation rule; becomes a function of U38. AWKWARD: computed at module load. |
| U41 | DEFAULT_PAGE / DEFAULT_PER_PAGE / MAX_ENTRIES_PER_PAGE | utils/constants/pagination.ts:21,26,31 | 1 / 10 / 100 | val/pagination.ts:33,38,39 [zod]; MAX also in web hooks use-custom-image-list.ts:33, ssh-keys-list.ts:33, use-backup-list.ts:35, use-pointer-records-list.ts:35, use-server-list.ts:33 [cli] | keep as code constant | Public API contract. |
| U42 | ISO_CATALOG | utils/constants/iso-catalog.ts:77-272 | array of 23 entries {id, name, icon, url, sha256, releasedAt}: vendor ISO URLs (Debian, Ubuntu, Alma, Rocky, CentOS, Fedora, Alpine, Arch, NixOS, FreeBSD, Windows eval, virtio, Proxmox ×3, Kali) | `findIsoCatalogEntry` (:287), called from api/router/iso/index.ts:312 [srv] and web/ui/custom-image-icon.tsx:37 [cli]; web/features/account/components/custom-images/iso-catalog-grid.tsx:76,79 [cli]; web-scripts/video/iso.ts:271,567; api/lib/__tests__/iso-catalog.test.ts | app setting: servers.isoCatalog (an admin-managed table like proxmox_templates would fit better) | Per the comment, a point release is a code change (:67-72). AWKWARD: client grid and a sync URL match; changing a URL breaks matching for existing rows (:283-284). |
| U43 | SENSITIVE_PORTS | utils/constants/firewall.ts:203-261 | 27 entries {port, proto, service, severity} | firewall.ts:270 (`findSensitivePort`, called from utils/guest/analyze-firewall.ts:359) [srv] | keep as code constant | Product security knowledge shown to customers. Could later become security.sensitivePorts. |
| U44 | Avatar URL | utils/functions/get-gravatar-image.ts:26 | template `seccdn.libravatar.org/avatar/<sha256(email)>?d=identicon` | auth/index.ts:172 [srv, user-create hook]; same host in web/lib/csp/index.ts:112 | app setting: privacy.defaultAvatarProvider (libravatar / none) | Sends an email hash to a third party. The function is misnamed "gravatar". |
| U45 | Default meta description | utils/functions/construct-metadata.ts:25 | template "${APP_NAME} is your provider for secure server hosting…" | `constructMetadata` (R5, 55 sites) [rsc] | app setting: branding.description | AWKWARD: sync helper, so settings must be passed in. |
| U46 | Default title / tagline | construct-metadata.ts:55 | "${APP_NAME} - Hosting, but secure." | R5 | app setting: branding.tagline | Duplicated in 6 places. |
| U47 | Twitter creator | construct-metadata.ts:93 | "@virtbasecom" | R5 | app setting: branding.social.xHandle | Must derive from U14. |
| U48 | "Expiring soon" window | utils/functions/server-state.ts:56 | default parameter 5 (days) | `isExpiring` in web/features/servers/components/server-terminates-badge.tsx:51 [cli], server-status-bar.tsx:84 [cli], web/features/dashboard/components/server-status-small.tsx:82 [cli] | app setting: servers.expiringSoonDays | AWKWARD: sync predicate in client components. |
| U49 | BASE_SNIPPETS | utils/cloud-init/base-snippets.ts:37-149 | 6 snippets; sshd PermitRootLogin yes, PasswordAuthentication yes, MaxAuthTries 20 (:97-99, :142-144) | web-scripts/dev/seed-cloud-init-snippets.ts:45,69 and web-scripts/dev/verify-vendor-data.ts:64 [script]; tests | keep as code constant | Seed data only. The live copy is the admin-editable `cloud_init_snippets` table. There is no production seeding path. |
| U50 | Guest script dir / header | utils/cloud-init/render-vendor-data.ts:51,239 | "/var/lib/virtbase/cloud-init"; "# Generated by Virtbase…" | internal [srv] | keep as code constant | Guest-side path; renaming it orphans scripts on existing guests. |
| U51 | OPERATING_SYSTEMS | utils/guest/operating-system.ts:78-189 | 15 descriptors (slug, label, logo, ids, regex) | operating-system.ts:193,295; disc/emoji/manifest.ts:48 [int]; tests | keep as code constant | Bound to bundled logos and committed Discord emoji PNGs. |

#### packages/validators

| # | Item | Location | Value shape | Readers | Classification | Justification |
|---|---|---|---|---|---|---|
| V1 | SUBSCRIPTION_MANDATE_TEXT_VERSION | val/subscriptions.ts:171 | date string "2026-08-30" | val/subscriptions.ts:187 [zod]; api/router/subscriptions.ts:459,484 [srv]; web/features/servers/components/billing/mandate-dialog.tsx:161,220 [cli]; tests | keep as code constant | Versions the mandate wording shipped in code. If the wording ever becomes a legal.* setting, the version must move with it. |
| V2 | Console URL host pin | val/server/console.ts:27-30 (hostname at :29) | `z.url({protocol:/https/, hostname:/novnc\.com/})` | ports/server-management.ts:288; api/router/servers/console.ts:59 (output validation) [srv] | integration setting: novnc.viewerUrl (proposed new) | The same host is hard-coded at api/router/servers/console.ts:107 and web/lib/csp/index.ts:107. AWKWARD: zod at module scope. |
| V3 | Template hardware defaults | val/admin/proxmox-templates.ts:84,93-96 | "amd64", ostype "l26", cpu "host", bios "seabios", machine "q35" | Create/UpdateProxmoxTemplateInputSchema (:132,:153), used by web/features/admin/components/proxmox-templates/create-template-dialog.tsx:52,114 [cli] and web/features/admin/api/proxmox-templates/create-proxmox-template.ts:112,137 [act] | keep as code constant | Form defaults; each template row is admin-editable. Duplicates D2. |

#### packages/db

| # | Item | Location | Value shape | Readers | Classification | Justification |
|---|---|---|---|---|---|---|
| D1 | Currency column defaults | db/schema/orders.ts:76; payments.ts:70; subscriptions.ts:111 and :308 (renewals) | text default 'EUR', 4 columns | Only api/backfill/subscriptions.ts:293-308 [srv] relies on the default; every other writer hard-codes "EUR" (duplicates list) | app setting: billing.currency | Instance currency. AWKWARD: a DB default needs a migration, so writers must pass the setting explicitly. |
| D2 | proxmox_templates hardware defaults | db/schema/proxmox-templates.ts:144,173,179,186,192 | amd64 / l26 / host / seabios / q35 | per-row default; the admin path passes V3 | keep as code constant | Per template, already admin-editable. |
| D3 | proxmox_nodes.netrate | db/schema/proxmox-nodes.ts:105 | 125 MB/s (1 Gbit) | per-row default | keep as code constant | Per node, admin-editable. |
| D4 | proxmox_node_groups.strategy | db/schema/proxmox-node-groups.ts:54 | "ROUND_ROBIN" | per-row | keep as code constant | Per group. |
| D5 | subscriptions.interval_months | db/schema/subscriptions.ts:110 | 1 | per-row | keep as code constant | Per subscription. |
| D6 | abuse_rules defaults | db/schema/abuse-rules.ts:49,76,78,81 | priority 100; enforcement "none"; grace 0 min; response 24 h | per-row (admin rules) | keep as code constant | The rules themselves are the configuration. |
| D7 | notification_targets defaults | db/schema/notifications.ts:71,83 | audience "operator"; minSeverity "info" | per-row | keep as code constant | Already admin data. |
| D8 | SUBNET_RESERVATION_MINUTES (+ CARVE_ATTEMPTS 5) | db/queries/get-available-subnet.ts:36 (:48) | 60 min | :53 [srv] | keep as code constant | Concurrency guard that must outlast a provisioning run. |
| D9 | last-seen throttle | db/queries/touch-last-seen.ts:29 | INTERVAL '1 hour' | :62 [srv] | keep as code constant | Write throttle. |
| D10 | Pool config and dev Neon proxy | db/client.ts:49,57,84-88 | "db.localtest.me" → port 4444 (dev); pool max 10, connect 10 s, idle 30 s, maxUses 7500 | :102 [init] | keep as code constant | Bootstrap: these are needed to reach the DB at all. |

#### packages/email

| # | Item | Location | Value shape | Readers | Classification | Justification |
|---|---|---|---|---|---|---|
| E1 | VARIANT_TO_FROM_MAP | email/resend/constants.ts:25-29 | 3 senders: primary system@account.virtbase.com, notifications notifications@mail.virtbase.com, marketing (a personal name) @marketing.virtbase.com | email/send-via-resend.ts:88 (variant default "primary", :55); api/notifications/channels/email.ts:109,142 force "primary" (the notifications variant is commented out at :108,141); "marketing" appears only in email/__tests__/send-email.test.ts:202 | app setting: email.from.{primary,notifications,marketing} | Instance identity; must match the provider's verified domain. Two of the three are unused in production. |
| E2 | TRUSTPILOT_AFS_EMAIL | email/resend/constants.ts:31-32 | address `virtbase.com+<token>@invite.trustpilot.com` | email/send-via-resend.ts:90, email/send-via-nodemailer.ts:66 [srv]; switched on by api/workflows/provision-server/send-server-ready-email.ts:83 [wf] | integration setting: trustpilot.afsEmail (proposed new; store as a secret) | Address that carries a token. |
| E3 | RESEND_AUDIENCE_ID | email/resend/constants.ts:18 | placeholder string, not a valid id | email/resend/subscribe.ts:41 (`subscribe()` has no callers); email/resend/unsubscribe.ts:31, called from api/workflows/offboard-user/detach-external-services.ts:66 [wf] | integration setting: email.resendAudienceId (proposed new "email") | A live erasure step calls Resend with a placeholder id. Resend returns errors instead of throwing, so `unsubscribed` is set to true anyway. |
| E4 | SMTP From | email/send-via-nodemailer.ts:64 | "noreply@example.com" | email/index.ts:85,110 (SMTP fallback) [srv] | app setting: email.from.primary | Placeholder sender. |
| E5 | SMTP TLS | email/send-via-nodemailer.ts:57-60 | `secure: false`; `tls.rejectUnauthorized: false` | same | integration setting: email.smtpSecure / email.smtpVerifyTls (proposed new "email") | Certificate verification is off unconditionally. |
| E6 | Non-prod recipient sink | email/send-via-resend.ts:87 | "delivered@resend.dev", env-derived (NEXT_PUBLIC_VERCEL_ENV) | every Resend send | keep as code constant | Resend's documented test address. |
| E7 | Reply-To fallback | email/send-via-resend.ts:93 | SUPPORT_EMAIL; the "noreply" sentinel suppresses it (passed by api/notifications/channels/email.ts:144) | every Resend send | app setting: email.replyTo (defaults to support.email) | Instance identity. |
| E8 | Unsubscribe URL default | email/send-via-resend.ts:101; tpl/footer.tsx:43 | `${APP_DOMAIN}/account/settings`, twice | marketing sends; the footer's marketing branch | keep as code constant | App route (duplicated literal). |
| E9 | EMAIL_LOCALES | email/translations/index.ts:27 | ["en","de","fr","nl"] | :29,39 | keep as code constant | Bound to the 4 statically imported catalogs (:21-24). |
| E10 | DEFAULT_EMAIL_LOCALE | email/translations/index.ts:28 | "en" | api/notifications/deliver.ts:102,110 [srv]; translations :39,99; default parameter in 24 templates and the footer (R6) | app setting: email.defaultLocale | The operator's main market language. AWKWARD: it is a default parameter value. The web default (web/i18n/config.ts:22) is build-time routing, so keep that one in code. |
| E11 | Email time zone | email/translations/index.ts:112; tpl/account-inactivity-notice.tsx:71, renewal-final-warning.tsx:108, account-inactivity-reminder.tsx:71, renewal-payment-failed.tsx:100, account-deletion-scheduled.tsx:59 | "UTC", 6 times | subjects via `getEmailTitle` plus those 5 bodies | app setting: email.timeZone | Customer-facing deadlines. Subject and body must agree (translations :110-111). |
| E12 | Company block in footer | tpl/footer.tsx:136-142 | legal name (UG), street, postcode and city, managing director's name, register court plus HRB number | `Footer` in 24 templates (R7) | app setting: company.legalName, company.address.{street,postalCode,city}, company.managingDirector, company.commercialRegister | Statutory imprint. AWKWARD: `Footer` must stay synchronous (footer.tsx:64-65), so these have to arrive as props. |
| E13 | LEGAL_SLUGS | tpl/footer.tsx:38 | ["notice","terms","privacy","revocation"] | footer.tsx:120 | keep as code constant | Tied to content/legal/\<locale\>/\<slug\>.mdx. |
| E14 | Contact link | tpl/footer.tsx:83 | `${PUBLIC_DOMAIN}/contact` | `Footer` | keep as code constant | App route. |
| E15 | Email social row | tpl/socials.tsx:34-40,54 | 5 networks (U9, U13-U16); icons at `<U3>/social/<icon>.png` | footer.tsx:133 | app setting: branding.social.* | Build the list from the configured links; icons need assets. |
| E16 | Currency in templates | tpl/invoice-created.tsx:93,100 (hard-coded); tpl/renewal-final-warning.tsx:65, renewal-payment-failed.tsx:57 (default parameter) | "EUR" | invoice-created receives no currency; the renewal templates get it from api/billing/dunning-mail.ts:263,289 | app setting: billing.currency | Instance currency. |
| E17 | Brand in message catalog | email/messages/{en,de,fr,nl}.json:52 | literal "Virtbase" in `account-deleted.preview` | tpl/account-deleted.tsx | app setting: branding.name | Every other string interpolates `{appName}`. |
| E18 | Jurisdiction in message catalog | email/messages/{en,de,fr,nl}.json:57 | "…under German tax law" | tpl/account-deleted.tsx:90 | app setting: company.country (the text must follow it) | Pairs with U29. |

#### packages/config, packages/ports, packages/integration-sdk

| # | Item | Location | Value shape | Readers | Classification | Justification |
|---|---|---|---|---|---|---|
| C1 | SettingsStore cache TTL | cfg/settings-store.ts:76 | 30_000 ms | SettingsStore (no consumers) | keep as code constant | Infrastructure. Same value as S1. |
| S1 | Registry config cache TTL | sdk/registry.ts:101 | 30_000 ms | IntegrationRegistry, built in api/integrations/index.ts | keep as code constant | Infrastructure. |
| S2 | Default integration author | sdk/describe.ts:59 | "Virtbase" | admin hub detail page | keep as code constant | Attribution for the bundled integrations, not the instance brand. |

`packages/ports` has no configuration literals: interfaces plus the PORTS key map at ports/common.ts:25-38.

#### integration-lexware

Already configurable: `secrets.apiKey` only (lex/index.ts:31-33, 47-57). There are no settings.

| # | Item | Location | Value shape | Readers | Classification | Justification |
|---|---|---|---|---|---|---|
| L1 | COUNTRY_CONTACTS | lex/constants.ts:26-53 (type at :58) | record of 26 EU ISO-3166 codes to Lexware contact UUIDs | lex/adapter.ts:56,58 (`createInvoice`), lex/index.ts:72 (health) [int]; lex/__tests__/adapter.test.ts:95,127 | integration setting: lexware.countryContacts | These are record ids in one Lexware account; another tenant has different ones. |
| L2 | HOME_COUNTRY | lex/constants.ts:56 | "DE" | lex/adapter.ts:107; lex/index.ts:72 [int] | app setting: company.country | The seller's country decides OSS treatment, and other packages need it too. |
| L3 | Currency | lex/adapter.ts:32 | "EUR" | :37,95,103 [int] | app setting: billing.currency | Instance currency. |
| L4 | Document language rule | lex/adapter.ts:88 | `country === "DE" ? "de" : "en"` | `createInvoice` | keep as code constant | Lexware renders only de and en. It must key on HOME_COUNTRY or the locale rather than the literal "DE". |
| L5 | Tax conditions | lex/adapter.ts:105-111 | taxType "gross"; taxSubType "electronicServices" when country ≠ HOME_COUNTRY | `createInvoice` | keep as code constant | Follows the B2C gross-pricing model (ports/invoice-provider.ts:38-41) and the OSS rule, keyed on company.country. |
| L6 | Payment term | lex/adapter.ts:128-131 | paymentTermDuration 7 (days) plus an "already paid" label | `createInvoice` | integration setting: lexware.paymentTermDays | Accounting choice. |
| L7 | Invoice copy | lex/messages.ts:28-61 | 4 locales × 5 strings (the remark uses appName) | lex/adapter.ts:78-79,99,125-130 | keep as code constant | Translations; overridable later if wanted. |
| L8 | API base | lex/client.ts:26 | "https://api.lexware.io/v1" | LexwareClient | keep as code constant | Vendor endpoint. |

#### integration-anonpay

Already configurable: settings `tickerTo`, `networkTo`, `address`; secret `webhookSecret` (anon/index.ts:28-36, 50-83). api/router/checkout.ts:576-580 still reads the ANONPAY_* env vars instead.

| # | Item | Location | Value shape | Readers | Classification | Justification |
|---|---|---|---|---|---|---|
| A1 | ANONPAY_MIN_AMOUNT | anon/constants.ts:21 | 500 (minor units, EUR) | anon/adapter.ts:59,61 [int]; api/router/checkout.ts:570 [srv, only enforced when the currency is EUR, :571]; web/features/checkout/components/elements-provider.tsx:100 [cli] | integration setting: anonpay.minAmount | Provider minimum. AWKWARD: client component. |
| A2 | ANONPAY_STRIPE_METHOD_ID | anon/constants.ts:26-27 | derived from env NEXT_PUBLIC_STRIPE_ANONPAY_METHOD_ID | elements-provider.tsx:98,104 [cli]; web/features/checkout/components/stripe-payment-form.tsx:187-188 [cli] | integration setting: anonpay.stripeMethodId | Public id; the env read itself is in the env inventory. AWKWARD: only used client-side. |
| A3 | Widget colours | anon/adapter.ts:86-88 | bgcolor "0a0a0aff", buttonbgcolor "ffffff", textcolor "000000" | `createPayment` [int]; copied at api/router/checkout.ts:616-618 | integration setting: anonpay.theme.{bg,button,text} | Brand appearance of the hosted page. |
| A4 | Widget behaviour flags | anon/adapter.ts:81,83-85 | direct false, donation false, remove_direct_pay true, simple_mode true | same; copied at api/router/checkout.ts:611,613-615 | keep as code constant | Required by settlement through the webhook. |
| A5 | Endpoints | anon/client.ts:21; anon/index.ts:92 | "https://trocador.app/anonpay" (plus the health probe) | client, health | keep as code constant | Vendor endpoint. |

#### integration-stripe

Already configurable: secrets `secretKey` and `webhookSecret` (stripe/index.ts:28-31, 45-60). The module client still uses env STRIPE_SECRET_KEY (stripe/client.ts:27).

| # | Item | Location | Value shape | Readers | Classification | Justification |
|---|---|---|---|---|---|---|
| ST1 | API version / telemetry | stripe/client.ts:29,31 | "2026-09-30.endive"; telemetry false | module `stripe` client used by api/backfill/payment-methods.ts:103, api/payment-methods/settle-stripe-setup-intent.ts:91, api/orders/settle-stripe-payment.ts:116,135, api/router/checkout.ts:418,438,504 [srv]; api/workflows/offboard-user/detach-external-services.ts:57 [wf]; web/app/(public)/[locale]/checkout/return/page.tsx:177 [rsc]; web/app/api/anonpay/webhook/route.ts:102 and web/app/api/stripe/webhook/route.ts:48,92 [route] | keep as code constant | Contract with the SDK typings. The adapter's own client (stripe/adapter.ts:204) is not pinned. |
| ST2 | NO_MONEY_CURRENCY | stripe/adapter.ts:93 | "EUR" | :294 | app setting: billing.currency | Instance currency. |
| ST3 | Automatic payment methods | stripe/adapter.ts:213,407 | enabled: true | `createPayment`, `createSetupSession` | keep as code constant | Which payment methods are offered is chosen in the Stripe dashboard. |
| ST4 | TERMINAL_DECLINE_CODES | stripe/adapter.ts:103-117 | set of 13 decline codes | `isRetryableDecline` (:120) | keep as code constant | Semantics defined by Stripe. |

#### integration-discord

Already configurable: setting `appId`; secrets `botToken` and `publicKey` (disc/config.ts:21-28; disc/integration.ts:39-66); a `webhookUrl` per notification target (disc/notifications/index.ts:74-83).

There are no guild, channel or role IDs anywhere: a search for 17-20 digit snowflakes and for guild/channel/role identifiers found none.

| # | Item | Location | Value shape | Readers | Classification | Justification |
|---|---|---|---|---|---|---|
| DI1 | Embed footer text | disc/utils/create-embed.ts:35 | `t("Virtbase - Hosting, but secure.")` | `createEmbed`, 24 sites in 10 files (R8) [int] | app setting: branding.name + branding.tagline | AWKWARD: the brand sits inside a next-intl extracted literal, so it needs parameters. |
| DI2 | Embed footer icon | create-embed.ts:36 | "https://virtbase.com/web-app-manifest-192x192.png" | same | app setting: branding.iconUrl | Production host hard-coded. |
| DI3 | Embed colour | create-embed.ts:33 | 0xffffff | same | app setting: branding.accentColor | Brand colour. |
| DI4 | Severity colours | disc/notifications/index.ts:35-39 | 3 hex values (Discord's palette) | :164 | keep as code constant | Semantic colours. |
| DI5 | Slash-command descriptions | disc/commands.ts:34,46; disc/command-description-localizations.ts:25-42, 67-84 | "Virtbase" in 2 base and 36 localized strings | disc/sync/commands.ts:45 (registered on enable and on every health probe) | app setting: branding.name | Can be interpolated at sync time, which is async. |
| DI6 | Brand in screen strings | disc/features/menu/messages.ts:105,108,117,167,170,214; servers/messages.ts:202; lifecycle/index.ts:619 | 8 `t()` literals containing "Virtbase" | Discord screens [int] | app setting: branding.name | AWKWARD: extracted literals need `{appName}`. |
| DI7 | Currency | disc/features/lifecycle/index.ts:156 | "EUR" | plan-upgrade screen | app setting: billing.currency | The ManagedServerPlan port carries no currency. |
| DI8 | Help article link | disc/features/menu/messages.ts:31-32 | `${PUBLIC_DOMAIN}/${locale}/help/article/discord-integration` | 4 screens | keep as code constant | Content slug. |
| DI9 | API base | disc/api/client.ts:20 (used :78); disc/identity/push-linked-role-metadata.ts:70 | "https://discord.com/api/v10", second copy inline | client; linked-role push | keep as code constant | Vendor endpoint (duplicated). |
| DI10 | Invite permissions / URL | disc/utils/invite-url.ts:27-28,44 | SendMessages \| UseApplicationCommands; OAuth2 authorize URL | disc/features/menu/messages.ts:160,274; api/integrations/discord-bot.ts:53 [srv] | keep as code constant | Least privilege by design. |
| DI11 | EMOJI_PREFIX | disc/emoji/manifest.ts:43 | "vb_" | :46; disc/sync/emojis.ts:49 | keep as code constant | Ownership marker; renaming it orphans uploaded emojis. |
| DI12 | Emoji cache TTL / 429 retry | disc/emoji/cache.ts:27; disc/api/client.ts:87-90 | 10 min; one retry, at most 5 s | — | keep as code constant | Internal. |
| DI13 | Locale map | disc/utils/map-discord-locale.ts:20,23-45 | default "en"; 5 mapped, 13 commented out | handlers | keep as code constant | Bound to the shipped catalogs. |

#### integration-powerdns

Already configurable: setting `apiUrl`; secret `apiKey` (pdns/index.ts:28-34, 48-71). Reverse zones come from `subnets.dns_reverse_zone` (db/schema/subnets.ts:66). No nameservers are hard-coded.

| # | Item | Location | Value shape | Readers | Classification | Justification |
|---|---|---|---|---|---|---|
| PD1 | PTR TTL | pdns/client.ts:64 | 3600 s | `upsertReverseDNSRecord`, called from pdns/adapter.ts | integration setting: powerdns.ptrTtl | DNS policy. |
| PD2 | Server id | pdns/client.ts:56,81,96 | "localhost" in `/api/v1/servers/localhost/…` | every call, including health | integration setting: powerdns.serverId (default "localhost") | Deployment-specific. |

#### integration-abuseipdb

Already configurable: confidenceThreshold 50, maxAgeInDays 30, blockPrefixLength 24, callsPerRun 4, enrichCategories off, allowReporting off; secret `apiKey` (aipdb/config.ts:21-61; aipdb/index.ts:43-99).

| # | Item | Location | Value shape | Readers | Classification | Justification |
|---|---|---|---|---|---|---|
| AB1 | Score to severity | aipdb/source.ts:39-43 | ≥90 critical, ≥60 warning, else info | :136 [int] | integration setting: abuseipdb.criticalScore / abuseipdb.warningScore | Deployment risk appetite. |
| AB2 | Client maxAgeInDays fallback | aipdb/client.ts:218,231 | 30 | never applied: every caller passes a value (source.ts:87,107; reputation.ts:52; index.ts:120) | remove | Dead default that duplicates config.ts:25. |
| AB3 | Endpoints | aipdb/client.ts:21 (used :162); source.ts:143 | api.abuseipdb.com/api/v2; www.abuseipdb.com/check/\<ip\> | — | keep as code constant | Vendor endpoint. |
| AB4 | Category maps | aipdb/categories.ts:39-65, 109-116 | vendor ids to categories; reportable categories | source, reputation | keep as code constant | Vendor taxonomy. |
| AB5 | Health probe | aipdb/index.ts:120 | "127.0.0.1", maxAgeInDays 1 | health | keep as code constant | Probe. |
| AB6 | Report comment cap | aipdb/reputation.ts:108 | 1024 chars | report | keep as code constant | API limit. |

#### integration-alertmanager, integration-prometheus, integration-webhook

Already configurable:
- **Alertmanager:** payloadFormat (default alertmanager), defaultSeverity (default warning); secret `ingestToken` (am/config.ts:21-48).
- **Prometheus:** prefix (default "virtbase_"), collectDefaultMetrics (on), collectPlatformMetrics (on), durationBucketsMs (5 ms to 300 s); secret `scrapeToken` (prom/config.ts:111-179).
- **Webhook:** no installation config; per target `url` and `signingSecret` (wh/channel.ts:73-90).

| # | Item | Location | Value shape | Readers | Classification | Justification |
|---|---|---|---|---|---|---|
| AM1 | MAX_ALERTS | am/webhook.ts:35 | 200 per request | :87-90 | keep as code constant | Request guard. |
| AM2 | Label limits | am/parse.ts:36,146 | 30 labels; keys 64 chars, values 500 | parse | keep as code constant | Request guard. |
| AM3 | Label contract | am/parse.ts:82,122-132,177 | virtbase_server_id / ip / vmid / node / user_id / type; severity aliases | parse | keep as code constant | Documented wire contract; renaming breaks operators' alert rules. |
| PR1 | DEFAULT_PREFIX | prom/config.ts:51 | "virtbase_" | default at :114-115 | keep as code constant | Already a setting. |
| PR2 | DEFAULT_DURATION_BUCKETS_MS | prom/config.ts:59-62 | 14 bounds, 5 ms to 300 s | default of `bucketList` | keep as code constant | Already a setting. |
| WH1 | Header names | wh/channel.ts:124-131 | X-Virtbase-Timestamp, -Delivery, -Signature (HMAC sha256) | send | keep as code constant | Receivers verify by these names. |

#### apps/novnc-proxy (no DB access)

There is no Origin or host allow-list. The proxy dials whatever host the authenticated payload names.

| # | Item | Location | Value shape | Readers | Classification | Justification |
|---|---|---|---|---|---|---|
| N1 | PORT default | nv/config.ts:29-34 | 8443 (env PORT overrides) | :47; nv/index.ts:63 [nv] | keep as code constant | The binary cannot read the DB. |
| N2 | Timeouts | nv/server.ts:25-32 | handshake 15 s, close 5 s, drain 10 s | :38,56 [nv] | keep as code constant | Same reason. |
| N3 | BacklogLimit | nv/bridge.ts:45-48 | 64 frames / 1 MiB | :236-237 [nv] | keep as code constant | Same reason. |
| N4 | ExpiryLimit | nv/payload.ts:22-33 | clock skew 30 s; maximum lifetime 3600 s | :84,87 [nv] | keep as code constant | Coupled to api/router/servers/console.ts:39 (300 s). |
| N5 | Healthcheck timeout | nv/index.ts:35 | 3000 ms | :70 [nv] | keep as code constant | Fits Docker's 5 s healthcheck window. |
| N6 | Upstream URL | nv/bridge.ts:69 | `wss://<payload host>`; implicit port 443 | `upstreamUrl` [nv] | keep as code constant | Host and port come from proxmox_nodes.fqdn. |

#### scripts, tooling (operator-relevant only)

| # | Item | Location | Value shape | Readers | Classification | Justification |
|---|---|---|---|---|---|---|
| SC1 | Dev bootstrap | scripts/setup.sh:23-46,51,103 | copies .env.example, generates NOVNC_PROXY_SECRET, starts postgres/neon-proxy/redis | manual | keep as code constant | Dev only. |
| SC2 | Hookscript filename | scripts/set-hookscript.sh:29 | "hookscript.pl" | manual ops | keep as code constant | Also at web/features/admin/lib/proxmox-nodes/hookscript.ts:23 and api/workflows/provision-server/apply-hardware-config.ts:109. |
| SC3 | HA backfill parameters | scripts/backfill-ha-settings.sh:30-31, 262-267, 283-290 | max_relocate 1, max_restart 1, state started, strict 1, "Backfilled …" comments | manual, one-shot | keep as code constant | Mirrors api/workflows/shared/update-ha-settings.ts:52-75. |
| SC4 | bootsplash.jpg | scripts/bootsplash.jpg | 640×480 JPEG | none: no reference in the repo, `git log -S bootsplash` is empty, and it was never used by the deleted create-templates.sh | remove | Orphaned since commit 5e0393df. Document it instead if it is copied to nodes by hand. |
| T1 | pve-patches runtime defaults | tooling/pve-patches/virtbase-pve-repatch:21,26,27; patch.sh:5,17-21 | TEXTFILE_DIR /var/lib/prometheus/node-exporter, METRIC_FILE, PVE_BASE /usr/share/perl5/PVE, 3 patch files | node-side; overridable via /etc/default/virtbase-pve-repatch | keep as code constant | Hypervisor configuration, not app configuration. |
| T2 | Repatch timer | tooling/pve-patches/debian/virtbase-pve-patches.virtbase-pve-repatch.timer:6,8,10 | daily; RandomizedDelaySec 30m; Persistent | systemd | keep as code constant | Node-side. |
| T3 | Package metadata | tooling/pve-patches/debian/control:4,8; changelog:1; build.sh:15 | personal maintainer address; Homepage virtbase.com; version 1.0.0; build image debian:trixie | packaging | keep as code constant | Packaging. |
| T4 | Dev cluster | tooling/proxmox-cluster/bootstrap.sh:15-20,404,426,576; docker-compose.yml:46-102 | cluster virtbase-dev, 172.28.0.0/24, 12G OSDs, pve1-3, pools vm-storage/cephfs at pg_num 32, ports 443 and 8006-8008, documented dev root password | dev | keep as code constant | Dev only. |
| T5 | Theme tokens | tooling/tailwind/theme.css:18-61, 134-135 | shadcn neutral oklch palette, radius 0.625rem, Geist fonts | all UI (build-time CSS) | keep as code constant | Branding colours would need runtime CSS variables. |

#### Borderline items excluded, and why

- **Protocol and enum lists.** FIRWALL_PROTOCOLS, ICMP and ICMPv6 names (utils/constants/firewall.ts:22,85,94,135), PROXMOX_TASK_STATUS_MAPPING (utils/constants/proxmox.ts:46-59) and IMPORT/COMPRESSION extensions (utils/functions/template-image.ts:28,49). These are dictated by /etc/protocols, iptables or Proxmox.
- **AI output contract.** GENERATED_FIREWALL_PROTOCOLS and GENERATED_ICMP_TYPES (firewall.ts:280,298), prompt ≤512 chars and ≤5 rules (val/server/firewall.ts:265,323). This is the model's output contract. The AI model IDs live in packages/api (api/router/servers/firewall/generation.ts:23; api/abuse/triage/model.ts:19), which is another agent's scope.
- **Root password policy.** Defined twice (val/checkout.ts:41-46; val/server/actions.ts:22-26). Generated password length is 12 in two places (api/workflows/provision-server/apply-hardware-config.ts:85; web/ui/input-group-addons/random-password-addon.tsx:42), and the `generatePassword` default is 8 (utils/functions/generate-password.ts:48). These zod schemas are shared with client forms; a future security.* candidate.
- **Consent checkboxes.** Checkout `waiver`/`terms` (val/checkout.ts:29-30) encode an EU consumer-law requirement, not a value.
- **Status enums with business meaning.** db/schema/orders.ts:26,39; payments.ts:24; subscriptions.ts:39,253; abuse-enums.ts:28-149; privacy.ts:67; auth.ts:28; notifications.ts:23-34; proxmox-node-groups.ts:22. These are state machines. ID prefixes are excluded as instructed.
- **Brand in API docs.** OpenAPI descriptions and examples that contain "Virtbase" (val/server/firewall.ts:442,494; val/server/shared.ts:138; val/proxmox-template.ts:40; val/admin/proxmox-nodes.ts:48). This is docs text in module-level `.meta`.
- **Integration attribution.** Explicit `author: "Virtbase"` ×9 (lex/index.ts:43, anon/index.ts:46, stripe/index.ts:41, disc/integration.ts:35, pdns/index.ts:44, aipdb/index.ts:39, am/index.ts:34, prom/index.ts:46, wh/index.ts:32), plus website and docsUrl metadata.
- **Email preview fixtures.** Sample names, emails and URLs used only as react-email preview defaults (e.g. tpl/login-link.tsx:41-42, account-deletion-requested.tsx:53-55, invoice-created.tsx:41-46). Real callers always pass values.
- **API and UI limits.** Discord limits (disc/ui/components.ts:32-37, ui/modal.ts:34-42, routing/custom-id.ts:35); page sizes (disc/features/rdns:36, backups:39, firewall:41, stats:48); STRIPE_METADATA_VALUE_LIMIT (utils/functions/stripe-metadata.ts:30); MAX_GUEST_OS_NAME_LENGTH (utils/guest/operating-system.ts:206).
- **Internal route folders.** `app.virtbase.com` and `admin.virtbase.com` route folders (web/lib/middleware/app.ts:68, admin.ts:80) are internal rewrite targets, not hostnames.

---

#### (1) Shared settings candidates (values read by more than one package)

1. **branding.name**
   - Defined in utils (main.ts:18).
   - Read by:
     - auth (plugins/index.ts:171,175; index.ts:119)
     - utils (construct-metadata.ts:25,55,60)
     - api (privacy/export/document.ts:152, privacy/export/brand.ts:108, router/checkout.ts:608,619)
     - lexware (adapter.ts:113,127)
     - anonpay (adapter.ts:89)
     - email (translations/index.ts:115 plus 25 templates)
     - web (about 20 files, R1)
   - Hard-coded as a literal in: discord (DI1, DI5, DI6), email catalogs (E17), validators docs, sdk attribution, and the content MDX.
2. **support.email**
   - Read by: utils, api (checkout.ts:612), anonpay (adapter.ts:82), email (send-via-resend.ts:93, server-ready.tsx:121), web (app-sidebar.tsx:86, default-json-ld.tsx:42,63, contact/page.tsx:97, api/docs/page.tsx:85).
   - Hard-coded in content (legal notice.mdx:29, privacy.mdx:23, revocation.mdx:11,36/37; marketing index.mdx:89, open-source.mdx twice; 4 locales each).
3. **company.legalName / address / managingDirector / commercialRegister**, plus **company.vatId / company.taxId**
   - email: tpl/footer.tsx:136-142.
   - web: web/ui/seo/default-json-ld.tsx:48-67 (legalName, address, vatID, taxID, iso6523, founder).
   - content: content/legal/{de,en,fr,nl}/notice.mdx (en:10-24), terms.mdx (en:13, 273-275), privacy.mdx (en:19-21), revocation.mdx (en:11, 32-34).
4. **company.country**
   - lexware: HOME_COUNTRY (constants.ts:56) and a literal "DE" (adapter.ts:88).
   - api: EU_VAT_RATES and COUNTRY_LOCALE assume a German seller (lib/invoicing.ts:23-72).
   - web: default-json-ld.tsx:56; app/geofeed.csv/route.ts:29.
   - email: messages/*.json:57.
   - utils: the INVOICE_RETENTION_YEARS rationale (limits.ts:88-98).
5. **billing.currency**
   - db: 4 column defaults.
   - api: 7 sites.
   - lexware, stripe, discord, anonpay (minimum amount in EUR cents).
   - email: 3 templates.
   - web: about 15 sites (see duplicate 1).
6. **billing countries (the EU list)**
   - lexware: COUNTRY_CONTACTS keys (constants.ts:27-52).
   - api: EU_VAT_RATES (lib/invoicing.ts:24-49).
   - web: features/checkout/components/stripe-payment-form.tsx:41-68.
7. **Locales and default locale**
   - email: translations/index.ts:27-28.
   - web: i18n/config.ts:20,22.
   - lexware: messages.ts:28-71.
   - api: lib/invoicing.ts:55-72; notifications/deliver.ts:102,110.
   - discord: map-discord-locale.ts:20-45.
8. **branding.tagline / description**
   - utils: construct-metadata.ts:25,55.
   - web: default-json-ld.tsx:49; app/manifest.ts:25; features/landing/components/discord-bot-demo.tsx:158.
   - discord: create-embed.ts:35.
   - content: marketing/en/index.mdx:8,10.
9. **branding.social.\* and support.discordInviteUrl**
   - utils: urls.ts; construct-metadata.ts:93.
   - email: socials.tsx.
   - web: lib/socials.ts, then socials-row.tsx:27 and the JSON-LD `sameAs` (default-json-ld.tsx:80); contact/page.tsx:85.
10. **Brand images (logo, icon)**
    - utils: main.ts:31-33 (email).
    - discord: create-embed.ts:36.
    - web: default-json-ld.tsx:40-41; app/manifest.ts.
11. **servers.deletionGracePeriodDays**
    - utils: server-state.ts:84.
    - email: 4 templates.
    - web: 2 crons, plus 2 client components through utils.
12. **Privacy and account durations (U29, U30, U33-U35)**
    - api (privacy), email templates, web client (delete-account-card.tsx:183,195).
13. **billing.renewalRetryScheduleDays**
    - utils: limits.ts:179,210.
    - api: billing/retry-schedule.ts, billing/dunning-mail.ts.
    - api: subscriptions/suspend-terminated-servers.ts (`selectDueServers`), run by the `suspend-terminated-servers` cron.
14. **trustpilot.\***
    - utils: urls.ts:39-43.
    - email: constants.ts:31-32; footer.tsx:110; server-ready.tsx:114-123.
    - api: workflows/provision-server/send-server-ready-email.ts:79-83.
15. **anonpay.minAmount**
    - anonpay: adapter.ts:59.
    - api: router/checkout.ts:570.
    - web: elements-provider.tsx:100 [cli].
16. **novnc.viewerUrl**
    - validators: server/console.ts:29.
    - api: router/servers/console.ts:107.
    - web: lib/csp/index.ts:107.
17. **privacy.defaultAvatarProvider**
    - utils: get-gravatar-image.ts:26.
    - auth: index.ts:172.
    - web: lib/csp/index.ts:112.
18. **servers.isoCatalog**
    - utils, api (router/iso/index.ts:312), web (2 [cli] files), web-scripts.
19. **email.from / email.replyTo**
    - email: constants.ts, send-via-*.
    - api: notifications/channels/email.ts:109,142,144.
    - api: abuse/mailbox/address.ts:29-32 uses its own domain, with an env value and a "virtbase.com" fallback.

#### (2) Duplicates and inconsistencies

1. **Currency literals.**
   - db: orders.ts:76, payments.ts:70, subscriptions.ts:111,308.
   - api: orders/create-order.ts:65; orders/apply-payment-event.ts:127; subscriptions/create-subscription.ts:81; router/checkout.ts:444 (lowercase "eur") and :571; workflows/create-invoice/generate-invoice.ts:198; privacy/export/document.ts:266.
   - integrations: lex/adapter.ts:32; stripe/adapter.ts:93; disc/features/lifecycle/index.ts:156.
   - email: tpl/invoice-created.tsx:93,100 have no currency prop, while tpl/renewal-final-warning.tsx:65 and renewal-payment-failed.tsx:57 take one.
   - web:
     - ui/seo/offers-json-ld.tsx:26
     - app/api/serverhunter-pullapi.json/route.ts:50
     - features/invoices/components/invoices-table/columns.tsx:95,102 ("€")
     - features/checkout/components/order-summary.tsx:165,172
     - features/checkout/components/offer-card.tsx:126,138
     - features/checkout/utils/format-discount.ts:45
     - features/admin/components/dashboard/revenue-over-time.tsx:80,104
     - features/admin/components/dashboard/activity-stats-row.tsx:60
     - features/servers/components/plan/plan-order-dialog.tsx:94, current-plan-card.tsx:137, plan-summary.tsx:81, plan-list.tsx:126
     - features/dashboard/components/latest-invoices-list.tsx:105
2. **The 26-country EU list exists three times:** lex/constants.ts:27-52, api/lib/invoicing.ts:24-49, web/features/checkout/components/stripe-payment-form.tsx:41-68.
3. **Seller country.** HOME_COUNTRY (lex/constants.ts:56) exists, yet lex/adapter.ts:88 uses a literal "DE"; also web/ui/seo/default-json-ld.tsx:56 and web/app/geofeed.csv/route.ts:29.
4. **Invoice language mismatch.** api/lib/invoicing.ts:57-72 maps DE→de, FR→fr, NL→nl. lex/adapter.ts:88 sets the Lexware document language to "de" only for DE and "en" otherwise, but lex/messages.ts:45-60 renders fr/nl copy. French and Dutch customers get fr/nl text on an English-language document.
5. **Company identity in three places, which differ:** tpl/footer.tsx:136-142 (no VAT id), web/ui/seo/default-json-ld.tsx:48-67, and 16 legal MDX files.
6. **support@virtbase.com** is hard-coded in content MDX (legal and marketing, 4 locales) alongside SUPPORT_EMAIL.
7. **Brand literal despite the APP_NAME env override:**
   - email/messages/{en,de,fr,nl}.json:52;
   - disc/utils/create-embed.ts:35, disc/commands.ts:34,46, command-description-localizations.ts (36 strings), 8 feature strings;
   - utils/functions/construct-metadata.ts:93 ("@virtbasecom");
   - utils/constants/urls.ts:22 (app-store slug);
   - the validators OpenAPI text.
8. **Tagline/description, 6 copies:** utils/functions/construct-metadata.ts:25,55; web/ui/seo/default-json-ld.tsx:49; web/app/manifest.ts:25; disc/utils/create-embed.ts:35; web/features/landing/components/discord-bot-demo.tsx:158; content/marketing/en/index.mdx:8,10.
9. **Production host hard-coded instead of derived:**
   - utils/constants/main.ts:31 (email assets; deliberate);
   - utils/constants/urls.ts:24,40,43;
   - email/resend/constants.ts:26-28,32;
   - disc/utils/create-embed.ts:36;
   - api/abuse/mailbox/address.ts:32 ("virtbase.com" fallback);
   - web/lib/csp/index.ts:120 (sentry.virtbase.com);
   - tooling/pve-patches/debian/control:8.
10. **One number, three concepts.** SERVER_DELETION_GRACE_PERIOD_DAYS (5) is the deletion grace (web/app/api/cron/delete-suspended-servers/route.ts:67) and also the renewal-reminder lead time (web/app/api/cron/send-renewal-notifications/route.ts:80,88). `isExpiring` repeats 5 as a separate literal (utils/functions/server-state.ts:56).
11. **OTP lifetime text vs config.** email/messages/{en,de,fr,nl}.json:65,171 say "10 minutes"; the real value is `expiresIn: 600` at auth/plugins/index.ts:134. They will drift if either changes.
12. **Retention is tied to Germany** in text (messages/*.json:57) and in the constant's rationale (utils/constants/limits.ts:88-98).
13. **"UTC" repeated 6 times** (E11).
14. **Locales.**
    - The 4-locale list appears in email/translations/index.ts:27, web/i18n/config.ts:20, lex/messages.ts and api/lib/invoicing.ts:55.
    - Default "en" appears in email/translations/index.ts:28, web/i18n/config.ts:22, disc/utils/map-discord-locale.ts:20, lex/messages.ts:71 and api/lib/invoicing.ts:72.
    - 13 email catalogs (cs, da, el, es, fi, hu, it, no, pl, pt, ro, sv, tr) are maintained through Crowdin (crowdin.yml:4-5) but never loaded (email/translations/index.ts:21-24).
    - Discord commands are localised into 18 locales, while replies map to only 4 (disc/utils/map-discord-locale.ts:23-45).
15. **Email senders.**
    - The SMTP path uses "noreply@example.com" (email/send-via-nodemailer.ts:64) instead of VARIANT_TO_FROM_MAP.
    - It also drops replyTo, cc and attachments (email/index.ts:84-92), so invoice PDFs are not attached in SMTP mode.
    - The "notifications" and "marketing" senders are unused (api/notifications/channels/email.ts:108-109,141-142).
16. **Placeholder audience id in a live step.** RESEND_AUDIENCE_ID is a placeholder (email/resend/constants.ts:18) but is used by a live workflow step (api/workflows/offboard-user/detach-external-services.ts:66), which records success anyway.
17. **Anonpay is configured twice.**
    - Integration settings (anon/index.ts:28-36) and env ANONPAY_* (api/router/checkout.ts:576-580).
    - Widget parameters are copied (anon/adapter.ts:81-89 and api/router/checkout.ts:611-619).
    - The minimum is enforced always in the adapter (anon/adapter.ts:59) but only for EUR in checkout (api/router/checkout.ts:570-571).
18. **Stripe.** The module client pins apiVersion (stripe/client.ts:29); the adapter's client does not (stripe/adapter.ts:204). The two keys (env vs integration secret) can diverge; a detector exists in stripe/get-or-create-customer.ts:24-50.
19. **Discord API base duplicated:** disc/api/client.ts:20 and disc/identity/push-linked-role-metadata.ts:70.
20. **AbuseIPDB default 30 duplicated:** aipdb/config.ts:25 and aipdb/client.ts:218,231 (dead).
21. **Template hardware defaults duplicated:** val/admin/proxmox-templates.ts:84,93-96 and db/schema/proxmox-templates.ts:144,173,179,186,192.
22. **Config cache TTL of 30 s duplicated:** cfg/settings-store.ts:76 and sdk/registry.ts:101.
23. **Two form-metadata types.** `SettingDescriptor.widget` (cfg/settings-store.ts:29-30) lacks the "password" and "url" widgets that `FieldWidget` has (val/field-descriptor.ts:19-26). `defineSettings` and `SettingsStore` have no consumers (LSP shows only their declarations), and the `settings` table (db/schema/settings.ts:32) is unused.
24. **Hookscript filename, 3 copies:** scripts/set-hookscript.sh:29; web/features/admin/lib/proxmox-nodes/hookscript.ts:23; api/workflows/provision-server/apply-hardware-config.ts:109.
25. **HA policy, 2 copies:** scripts/backfill-ha-settings.sh:262-290 and api/workflows/shared/update-ha-settings.ts:52-75 (the comment strings differ).
26. **noVNC viewer host, 3 copies:** val/server/console.ts:29; api/router/servers/console.ts:107; web/lib/csp/index.ts:107.
27. **Console payload lifetime:** 300 s at api/router/servers/console.ts:39, against the proxy's 30 s skew and 3600 s ceiling (nv/payload.ts:27,32).
28. **Avatar host duplicated** (utils/functions/get-gravatar-image.ts:26 and web/lib/csp/index.ts:112); the function name says gravatar but it uses Libravatar.
29. **Unsubscribe default duplicated:** email/send-via-resend.ts:101 and tpl/footer.tsx:43.
30. **Dev hostnames `*.virtbase.localhost`:** 12 literals in utils/constants/main.ts, plus cookies.ts:20, .github/workflows/e2e.yml:58-61, apps/web/next.config.ts:31, packages/test-utils/src/preload.ts:31, README.md:93-96.
31. **Brand colours and assets defined independently:** disc/utils/create-embed.ts:33,36; anon/adapter.ts:86-88; api/router/checkout.ts:616-618.
32. **Base cloud-init snippets.** BASE_SNIPPETS is inserted only by a dev seed script (web-scripts/dev/seed-cloud-init-snippets.ts), so a fresh production database has no base snippets.

#### (3) Totals per classification (144 rows)

| | utils | val | db | email | cfg | sdk | lex | anon | stripe | disc | pdns | aipdb | am | prom | wh | nv | scripts | tooling | Total |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| app setting | 35 | 0 | 1 | 10 | 0 | 0 | 2 | 0 | 1 | 6 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **55** |
| integration setting | 1 | 1 | 0 | 3 | 0 | 0 | 2 | 3 | 0 | 0 | 2 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | **13** |
| keep as code constant | 14 | 2 | 9 | 5 | 1 | 2 | 4 | 2 | 3 | 7 | 0 | 4 | 3 | 2 | 1 | 6 | 3 | 5 | **73** |
| remove | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 1 | 0 | **3** |

The three removals are U18 TRUSTPILOT_PROFILE_URL, AB2 (the dead maxAgeInDays fallback) and SC4 bootsplash.jpg.

**Distinct proposed app-setting keys (51)**

| Namespace | Keys |
|---|---|
| branding.* (14) | name, tagline, description, emailAssetsBaseUrl, emailLogoUrl, iconUrl, accentColor, appleAppStoreId, appleAppStoreUrl, social.{youtube, x, instagram, github, xHandle} |
| support.* (3) | email, discordInviteUrl, lookingGlassUrl |
| company.* (7) | legalName, address.{street, postalCode, city}, managingDirector, commercialRegister, country |
| billing.* (3) | currency, renewalRetryScheduleDays, renewalAuthenticationWindowHours |
| email.* (6) | from.{primary, notifications, marketing}, replyTo, timeZone, defaultLocale |
| accounts.* (5) | maxSshKeys, deletionGracePeriodDays, inactivity.{months, gracePeriodDays, reminderDays} |
| security.* (2) | stepUpWindowSeconds, accountDeletionTokenTtlHours |
| privacy.* (4) | invoiceRetentionYears, dataExportTtlDays, dataExportMinIntervalHours, defaultAvatarProvider |
| servers.* (6) | deletionGracePeriodDays, expiringSoonDays, isoDownloads.{maxActivePerUser, maxSizeBytes, expirationMinutes}, isoCatalog |
| provisioning.* (1) | templateImageRefreshDays |

**Distinct proposed integration-setting keys (15)**

| Integration | Keys |
|---|---|
| trustpilot (new) | reviewUrl, afsEmail |
| novnc (new) | viewerUrl |
| email (new) | resendAudienceId, smtpSecure, smtpVerifyTls |
| lexware | countryContacts, paymentTermDays |
| anonpay | minAmount, stripeMethodId, theme |
| powerdns | ptrTtl, serverId |
| abuseipdb | criticalScore, warningScore |

**Call sites where an async DB-backed read is awkward**

- **Built at module load:**
  - better-auth init: auth/index.ts:91-127, auth/plugins/index.ts:171-175.
  - TRUSTED_REDIRECT_HOSTNAMES: utils/functions/get-safe-redirect-url.ts:24.
  - Retry-ladder derivations: api/billing/retry-schedule.ts:33,59.
- **Synchronous helpers:** `constructMetadata`, `isExpiring`, `getEstimatedServerDeletionDate`, `isTemplateImageFresh`, `findIsoCatalogEntry`.
- **Client components:** see the [cli] tags above.
- **zod schemas:** console host pin, pagination defaults.
- **Email:** `Footer` and `Socials` are synchronous children, and the react-email preview server has no DB.
- **Build time:** next.config.ts, theme.css, Discord emoji PNGs.
- **novnc-proxy binary.**
- **DB column defaults** (changing them needs a migration).
- **next-intl extracted literals** that contain the brand.

---

#### Reader appendix

**R1 — APP_NAME**

- **auth:** auth/plugins/index.ts:171,175 [init]; auth/index.ts:119 [init].
- **utils:** utils/functions/construct-metadata.ts:25,55,60 [srv].
- **api:** api/privacy/export/document.ts:152; api/privacy/export/brand.ts:108; api/router/checkout.ts:608,619 [srv].
- **integrations:** anon/adapter.ts:89 [int]; lex/adapter.ts:113,127 [int].
- **email:** email/translations/index.ts:115.
- **templates (25):**
  - account-inactivity-notice:84,94; server-deleted:70; data-export-ready:89,99; renewal-final-warning:119
  - login-link:60,65,71; notification:84; verify-email-link:60,65,71; abuse-report-reply:63,79
  - reset-password-link:65,71; account-deletion-requested:78,87; server-ready:81,120; server-renewal-reminder:74
  - account-inactivity-reminder:84,94; confirm-identity:67,72,78; verify-email:59,64,70; renewal-payment-failed:111
  - invoice-created:75,84; account-deleted:78; password-updated:62,68; email-updated:65,72
  - payment-method-invalid:96; account-deletion-scheduled:72,81; server-extended:72; account-deletion-cancelled:63,72; server-suspended:74
- **web, server side:**
  - ui/footer.tsx:49,249; ui/get-on-app-store.tsx:35; ui/layout/auth-layout.tsx:50 [rsc]
  - ui/seo/default-json-ld.tsx:43,48,49,87,91 [rsc]
  - app/manifest.ts:23-25 [route]; app/geofeed.csv/route.ts:47 [route]; app/api/og/route.tsx:130 [route]
  - app/(public)/[locale]/checkout/[id]/page.tsx:90,102; app/api/docs/page.tsx:65,83,122,123 [rsc]
  - app/app.virtbase.com/[locale]/(auth)/forgot-password/page.tsx:33,35; register/page.tsx:32,35; login/page.tsx:34,37,60; reset-password/page.tsx:33,35 [rsc]
- **web, client:** ui/nav.tsx:61; ui/layout/colored-layout.tsx:69 (imported by a client file); register/page-client.tsx:44; features/account/components/user-id-card.tsx:50; features/servers/components/advanced/server-id-card.tsx:61.
- **tests:** web-e2e/public/api.e2e.ts:28; utils/functions/__tests__/construct-metadata.test.ts:29.

**R2 — VIRTBASE_WORDMARK (25 templates)**

- account-inactivity-notice:84; server-deleted:70; data-export-ready:89; renewal-final-warning:119; login-link:65
- notification:84; verify-email-link:65; abuse-report-reply:63; reset-password-link:65; account-deletion-requested:78
- server-ready:81; server-renewal-reminder:74; account-inactivity-reminder:84; confirm-identity:72; verify-email:64
- renewal-payment-failed:111; invoice-created:75; account-deleted:78; password-updated:62; email-updated:65
- payment-method-invalid:96; account-deletion-scheduled:72; server-extended:72; account-deletion-cancelled:63; server-suspended:74

**R3 — PUBLIC_DOMAIN**

- **discord:** disc/features/servers/messages.ts:202; disc/features/menu/messages.ts:32 [int].
- **utils / api:** utils/functions/construct-metadata.ts:95; api/router/checkout.ts:598 [srv].
- **email:** tpl/footer.tsx:83,125; tpl/abuse-report-reply.tsx:78.
- **build:** apps/web/next.config.ts:147,176,212.
- **web ui:**
  - ui/app-footer.tsx:32,44,56; ui/layout/auth-layout.tsx:53,63 [rsc]
  - ui/layout/colored-layout.tsx:64 [cli]; ui/nav-user.tsx:141 [cli]
  - ui/seo/offers-json-ld.tsx:112; ui/seo/default-json-ld.tsx:32,33,39,40,41,86 [rsc]
- **web lib:** lib/csp/index.ts:90; lib/hreflang.ts:43.
- **web public pages** under app/(public)/[locale]/ [rsc]: legal/[[...slug]]/page.tsx:76, contact/page.tsx:56, [...slug]/page.tsx:88, page.tsx:69, checkout/return/page.tsx:60, checkout/[id]/page.tsx:96, help/article/[[...slug]]/page.tsx:89,203, help/page.tsx:54, upsell/[from]/[to]/page.tsx:105.
- **other web pages and routes:**
  - app/api/docs/page.tsx:68,84,128 [rsc]
  - app/api/og/route.tsx:137, app/api/serverhunter-pullapi.json/route.ts:49 [route]
  - app/app.virtbase.com/[locale]/(dashboard)/servers/page.tsx:58 [rsc]
  - app/sitemap.ts:40,73,80; app/robots.ts:47 [rsc]
- **web features:**
  - features/account/components/authentication/discord-bot-card.tsx:72, features/account/components/api-keys/api-keys-card.tsx:55 [rsc]
  - features/checkout/components/checkout-waivers.tsx:53,67,89 [cli]; checkout-auth-wrapper.tsx:49 [rsc]; stripe-payment-form.tsx:210 [cli]
  - features/admin/lib/proxmox-nodes/hookscript.ts:62 [srv]
  - features/dashboard/components/empty-servers.tsx:37 [cli]
- **tests:** web-e2e/support/urls.ts:35.

**R4 — APP_DOMAIN**

- **discord** [int]: disc/features/stats/index.ts:165; lifecycle/index.ts:228,319; servers/messages.ts:123,172,250,436; menu/messages.ts:75,136,278.
- **auth:** auth/plugins/index.ts:172 [init]; auth/index.ts:127 [init].
- **api:** api/notifications/deliver.ts:181; api/router/payment-methods.ts:50; api/router/privacy.ts:253 [srv].
- **email:** email/send-via-resend.ts:101.
- **templates:**
  - account-inactivity-notice:105, data-export-ready:79, renewal-final-warning:171, footer:43
  - login-link:42, verify-email-link:42, reset-password-link:42 (these three are preview defaults)
  - server-ready:107, server-renewal-reminder:97, account-inactivity-reminder:105, renewal-payment-failed:150
  - invoice-created:106, email-updated:81, payment-method-invalid:126, account-deletion-scheduled:87, server-suspended:97
- **build:** apps/web/next.config.ts:187,201.
- **web:**
  - ui/footer.tsx:112,120,128 [rsc]; ui/nav.tsx:71,84,93 [cli]
  - lib/middleware/admin.ts:57 [proxy]; lib/csp/index.ts:90; lib/trpc/react.tsx:88 [cli]
  - app/(public)/[locale]/checkout/return/page.tsx:234; app/api/docs/page.tsx:74 [rsc]
  - app/api/privacy/confirm-deletion/route.ts:48 [route]
  - app/app.virtbase.com/[locale]/(auth)/forgot-password/page.tsx:41, register/page.tsx:41, login/page.tsx:43, reset-password/page.tsx:41, two-factor/page.tsx:38 [rsc]
  - features/account/components/billing/add-payment-method.tsx:44 [cli]
  - features/checkout/components/checkout-auth-wrapper.tsx:67,76 [rsc]
  - features/admin/components/users/users-table/columns.tsx:310 [cli]
- **tests:** web-e2e/support/urls.ts:36; api/notifications/__tests__/absolute-url.test.ts:40.

**R5 — constructMetadata callers (55, all [rsc])**

- web/ui/document.tsx:47.
- **web/app/(public)/[locale]/ (9):** legal/[[...slug]]:69, contact:53, [...slug]:81, page:56, checkout/return:55, checkout/[id]:93, help/article/[[...slug]]:82, help:51, upsell/[from]/[to]:102.
- **web/app/admin.virtbase.com/[locale]/ (25):**
  - layout:22; (dashboard)/layout:31; (dashboard)/page:40
  - snippets/[id]:46, snippets:37
  - abuse/[id]:47, abuse:41, abuse/rules:39
  - subnets:37; integrations/[id]:43, integrations:36; datacenters:37; users:36
  - templates/[id]:54, templates:38; subscriptions/[id]:49, subscriptions:39
  - template-groups/[id]:36, template-groups:37; node-groups/[id]:40, node-groups:37
  - notifications:36; emails:36; servers:36; nodes/[id]:32
- **web/app/api/docs/page.tsx:125.**
- **web/app/app.virtbase.com/[locale]/ (19):**
  - (dashboard): abuse/[id]:41, abuse:37, account/layout:23, layout:23, invoices:38, page:36, servers:36
  - (dashboard)/servers/[id]: backups:26, console:25, firewall:31, plan:28, advanced:28, overview:33, rdns:26
  - (auth): forgot-password:38, register:38, login:40, reset-password:38, two-factor:35

**R6 — DEFAULT_EMAIL_LOCALE default parameters**

- api/notifications/deliver.ts:102,110 [srv]; email/translations/index.ts:39,99.
- Templates:
  - account-inactivity-notice:56, server-deleted:47, data-export-ready:59, renewal-final-warning:71, footer:46
  - login-link:43, notification:59, verify-email-link:43, reset-password-link:43, account-deletion-requested:56
  - server-ready:52, server-renewal-reminder:50, account-inactivity-reminder:56, confirm-identity:50, verify-email:42
  - renewal-payment-failed:62, invoice-created:43, account-deleted:55, password-updated:41, email-updated:43
  - payment-method-invalid:63, account-deletion-scheduled:44, server-extended:44, account-deletion-cancelled:42, server-suspended:50

**R7 — `<Footer>` renders (24 templates)**

- account-deletion-cancelled:77, account-deletion-requested:108, password-updated:71, login-link:90, verify-email:78, account-deletion-scheduled:95
- payment-method-invalid:131, notification:107, account-inactivity-notice:113, account-deleted:95, renewal-final-warning:176, confirm-identity:86
- renewal-payment-failed:155, reset-password-link:90, verify-email-link:87, account-inactivity-reminder:110, server-ready:112, data-export-ready:117
- email-updated:86, server-deleted:89, server-renewal-reminder:102, server-suspended:102, invoice-created:111, server-extended:92

**R8 — createEmbed callers (24 sites, all [int])**

- disc/messages/error.ts:83; disc/ui/confirm.ts:63
- disc/features/backups/index.ts:87,224; power/index.ts:75; firewall/index.ts:86,456; stats/index.ts:95; rdns/index.ts:52,128
- disc/features/lifecycle/index.ts:63,170,270,357,411
- disc/features/servers/messages.ts:78,192,246,460,500
- disc/features/menu/messages.ts:52,101,165,210

---

## 3. Consolidated view

### 3.1 Totals per classification

**Environment variables** (section 1.1, the 56 variables the application reads
or sets):

| Classification | Count | Variables |
|---|---|---|
| bootstrap | 21 | `DATABASE_URL`, `CONFIG_ENCRYPTION_KEY`, `BETTER_AUTH_SECRET`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `CRON_SECRET`, `NEXT_PUBLIC_APP_DOMAIN`, `NEXT_PUBLIC_VERCEL_ENV`, `NODE_ENV`, `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_CSP_REPORT_URI`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_URL`, `SENTRY_AUTH_TOKEN`, `VERCEL_URL`, `VERCEL_GIT_COMMIT_REF`, `VERCEL_GIT_PREVIOUS_SHA`, `NEXT_RUNTIME`, `PORT`, `NODE_EXTRA_CA_CERTS` |
| integration | 25 | `stripe` (3), `anonpay` (5), new `resend` (2), new `smtp` (4), new `ai-gateway` (1), new `novnc` (2), new `abuse-mailbox` (2), identity providers `discord`/`github`/`google` (6, deferred) |
| app setting | 1 | `NEXT_PUBLIC_APP_NAME` -> `branding.name` |
| remove | 1 | `npm_lifecycle_event` |
| test/CI only | 8 | `CI`, `VERCEL_AUTOMATION_BYPASS_SECRET`, `E2E_PUBLIC_URL`, `E2E_APP_URL`, `E2E_ADMIN_URL`, `E2E_PORT`, `E2E_SKIP_WEB_SERVER`, `PATH` |

Plus about 40 CI-workflow, docker-compose and dev-tooling inputs (1.4, all
test/CI or dev tooling) and the library-implicit variables (1.3, all
bootstrap/platform).

**Constants** - rows are locations, not distinct settings. Four rows of 2.2
(D1 `APP_NAME`, F1 `SUPPORT_EMAIL`, C1 domains, H4 `ANONPAY_MIN_AMOUNT`)
restate definitions already counted in 2.3, and 2.1's table S lists
constants defined elsewhere; neither is counted twice.

| Classification | 2.1 api + auth | 2.2 web + content + ui | 2.3 libraries + integrations | Total |
|---|---|---|---|---|
| app setting | 70 | 36 | 55 | **161** |
| integration setting | 6 | 4 | 13 | **23** |
| keep as code constant | 67 | 24 | 73 | **164** |
| keep in content (MDX), parameterise | - | 16 | - | **16** |
| keep in content (MDX), nothing to parameterise | - | 6 | - | **6** |
| bootstrap/deploy config | - | 14 | - | **14** |
| remove | 3 | 6 | 3 | **12** |
| **Rows** | **146** | **106** | **144** | **396** |

Rows collapse to fewer keys: several rows feed one key (currency alone is 30
code sites plus 4 column defaults). Section 2.2 proposes about 50 keys and section
2.3 51 app plus 15 integration keys; 2.1's rows map roughly one-to-one.
Integration rows land in `lexware`, `anonpay`, `stripe`, `powerdns`,
`abuseipdb` and the proposed `novnc`, `trustpilot`, `serverhunter`,
`abuse-mailbox` and e-mail integrations.

**Everything proposed for removal** (13 items, each proven unreferenced or
contradicted by the code):

| Item | Location | Proof |
|---|---|---|
| `npm_lifecycle_event === "lint"` | apps/web/src/env.ts:105; packages/auth/env.ts:38; turbo.json:124 | no `lint` script in any `package.json` |
| `MAX_ABUSE_REPORTER_LENGTH` | packages/api/src/abuse/sanitize.ts:20 | declaration only (LSP; grep finds no other use) |
| `cloneGuestStep`, `rollbackCloneGuestStep` | packages/api/src/workflows/shared/clone-guest.ts:34,69 | LSP findReferences returns only the declaration |
| `COLOR_BACKGROUND` | packages/api/src/privacy/export/brand.ts:46 | declaration only |
| `Wordmark` | packages/ui/src/wordmark.tsx:20 | no import of `@virtbase/ui/wordmark` anywhere |
| Privacy-policy sections on Google Analytics, a cookie banner and a contact form | packages/content/legal/*/privacy.mdx:75, 121-154, 172-194 (x4 locales) | no analytics dependency or consent code in apps/web; contact page has no form |
| ServerHunter location and OS list | apps/web/src/app/api/serverhunter-pullapi.json/route.ts:74, 76-78 | redundant copies of `datacenters`/templates data |
| Hard-coded datacenter `dc_1` | apps/web/src/features/checkout/components/offer-row.tsx:62-66; checkout/[id]/page.tsx:129-133; upsell/[from]/[to]/page.tsx:169-173 | marked "TODO: Make dynamic"; DB has a `datacenters` table |
| OS showcase list | apps/web/src/features/landing/components/operating-system-showcase.tsx:20-41 | redundant copy of template data |
| `TRUSTPILOT_PROFILE_URL` | packages/utils/src/constants/urls.ts:42-43 | declaration only (LSP) |
| AbuseIPDB `maxAgeInDays` fallback | packages/integration-abuseipdb/src/client.ts:218,231 | every caller passes a value |
| `scripts/bootsplash.jpg` | scripts/bootsplash.jpg | no reference in the repository |

### 3.2 Shared settings: values read by more than one package

These are the settings that must be defined once (in a shared namespace) and
read by several packages or integrations - the "settings across multiple
extensions" case of R5.

| Canonical key | Defined today | Read by | Notes |
|---|---|---|---|
| `branding.name` | packages/utils/src/constants/main.ts:18 (env, fallback "Virtbase") | apps/web, api, auth, email, integration-anonpay, integration-lexware, utils (54 files incl. 2 tests, LSP) | Literal "Virtbase" bypasses it in integration-discord (embed footer, 38 command strings, 8 screen strings), the e-mail catalogs, 17 web msgids, api copy, and 552 MDX occurrences. Hardest value to move (1.2 #47). |
| `support.email` | utils main.ts:24 | utils, api (checkout.ts:612), email (send-via-resend.ts:93, server-ready.tsx:121), integration-anonpay (adapter.ts:82), apps/web (4 server components) | Also hard-coded in security.txt:1, instrumentation-client.ts:56 and MDX in 4 locales. |
| `company.legalName`, `company.address.*`, `company.registerCourt`, `company.registerNumber`, `company.vatId`, `company.taxNumber`, `company.managingDirector` | three diverging copies: packages/email/src/templates/footer.tsx:136-142; apps/web/src/ui/seo/default-json-ld.tsx:48-79; packages/content/legal/*/{notice,privacy,revocation,terms}.mdx | email (24 templates, including the invoice e-mail), apps/web (JSON-LD, footer msgid footer.tsx:246 in 17 catalogs), content | The copies differ: no VAT id in the e-mail footer, "CEO" vs "Managing Director", the region spelled three ways. |
| `company.country` | packages/integration-lexware/src/constants.ts:56 (`HOME_COUNTRY`) | integration-lexware (also a literal "DE" at adapter.ts:88), api (`EU_VAT_RATES` assumes a German seller, lib/invoicing.ts:23-72), apps/web (default-json-ld.tsx:56, geofeed route.ts:29), email (messages/*.json:57 "German tax law"), utils (limits.ts:88-98 rationale) | Confirms the R5 example: Lexware, the invoice e-mail and the legal pages all need the seller identity. |
| `billing.currency` | none - "EUR" in 4 DB column defaults (packages/db/src/schema/orders.ts:76, payments.ts:70, subscriptions.ts:111,308) and 30 code sites | db, api (7 sites), integration-lexware, -stripe, -discord (1 each), -anonpay (minimum in EUR cents), email (4 sites in 3 templates), apps/web (16 sites, mostly client components) | DB defaults need a migration; invoice rows have no currency column (packages/api/src/privacy/export/document.ts:384-385). |
| `billing.allowedCountries`, `billing.taxRates` | three copies of the same 26 codes: integration-lexware constants.ts:26-53, api lib/invoicing.ts:23-49, apps/web stripe-payment-form.tsx:41-68 | integration-lexware, api, apps/web (client) | Greece is missing from all three. The Lexware contact id per country is tenant data -> `lexware.countryContacts`. |
| `app.defaultLocale` (enabled locales stay bootstrap) | email translations/index.ts:27-28; apps/web i18n/config.ts:20,22 | email, apps/web, integration-lexware, api (invoicing, export, notifications), integration-discord | 13 of 17 e-mail catalogs are never loaded. |
| `branding.tagline`, `branding.description` | utils functions/construct-metadata.ts:25,55 | utils, apps/web (manifest, JSON-LD, landing demo), integration-discord (create-embed.ts:35), content | 6 copies. |
| `social.*` (youtube, x, instagram, github, discord invite) | utils constants/urls.ts:18-32 | utils, email (templates/socials.tsx:34-40), apps/web (lib/socials.ts:33-59, JSON-LD `sameAs`, contact page) | Two lists in different orders. |
| `branding.logo`, `branding.icons`, `branding.emailAssetsBaseUrl` | utils main.ts:31-33; packages/ui/src/logo.tsx:20-46; app icon files; api privacy/export/brand.ts:29-36 | email (25 templates), apps/web, integration-discord (create-embed.ts:36), api (PDF export) | Assets need upload storage; manifest and OG image are cached immutably for a year. |
| `servers.deletionGracePeriodDays` | utils limits.ts:24 | utils (server-state.ts:84, used by client components), email (4 templates), apps/web (2 crons) | Also reused as the renewal-reminder lead time. |
| `accounts.deletion.*`, `accounts.inactivity.*`, `privacy.export.*`, `legal.invoiceRetentionYears` | utils limits.ts:98-157 | api, email, apps/web (client card) | Restated (wrongly) in help MDX. |
| `billing.dunning.retryScheduleDays` | utils limits.ts:179 (derived :209-210) | api (retry-schedule.ts, dunning-mail.ts), apps/web (cron suspend-terminated-servers) | Derived values are computed at module load. |
| `security.password.minLength` / `maxLength` | packages/auth/src/password-policy.ts:63-64 | auth, validators (auth.ts:23-25, zod shared with client forms), apps/web (6 client files) | |
| `email.from.*`, `email.replyTo` | packages/email/src/resend/constants.ts:25-29; send-via-resend.ts:93 | email, api (notifications channel, abuse mailbox) | SMTP path ignores both. |
| `anonpay.minAmount` | integration-anonpay constants.ts:21 | integration-anonpay, api (checkout.ts:570), apps/web (client) | |
| `novnc.clientUrl` | api router/servers/console.ts:107 | api, validators (server/console.ts:29 zod pin), apps/web (CSP, csp:107) | |
| `trustpilot.*` | utils urls.ts:39-43; email resend/constants.ts:31-32 | utils, email, api (send-server-ready-email.ts:79-83) | Token-bearing address -> secret. |
| `privacy.avatarProvider` | utils functions/get-gravatar-image.ts:26 | utils, auth (index.ts:172), apps/web (CSP) | |
| `servers.iso.*` (catalog and limits) | utils constants/iso-catalog.ts, limits.ts:29-39 | utils, api, apps/web | |
| `abuse.defaultResponseHours` | api abuse/case.ts:215 (+ :209, :421) | api, db (abuse-rules.ts:81 default), apps/web (manage-abuse-cases.ts:352 observation window) | |
| `abuseipdb.blockPrefixLength` | api abuse/poll.ts:43 | api, integration-abuseipdb (declared setting that nothing reads) | |

Bootstrap values that are also shared (they stay in the environment):
`NEXT_PUBLIC_APP_DOMAIN`-derived origins (utils, apps/web, api, auth, email,
integration-discord), `CONFIG_ENCRYPTION_KEY` (api integrations,
notifications, orders, abuse mailbox), `CRON_SECRET` (web routes and the
hookscript on every Proxmox node), `BETTER_AUTH_SECRET` (auth instances, proxy,
cron, offboarding step).

### 3.3 Key normalisation

Sections 2.1, 2.2 and 2.3 sometimes name the same concept differently. Canonical keys used in 3.2:

| Concept | 2.1 | 2.2 | 2.3 | Canonical |
|---|---|---|---|---|
| Brand name | `branding.name` | `app.name` | `branding.name` | `branding.name` |
| Default locale | `app.defaultLocale` | - | `email.defaultLocale` | `app.defaultLocale` |
| Social links | - | `social.*` | `branding.social.*`, `support.discordInviteUrl` | `social.*` |
| Looking glass, app store | - | `app.links.*` | `support.lookingGlassUrl`, `branding.appleAppStore*` | `app.links.*` |
| Invoice retention | `legal.invoiceRetentionYears` | - | `privacy.invoiceRetentionYears` | `legal.invoiceRetentionYears` |
| Account deletion | `privacy.deletion.*` | - | `accounts.deletionGracePeriodDays`, `security.accountDeletionTokenTtlHours` | `accounts.deletion.{gracePeriodDays,tokenTtlHours}` |
| Inactivity | `privacy.inactivity.*` | - | `accounts.inactivity.*` | `accounts.inactivity.*` |
| Data export | `privacy.export.*` | - | `privacy.dataExport*` | `privacy.export.*` |
| ISO limits | `servers.iso.*` | - | `servers.isoDownloads.*` | `servers.iso.*` |
| Dunning schedule | `billing.dunning.retryScheduleDays` | - | `billing.renewalRetryScheduleDays` | `billing.dunning.retryScheduleDays` |
| Renewal authentication window | `billing.renewals.authenticationWindowHours` | - | `billing.renewalAuthenticationWindowHours` | `billing.renewals.authenticationWindowHours` |
| noVNC viewer | `novnc.clientUrl` | `novnc.clientUrl` | `novnc.viewerUrl` | `novnc.clientUrl` |
| Default avatar | `privacy.gravatarEnabled` | - | `privacy.defaultAvatarProvider` | `privacy.avatarProvider` |
| Anonpay method id | (1.2: `anonpay.stripePaymentMethodId`) | - | `anonpay.stripeMethodId` | `anonpay.stripePaymentMethodId` |
| Commercial register | - | `company.registerCourt`, `company.registerNumber` | `company.commercialRegister` | `company.registerCourt` + `company.registerNumber` |
| Company town | - | `company.address.locality` | `company.address.city` | `company.address.locality` |

### 3.4 Conflicting classifications, resolved

- **`BACKUP_STALE_AFTER_HOURS`** (packages/utils/src/constants/limits.ts:46,
  12 h). 2.1 proposes `backups.staleAfterHours`; 2.3 keeps it. **Keep as code
  constant**: limits.ts:41-44 ties it to the Proxmox task index - a `vzdump`
  task older than this has already dropped out of the node's task index, so
  raising the value cannot rescue anything. Revisit only together with the
  nodes' task-log retention. (The brief cited it as an operator knob; the code
  says it is not one.)
- **Domain and hostname literals** - 2.2 says "bootstrap/deploy config", 2.3
  "keep as code constant". Same outcome: the env-derived origins stay
  bootstrap (1.2 #7), the dev/preview literals (`*.virtbase.localhost`,
  `staging.`) stay in code.
- **`ANONPAY_MIN_AMOUNT`** - 2.1 keeps it as provider-dictated; 2.2/2.3 make it
  `anonpay.minAmount`. **Integration setting**, defaulting to the provider
  minimum: it becomes currency-dependent as soon as `billing.currency` is a
  setting (checkout.ts:570-571 only enforces it for EUR today).
- **`DEFAULT_EMAIL_LOCALE`** - 2.3 proposes `email.defaultLocale` and keeps the
  web default in code; 2.1 proposes `app.defaultLocale`. **`app.defaultLocale`**
  for e-mail, invoices, export and notifications; the web routing default
  (`apps/web/src/i18n/config.ts:22`) stays bootstrap because it is compiled into
  routing, proxy and static params.

### 3.5 The most consequential findings from the constants

Each was confirmed against the source.

1. **The AbuseIPDB "Block size" setting does nothing.** It is declared,
   validated and shown in admin (packages/integration-abuseipdb/src/config.ts:33,
   index.ts:61), but the roll-up uses `DEFAULT_BLOCK_PREFIX`
   (packages/api/src/abuse/poll.ts:43,87,111); the cron passes no value.
2. **The Resend audience id is a placeholder string**
   (packages/email/src/resend/constants.ts:18), used by the live erasure step,
   which records `unsubscribed = true` whether Resend errors or is not
   configured (packages/email/src/resend/unsubscribe.ts:20-31;
   packages/api/src/workflows/offboard-user/detach-external-services.ts:64-68).
3. **Discord and GitHub OAuth revocation most likely fails silently**
   (revoke-external-identities.ts:24-28,80-86): no client credentials, an
   incomplete GitHub URL, and every HTTP response counted as revoked.
4. **Company identity exists in three diverging copies** (3.2) plus a msgid
   that embeds the legal name in 17 catalogs (apps/web/src/ui/footer.tsx:246).
5. **Content contradicts code.** The privacy policy describes Google Analytics,
   a cookie banner and a contact form that do not exist and omits Stripe,
   Sentry (with 10 % session replay, apps/web/src/instrumentation-client.ts:73),
   Resend and others; help articles state wrong values (console links "ten
   seconds" vs 300 s at packages/api/src/router/servers/console.ts:39; renewal
   "30 days" vs a calendar month; deletion "immediate" vs a 14-day grace).
6. **The geofeed puts every subnet at the registered office in Saxony**
   (apps/web/src/app/geofeed.csv/route.ts:29-39) while the servers are in the
   Netherlands (ServerHunter feed route.ts:76-78, datacenter MDX).
7. **Template hardware never reaches the VM**: the template's cpu, machine and
   ostype (create-guest-from-image.ts:76-79) are overwritten by
   `cputype=host`, `q35`, `l26` in the same workflow
   (apply-hardware-config.ts:91,101,106).
8. **The SMTP fallback drops reply-to, cc and attachments** - invoice PDFs are
   not attached when SMTP is used (packages/email/src/index.ts:82-92) - on top
   of the placeholder sender and disabled TLS verification (finding 13 in
   section 0).
9. **Lexware invoices are German or English only**, while fr/nl copy exists
   (packages/integration-lexware/src/adapter.ts:88 vs messages.ts:45-60).
10. **Base cloud-init snippets are seeded only by a dev script**
    (packages/utils/src/cloud-init/base-snippets.ts:37-149;
    apps/web/scripts/dev/seed-cloud-init-snippets.ts), so a fresh production
    database starts without them.
11. **13 of 17 e-mail catalogs are translated but never loaded**
    (packages/email/src/translations/index.ts:21-27; crowdin.yml:4-5).
12. **Static content is cached for a long time.** Manifest, icons and OG image
    are `immutable` for a year (apps/web/next.config.ts:115-141;
    og/route.tsx:144) and every public page is `cacheLife("max")` plus
    `s-maxage=300, stale-while-revalidate=86400` at the edge
    (next.config.ts:142-156). Any DB-backed branding or company setting needs
    tag invalidation and versioned asset URLs, or edits will not show up.

