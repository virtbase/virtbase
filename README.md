<a href="https://virtbase.com">
  <img alt="Hosting, but secure. Virtbase is providing secure and open-source VPS hosting." src="https://raw.githubusercontent.com/virtbase/virtbase/main/.github/assets/banner.png">
</a>

<h3 align="center">Virtbase</h3>

<p align="center">
    Hosting, but secure.
    <br />
    <a href="https://virtbase.com"><strong>Learn more »</strong></a>
    <br />
    <br />
    <a href="#getting-started"><strong>Getting Started</strong></a> ·
    <a href="#tech-stack"><strong>Tech Stack</strong></a> ·
    <a href="#contributing"><strong>Contributing</strong></a>
</p>

<p align="center">
  <a href="https://twitter.com/virtbasecom">
    <img src="https://img.shields.io/twitter/follow/virtbasecom?style=flat&label=%40virtbasecom&logo=twitter&color=0bf&logoColor=fff" alt="Twitter" />
  </a>
  <a href="https://github.com/virtbase/virtbase/blob/main/LICENSE.md">
    <img src="https://img.shields.io/github/license/virtbase/virtbase?label=license&logo=github&color=f80&logoColor=fff" alt="License" />
  </a>
  <a href="https://crowdin.com/project/virtbase" target="_blank" title="Crowdin">
    <img src="https://badges.crowdin.net/virtbase/localized.svg" alt="Crowdin" />
  </a>
</p>

## Getting Started

You need [Bun](https://bun.com) and Docker. `scripts/setup.sh` does the rest and
is safe to re-run - every step checks whether it is already done.

```bash
bun install
bun setup
```

`bun setup` copies `.env.example` to `.env`, starts Postgres, the Neon proxy and
Redis from `docker-compose.yml`, applies the migrations and seeds the database.
Use `bun setup:cluster` to also build and bootstrap the local Proxmox cluster in
`tooling/proxmox-cluster` (it needs `/dev/kvm`) - nothing can be provisioned
without one.

### Filling in `.env`

The copied example does not boot as it stands. `@t3-oss/env` validates the
environment when the app starts, and an **empty** value fails exactly like a
missing one, so every key the example leaves blank has to be given a value or
commented out.

- Give a value to `BETTER_AUTH_SECRET`, `CRON_SECRET`, `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`,
  `NOVNC_PROXY_URL` and `NOVNC_PROXY_SECRET`. Any non-empty string will do for
  the ones you are not exercising; the feature behind it simply stays broken.
- Point Redis at the container `docker-compose.yml` already runs:
  `UPSTASH_REDIS_REST_URL=http://localhost:8079` and
  `UPSTASH_REDIS_REST_TOKEN=example_token`.
- Comment out the optional keys you are not using rather than leaving them
  empty: `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `GITHUB_CLIENT_ID`,
  `GITHUB_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `NEXT_PUBLIC_SENTRY_DSN` and `SENTRY_URL`.

`CONFIG_ENCRYPTION_KEY` is worth generating too (`openssl rand -base64 32`).
Without it every integration reports as disabled, because integration
credentials live encrypted in Postgres and are configured in the admin console
rather than here.

```bash
bun dev
```

### The database is not a plain Postgres

`packages/db/src/client.ts` speaks the Neon serverless protocol, not the
Postgres wire protocol, so `docker-compose.yml` runs a `neon-proxy` container in
front of Postgres. `DATABASE_URL` points at `db.localtest.me`, which the client
recognises and rewrites onto the proxy on port 4444. Pointing it at a bare local
Postgres does not work.

### One app, four hostnames

The marketing site, the dashboard, the admin console and the public API are
served on separate hosts, and the session is a cookie scoped to
`.virtbase.localhost`:

| | |
| --- | --- |
| <http://virtbase.localhost:3000> | marketing site |
| <http://app.virtbase.localhost:3000> | customer dashboard |
| <http://admin.virtbase.localhost:3000> | admin console |
| <http://api.virtbase.localhost:3000> | public API |

`http://localhost:3000` never receives that cookie, so signing in there appears
to do nothing. Most systems resolve `*.localhost` to loopback on their own; if
yours does not, add the four names to `/etc/hosts`.

### Everyday commands

```bash
bun dev              # all packages in watch mode
bun check:write      # lint and format
bun typecheck        # TypeScript
bun run test         # unit and integration tests
bun test:e2e         # Playwright
```

`bun run test`, not `bun test`: the bare form is Bun's own runner, which starts
from the repository root and so misses the per-package `bunfig.toml` and
`.env.test` that the `test` script points it at.

## Tech Stack

- [Next.js](https://nextjs.org/) – framework
- [TypeScript](https://www.typescriptlang.org/) – language
- [Tailwind](https://tailwindcss.com/) – CSS
- [Drizzle](https://orm.drizzle.team/) – ORM
- [Upstash](https://upstash.com/) – redis
- [Neon](https://neon.com/) – database
- [Better Auth](https://better-auth.com/) – auth
- [Turborepo](https://turbo.build/repo) – monorepo
- [Stripe](https://stripe.com/) – payments
- [Resend](https://resend.com/) – emails
- [Vercel](https://vercel.com/) – deployments

## Contributing

We love our contributors! Here's how you can contribute:

- [Open an issue](https://github.com/virtbase/virtbase/issues) if you believe you've encountered a bug.
- Make a [pull request](https://github.com/virtbase/virtbase/pull) to add new features, make quality-of-life improvements, or fix bugs.
- Help translate Virtbase into your language on [Crowdin](https://crowdin.virtbase.com).

### Recommended Versions

| Package |   Version    |
|---------|--------------|
| node    | >= v24.15.0  |
| bun     | >= v1.3.14   |

## Repo Activity

![Virtbase repo activity](https://repobeats.axiom.co/api/embed/6f82553dc7bd810ea49b649a538d740de7c4d560.svg "Repobeats analytics image")

## License

This project is licensed under the [GNU Affero General Public License v3.0 (AGPLv3)](https://opensource.org/license/agpl-v3).
