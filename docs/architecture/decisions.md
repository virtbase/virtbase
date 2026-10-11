# Phase 0 decisions

Accepted on 2026-10-11: every decision below was taken as recommended. The
reasoning is in the linked ADR.

| # | Decision | Accepted | ADR |
| --- | --- | --- | --- |
| D1 | Event name separator | dots: `server.created` | [0001](adr/0001-event-names-use-dots.md) |
| D2 | Several installations of one integration | yes, in the data model and registry, opted into per integration | [0002](adr/0002-several-installations-per-integration.md) |
| D3 | Move Proxmox now or later | later: a core facade behind the port now; later a Layer 3 package, not an integration | [0013](adr/0013-proxmox-stays-core-for-now.md) |
| D4 | Social login as integrations now or later | later, with a small interim fix now | [0014](adr/0014-social-login-stays-in-env-for-now.md) |
| D5 | Which provider skeletons to build | Pelican end to end; AutoDNS to contract level; Mailcow on paper | [0015](adr/0015-reference-provider-skeletons.md) |
| D6 | Where integration docs are rendered | in the admin console, on each integration's detail page | [0016](adr/0016-integration-docs-in-the-admin-console.md) |
| D7 | Proxmox E2E per PR or nightly | both: one node per PR on a label, three nodes with faults nightly | [0017](adr/0017-proxmox-e2e-on-proxbase.md) |
| D8 | Changes to the phase order | four changes, below | [integration-first.md §15](integration-first.md#15-phases) |
| D9 | Behaviour changes the design introduces | accept the eight below | — |
| D10 | Admin authentication policy | require a second factor for admins; admin step-up accepts passkey or password only | — |
| D11 | Pre-existing defects | fix them inside this programme in the listed phases; four as hotfixes now | [risks.md](risks.md#pre-existing-defects) |

## D1. Event name separator

**Recommendation: dots** (`server.created`, `abuse.case.opened`).

Every existing name of this kind already uses dots:

- `DomainEvent.type`;
- notification keys and their `notification_targets` globs;
- signal types;
- settings keys.

With dots, notification keys and event types are one namespace, so existing
operator routing keeps working when notifications become an event subscriber.
Colons would mean a second convention, and a translation layer in every glob.

## D2. Several installations of one integration

**Recommendation: yes, opted into per integration** with
`multiInstance: true`, and every new table and API addressed by installation.

- **Who uses it.** All existing integrations stay single-instance. Pelican is the
  first multi-instance integration: a panel per location.
- **What stays the same.** Webhook URLs keep working.
- **What is ruled out.** A Stripe test account next to a live one is explicitly
  not a use case; test mode belongs in a preview deployment.

The cost is in Phase 2 (schema, store, registry). Not doing it means
backfilling a provider reference on every service and every owned row later.

## D3. Move Proxmox now or later

**Recommendation: later. Wrap it behind the `provisioning` port as a core
provider in Phase 6,** exactly as `serverManagement` already wraps the server
routers.

**One correction to the brief's framing.** The repository's own layer plan puts
`proxmox` in **Layer 3**, not Layer 4: the header of `.dependency-cruiser.jsonc`
says so, its rules name `packages/proxmox`, and the abuse README depends on it.
The later move therefore extracts a `packages/proxmox` domain package, not an
`integration-proxmox`. Revisit an integration only if a second hypervisor
provider appears.

**Why not move now:**

- About 10,000 lines would move, and about 40 files that stay behind would need
  rewiring.
- About 20 new ports would be needed, each with a single consumer.
- Moving workflow files changes their step IDs, which breaks runs in flight.

## D4. Social login as integrations now or later

**Recommendation: later**, after Phase 5.

Moving it means rebuilding the better-auth instance from configuration, and
adding Google and GitHub integration packages: about 55 files.

**Do now, in Phase 2:**

- show only the login buttons whose providers are configured (today all three
  always show, and fail when unconfigured);
- warn when Discord's two application IDs differ;
- ask Discord for the role-connection scope only when the Discord integration
  is active.

## D5. Which non-server provider skeletons to build

**Recommendation:**

- **Pelican, end to end.** It passes the contract suite and runs E2E against the
  panel container in CI: order, payment, provisioning, events, dashboard.
- **AutoDNS, to contract level only,** against a mock. It proves that the port
  handles provider-side prices, transfers that stay pending for days, and
  dynamic checkout fields.
- **Mailcow on paper.** The design maps it onto the port and onto a `dnsZones`
  dependency, with a fake DNS provider exercising the dependency rules.

## D6. Where integration docs are rendered

**Recommendation: in the admin console,** as a Documentation tab on each
integration's detail page, compiled at build time like the help articles.

The audience is operators: runbooks and threat models. That does not belong on
the public site. `docsUrl` stays, as the link to the provider's own
documentation.

## D7. Proxmox E2E per PR or nightly

**Recommendation: both.**

- **Per PR, on request.** The `e2e:proxmox` label or a path filter runs one
  Proxbase node on a standard runner, adding 2–4 minutes.
- **Nightly.** Three nodes with the fault suite, 30–60 minutes, on a larger
  hosted runner or a self-hosted KVM host that runs `main` only.

**Which runner for nightly is a cost choice for you.** A larger hosted runner
costs money per minute. A self-hosted KVM host is free to run, but a machine to
maintain. This development machine meets the requirements, but is not to be used as a
CI runner.

## D8. Changes to the phase order

**Recommendation: four changes.**

1. **Phase 1 starts by making CI green.** The build job has timed out on every
   push to `main` since `736beedc`, so no gate after it runs today.
2. **Customer webhooks move from Phase 4 to Phase 5.** They are greenfield: no
   table, page or router exists. They need customer pages, owned tables and the
   privacy contract, which Phase 5 builds.
3. **A one-node Proxbase nightly job starts during Phases 3 and 4.** It runs
   today's Proxmox suite, so Phase 6's provisioning refactor has a safety net.
4. **Multi-installation and `config_status` land in Phase 2,** with the rest of
   the configuration work.

## D9. Behaviour changes the design introduces

**Recommendation: accept all eight.** Each one is visible to customers or
operators, so each one is announced in the PR that makes it.

| # | Change | Phase |
| --- | --- | --- |
| 1 | A paid order becomes `fulfilled` when its service is active, not when provisioning starts; a failed provision is a `failed` service linked to the order | 6 |
| 2 | Terminated servers are no longer deleted, so IP allocation history survives for abuse attribution | 6 |
| 3 | Notifications are sent after the transaction commits, within seconds rather than inline; nothing is sent for a rolled-back change | 4 |
| 4 | After golden tests preserve today's behaviour, a separate PR fixes the per-case dedupe that silences a customer's second reply and later reporter mails | 4 |
| 5 | Discord's command and emoji sync runs on enable and daily, not on every health probe; "Check now" probes one integration | 1 |
| 6 | Stripe can be switched off; its health check reads the configured secret, not the environment | 2 |
| 7 | AbuseIPDB's switches can be turned off, and a blank threshold means 50 again | 1 |
| 8 | Gating ships in shadow mode for one release (logged, not enforced), then enforces | 3 |

## D10. Admin authentication policy

**Recommendation:**

- **Every admin account must have a passkey or TOTP.**
- **Admin step-up accepts a passkey or a password, not an email OTP.** Email OTP
  sign-in skips TOTP today.
- **Admin writes re-read the session** instead of trusting the five-minute
  cookie cache. A demoted or banned admin then loses write access immediately.

This tightens access for the people who can uninstall integrations and export
financial data. It does not affect customers.

## D11. Pre-existing defects

Discovery found 15 security and 45 correctness defects
([risks.md](risks.md#pre-existing-defects)).

**Recommendation: fix them inside this programme,** in the phase that touches
the code anyway.

**Four go out first, as independent hotfixes.** They cause wrong behaviour
in production today, regardless of the redesign:

- **C13:** renewal and upgrade power a guest back on through an abuse
  `power_off` lock.
- **C14:** auto-renewal can delay or undo an abuse termination.
- **C16:** one unreachable node stalls billing suspension for the whole fleet.
- **C32:** preview deployments finalize real Lexware invoices.

**Two security fixes can come earlier if you prefer:** plaintext node tokens
(S1), and credentials in the workflow event log (S2). They are scheduled for
Phase 2 because that is where the encryption work happens.

**One item is outside this programme and needs a legal review:** C40, the
privacy policy describing processing that does not exist and omitting
processors that do.
