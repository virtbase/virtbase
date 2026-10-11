# ADR 0014: Social login stays in the environment until after Phase 5

- Status: Accepted (2026-10-11, decision D4)
- Date: 2026-10-11
- Requirements: R5, R7

## Context

R5 asks whether to make Google, GitHub and Discord login configurable
`identity` integrations. How login is wired today:

- **The provider list is fixed at build time of the instance.**
  - `initAuth()` (`packages/auth/src/index.ts`) builds better-auth 1.7.7 with
    the drizzle adapter.
  - It reads the six social client IDs and secrets from `process.env`.
  - The app constructs one instance at module load
    (`apps/web/src/lib/auth/server.ts`).
  - better-auth accepts the provider list as an async function, but evaluates
    it once, when the instance initialises. A changed provider therefore needs
    a new instance.
- **There is a workaround, and it is fragile.** A plugin can swap the provider
  list per request through an undocumented path. Parts of better-auth read that
  list synchronously.
- **The buttons are hard-coded.** The login form, the signup form and the
  account's provider list all show all three providers, even when their
  variables are missing. Clicking one then fails with "provider not found".
  Both forms already accept a `methods` prop.
- **Discord's application ID lives in two places.** Login uses
  `DISCORD_CLIENT_ID`; the integration uses `settings.appId`, for role
  connections. Nothing checks that they match. `role_connections.write` is
  requested on every Discord login, even when the integration is off.
- **Most callers would adapt easily.** 17 files use the shared instance. Only
  the auth route uses it at module load, and `toNextJsHandler` accepts a
  function. The proxy builds its own instance for reading sessions and needs no
  providers.
- **The layer rule forbids the alternative.** It stops `@virtbase/auth`
  importing provider packages (`platform-no-provider-code`). Credentials would
  have to be passed into `initAuth()` from the composition root.

## Options

1. **Move now.** Build better-auth from configuration behind a `getAuth()` cache
   with a 30-second TTL and local invalidation. Add Google and GitHub
   integration packages, and move Discord's login credentials into the Discord
   integration. About 55 files.
2. **Move later, with an interim fix now.** About 6 to 8 files.
3. **Never move:** social login stays bootstrap configuration for good.

## Decision

Option 2.

### Now, in Phase 2

- **Show only working buttons.** One helper derives the enabled providers from
  the environment and passes them to the login form, the signup form and the
  account provider list.
- **A health warning in the Discord integration** when its `appId` differs from
  `DISCORD_CLIENT_ID`.
- **Ask for `role_connections.write` only when needed:** when the Discord
  integration is active.
- **The six variables are classified as *deferred integration*** in the
  inventory. They are allowed in the `process.env` gate's bootstrap list with
  that label, and the label is removed when they move.

### Later (after Phase 5, its own PR series)

Identity integrations, built on the patterns Phases 1 to 5 will have proven:

- the manifest;
- multi-installation;
- `getAuth()` construction from the configuration store;
- a tagged cache (`cacheTag("auth-providers")`) for the prerendered login page.

## Consequences

- **Rotating an OAuth secret still needs a redeploy** until the move. Same as
  today.
- **Disabling a provider later behaves predictably:**
  - existing sessions and account rows survive;
  - signing in and linking with that provider stop;
  - unlinking still works;
  - users keep email OTP and magic-link sign-in.
- **The move adds two ways to lose social login:** a missing
  `CONFIG_ENCRYPTION_KEY`, and a fresh database. The move's PR has to put that
  in the operator documentation.
- **Admin access needs hardening anyway.** The auth review found that an admin
  demoted or banned keeps write access for up to five minutes through the
  cookie cache, and that TOTP is only enforced after password sign-in. Both are
  scheduled in [risks.md](../risks.md#pre-existing-defects), independent of this
  decision.
