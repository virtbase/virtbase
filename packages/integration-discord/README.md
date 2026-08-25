# @virtbase/integration-discord

Server management from Discord, and account linking via Discord.

The bot is an integration like any other: its credentials live in the
configuration store, it fills the `identity` capability port, and it consumes
`serverManagement` to answer interactions. It never imports `@virtbase/api`.

## Setup

There are no environment variables. Everything is configured in the admin
console at `/admin.virtbase.com/integrations/discord`:

| Field | Where it comes from |
| --- | --- |
| Application ID | General Information in the Discord developer portal |
| Bot token | Bot → Reset Token |
| Public key | General Information |

Enabling the integration runs `onEnable`, which registers the slash commands,
the role-connection metadata and the emojis. There is no script to run. If a
registration fails, the switch reports it and the health cron retries.

`DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` still exist, but they belong to
better-auth's social login, not to this package.

## How registration works

`src/sync/` holds one reconciler per resource Discord stores on our behalf.
Each reads the live state, compares it against what this package declares, and
writes only on drift:

| Reconciler | Declared in |
| --- | --- |
| `commands` | `src/commands.ts` |
| `role-connections` | `src/role-connections-metadata.ts` |
| `emojis` | `src/emoji/manifest.ts` |

`runDiscordSync()` runs all three from two places — `onEnable`, and `health` on
every probe. Because `/api/cron/check-integration-health` runs every thirty
minutes, a command deleted by hand in the developer portal comes back on its
own, and a deployment that adds one does not need a release step.

Comparison goes through `canonical()`, which drops the fields Discord adds
itself (`id`, `application_id`, `version`) and normalizes key order. Getting
that wrong means re-registering on every probe rather than never — the tests in
`src/sync/__tests__` pin both directions.

## Architecture

```
src/
  api/        the only place that speaks HTTP to Discord
  sync/       desired-state reconcilers (commands, metadata, emojis)
  routing/    custom_id encoding — Discord hands back nothing else
  features/   one directory per capability, each a DiscordFeature descriptor
  ui/         embeds, buttons, selects, modals, confirmations
  handlers/   interaction context, deferral, and the three routing tables
  emoji/      the distro emoji manifest and resolver
```

### Adding a feature

1. Create `src/features/<name>/index.ts` exporting a `DiscordFeature`:

   ```ts
   export const thingFeature: DiscordFeature = {
     id: "thing",
     buttons: {
       menu: (ctx) => ctx.deferred(() => render(ctx), { update: true }),
     },
   };
   ```

2. Add it to `FEATURES` in `src/features/index.ts`.

Nothing else changes. The three routing tables are derived from the
descriptors, so no dispatcher is edited and a duplicate route fails at import
rather than silently shadowing.

Handlers registered as a bare function require a linked Virtbase account and
receive `ctx.user` already narrowed — the router sends everyone else to the
setup screen. Wrap a handler in `unlinked()` to opt out; only the entry points
(`/menu`, `/help`, `/invite`) do.

### Deferring

Discord closes an interaction that is not answered within three seconds, which
does not survive a hypervisor round trip. Any handler that touches a server
returns `ctx.deferred(work)`: the acknowledgement goes back immediately and the
message is edited when `work` resolves, through `ctx.waitUntil` — backed by
Next's `after()` in the webhook dispatcher.

A modal is the one thing that cannot be deferred. Handlers that open one return
it directly, which is fine because opening a form touches nothing.

### Custom ids

Components are stateless: Discord hands back only the `custom_id`, so every id a
handler needs is encoded into it as `kind:feature:action:a|b`. `encodeCustomId`
asserts Discord's 100-character limit, because exceeding it does not raise an
error — it drops the whole message.

## Emojis

`assets/emoji/*.png` are committed, and `sync/emojis.ts` uploads them as
application emojis, which render in every server the bot answers in. Names carry
a `vb_` prefix and the reconciler only ever deletes those, so an emoji added by
hand survives.

Regenerate them from the site's distro artwork after the artwork changes:

```bash
bun run discord:emojis
```

That rasterizes `apps/web/public/assets/static/distros/*.svg` to 128×128 PNGs
with Playwright. It is a development script — nothing rasterizes at runtime.

## Local development

Discord only delivers interactions to a public HTTPS URL, so local development
needs a tunnel:

```bash
bun dev                 # or bun dev:next
bun run discord:tunnel  # prints the public URL
```

Then set **Interactions Endpoint URL** in the Discord developer portal to
`<tunnel-url>/api/integrations/discord/interactions`.

Discord verifies the endpoint by sending an unsigned ping, and deregisters it if
an unsigned request is answered with anything but a 401. The webhook checks the
signature against the raw body before anything else, and answers the ping before
resolving a user or a capability — so endpoint verification does not depend on
the database being up.

A disabled or misconfigured integration answers 404 on that path, the same as an
unknown one, so the endpoint cannot be used to enumerate what is installed. If
Discord reports the URL as invalid, check that the integration is enabled and
that the public key matches.

## Tests

```bash
bun test --filter @virtbase/integration-discord
```

Handlers are tested against a fake `ServerManagementPort` and the real router,
so a test exercises the same routing, account check and deferral the webhook
does. `next-intl/server` is stubbed to return message ids, which is what lets a
test assert on what a screen says without a message catalogue.
