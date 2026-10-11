# ADR 0011: Global settings extend `SettingsStore`, with secret settings, an audit log and a one-time import

- Status: Accepted (2026-10-11)
- Date: 2026-10-11
- Requirements: R5, R7

## Context

The [configuration inventory](../env-inventory.md) found:

- **56 environment variables** in all:
  - 21 bootstrap;
  - 25 integration, 6 of them social login;
  - 1 app setting;
  - 1 dead;
  - 8 test or CI only.
- **396 configuration-like constant locations,** 161 of them app settings and 23
  integration settings.
- **`defineSettings` and `SettingsStore` have no callers.**
- **Values meant to be shared are duplicated, and the copies differ:**
  - company identity is in three places: the email footer, the JSON-LD and the
    legal MDX in four locales;
  - "EUR" is hard-coded in 30 code sites and 4 column defaults;
  - the same 26-country list exists three times, with Greece missing from all
    three.
- **The brand name and support address live in Layer 0.** `@virtbase/utils`
  holds `APP_NAME` (read in 54 files), the domains and `SUPPORT_EMAIL` as
  module-load constants. Layer 0 cannot read the database.
- **Public content is cached for a long time.** Public pages are
  `cacheLife("max")`; manifest, icons and the OG image are `immutable` for a
  year. A database-backed brand or company setting needs tag invalidation and
  versioned asset URLs, or an edit never shows.
- **Stripe and Anonpay are configured twice.** The integrations declare the
  secrets and the payment port uses them, but checkout, both webhooks and the
  module-level Stripe client read the environment. The two sources can
  disagree.
- **`bun script` cannot carry an import:** it always exits 0, has no stdin, and
  turbo drops shell variables from the `script` task.

## Decision

### One settings registry, in namespaces

Core declares its settings in `packages/api/src/settings/<namespace>.ts` with an
extended `defineSettings`. The composition root merges them.

```ts
export const company = defineSettings({
  "company.legalName": { schema: z.string().min(1), fallback: "", field: { widget: "text" }, scope: "public" },
  "company.vatId": { schema: vatId.optional(), fallback: undefined, field: { widget: "text" }, scope: "public" },
  "company.country": { schema: countryCode, fallback: "DE", field: { widget: "country" }, scope: "server" },
});
```

The descriptor now carries four things:

- **a field descriptor,** the same type integration forms use, rendered by the
  same form code;
- **a `scope`:**
  - `public`: may be sent to the browser, for example `branding.name`;
  - `server`: never leaves server code;
- **`secret: true`,** for values stored encrypted ([§ below](#secret-settings));
- **labels from a translated `localize()`,** like integrations
  ([ADR 0018](0018-translation-standard.md)).

The namespaces, and the canonical keys the inventory uses:

| Namespace | Holds |
| --- | --- |
| `app.*` | default locale, links |
| `branding.*` | name, tagline, description |
| `company.*` | legal name, address, register, VAT and tax IDs, managing director, country |
| `support.*` | contact addresses |
| `social.*` | social links |
| `billing.*` | currency, allowed countries, tax rates, dunning and renewal schedules |
| `accounts.*` | deletion and inactivity periods |
| `privacy.*` | export limits, avatar provider |
| `legal.*` | invoice retention |
| `security.*` | password policy |
| `email.*` | sender identity |
| `servers.*` | deletion grace period, ISO limits |
| `abuse.*` | default response time |
| `features.disabled` | the override list ([ADR 0007](0007-features-and-effective-state.md)) |

### Integrations use their installation settings, and read shared ones

There is no second, global settings mechanism for integrations.

- **Their own configuration** is their installation settings. The audit log and
  admin search address it as `<integration>[.<slug>].<key>`.
- **Shared settings** are read through `ctx.settingsOf(key)`. It is typed by the
  core registry and read-only, so Lexware, the invoice email and the legal pages
  all read the same `company.*` values.

### Reading settings

**The cache.** `SettingsStore.get` keeps its 30-second in-process cache.
`getSettings(namespace)` adds `'use cache'` with `cacheTag("settings:<namespace>")`,
reading the database directly. The admin server action calls
`updateTag("settings:<namespace>")`, so the change is visible on the next
request.

**Static content follows its namespace's tag:**

- the manifest becomes a cached function with the branding tag;
- the OG image and icon URLs carry a settings revision, so the immutable
  caching stays correct;
- legal MDX reads company identity through an MDX component, `<Company field="legalName" />`,
  instead of literal text.

**Layer 0 stops owning values that move.**

- `APP_NAME` and `SUPPORT_EMAIL` become parameters. Layer 5 resolves them and
  passes them to `@virtbase/utils`, `@virtbase/email` and `@virtbase/auth`.
- Client components get them as props, or through a `BrandingProvider` mounted
  by the root layouts.
- Domains stay bootstrap, and stay in `@virtbase/utils`.

**One exception stays in the environment until the auth instance is built
lazily.** better-auth's passkey
`rpName` and TOTP `issuer` keep reading the bootstrap app name until the auth
instance is built lazily ([ADR 0014](0014-social-login-stays-in-env-for-now.md)).
Changing them only renames future TOTP entries.

### Secret settings

**A few app settings are secret,** such as the separate hookscript secret
([ADR 0013](0013-proxmox-stays-core-for-now.md)) and the token-bearing Trustpilot
address. They live in a new table, `setting_secrets` (key, ciphertext).

**They use the same envelope encryption as integration secrets:** one settings
data key, stored wrapped by `CONFIG_ENCRYPTION_KEY` in a new `config_keys` row.

**Secret settings are write-only in the UI,** and never `public`.

**One rotation script covers every wrapped key:**

- installation data keys;
- the settings key;
- notification target keys;
- the new Proxmox node token keys.

It is tested end to end.

### The audit log

`config_audit_log` (`aud_`) records every configuration write:

| Column | Holds |
| --- | --- |
| `occurred_at` | when |
| `actor_type`, `actor_user_id` | who: a user, the system, or the import script |
| `action` | what: `setting.updated`, `integration.installed` / `enabled` / `disabled` / `configured` / `secret_updated` / `uninstalled`, `feature.override_changed` |
| `target`, `key` | which setting, or which installation and field |
| `old_value`, `new_value` | for secrets, both are always null, and the row says only that the value changed |
| `request_id` | the request that made the change |

**Retention and privacy.** It is kept for two years. It is registered in
`SUBJECT_DATA`; on erasure, `actor_user_id` is set to null and the row is kept.

**Where it is shown.** A tab on the settings page, and one on each integration's
page.

### The one-time import

`bun script config/import-env --from <file> [--apply]` reads an env file. It does
not read the process environment, because turbo filters that for scripts. It
maps each variable as the inventory classifies it.

**A dry run is the default.** It prints every target key, masks every secret,
and lists the integrations it would install and enable. An integration is
enabled only when it is effectively on today: Stripe always, Anonpay when its
four variables are set.

**`--apply` writes,** in one transaction per target, with audit entries whose
`actor_type` is `script`.

**It is safe to run again,** and it refuses to run without
`CONFIG_ENCRYPTION_KEY`.

`bun script` is fixed in Phase 1 so that exit codes propagate and the script can
prompt.

### Each value moves in two releases

1. **Release N** adds the store fields and the import. It reads the store
   when the installation is active, and falls back to the environment
   otherwise. This fallback is the one exception to "no environment fallback"
   in `AGENTS.md`, and lives for this single release.
2. The operator imports, enables and verifies in admin, on release N.
3. **Release N+1** removes the fallback and reads the store only.
4. The variables are deleted from the deployment after a week. Until then,
   redeploying N is a full rollback.

The runbook is in
[migration-plan.md §4](../migration-plan.md#4-configuration-from-the-environment-into-the-store).

### The CI gate

A test under `tooling/env-gate` scans every tracked source file for environment
reads: `process.env.X`, `process.env["X"]`, destructuring and `Bun.env`. It
fails on any variable that is not in the bootstrap allowlist
([env-inventory.md](../env-inventory.md#bootstrap-allowlist)), or in the
phase-scoped exception list.

- **Phase 1 starts the gate as a ratchet:** today's reads are allowed, new ones
  are not.
- **Phase 2 ends it at the bootstrap list.**
- **Biome's `style/noProcessEnv` adds editor feedback** outside the bootstrap
  modules. It cannot allowlist by name, which is why the test is the gate.

## Consequences

- **Once Stripe moves, `apps/web/src/env.ts` stops requiring it,** so Stripe can
  be switched off and the double configuration disappears.
- **A platform-neutral `APP_ENV` replaces `NEXT_PUBLIC_VERCEL_ENV` as the
  "production" switch.** It is bootstrap, and defaults from `VERCEL_ENV`. That
  stops a non-Vercel deployment from silently sending every email to
  `delivered@resend.dev`. Lexware's `finalize` switches from `NODE_ENV` to
  `APP_ENV`, so preview deployments stop finalizing real invoices.
- **The turbo build hash stops including runtime secrets** (`turbo.json`
  `build.env`, `apps/web/turbo.json`'s `.env` input). Rotating a credential no
  longer invalidates the build cache.
- **Image settings wait for object storage.** The logo, icons and email asset
  base URL need somewhere to upload to, and nothing provides `objectStore`
  today. They stay as code assets until a provider exists.
- **The admin console gets a `/settings` area** with generated forms per
  namespace. No settings page is hand-written.
