# ADR 0012: A generic product catalogue and service model, reached through a `provisioning` port

- Status: Accepted (2026-10-11)
- Date: 2026-10-11
- Requirement: R8

## Context

Commerce and provisioning assume one product, the virtual server:

- **Orders.** `orders.type` is `new_server | extend_server | upgrade_server`.
  Nothing branches on that column; the code switches on `configuration.type`,
  a jsonb field carrying `server_plan_id` and `server_plan_price_id` without
  foreign keys.
- **Order items.** Each order has exactly one item. It snapshots the name and
  amount, and points at the plan and price rows with set-null foreign keys.
- **Prices.** `server_plan_prices` is not a price list. Checkout inserts a
  discounted row for every new-server and upgrade order, so the row is a
  per-purchase price lock. `server_plans.price` is the only list price. Nothing
  in the app edits plans, prices or discounts; only the seed does.
- **Servers.**
  - They reference their plan and price row with `restrict`, and have no
    foreign key to orders or subscriptions.
  - They have no status column; state is spread across `installed_at`,
    `suspended_at`, `terminates_at` and `abuse_locked_at`.
  - The row is inserted only at the end of provisioning, and the order turns
    `fulfilled` as soon as the workflow starts. A failed provision therefore
    leaves a paid order and no record.
  - Termination deletes the row. That cascades to `subnet_allocations` and
    erases the address history abuse attribution depends on.
- **Subscriptions.** `subject_type`/`subject_id` are already generic, but:
  - a check constraint allows only `'server'`;
  - every subscription has a NOT NULL foreign key to `server_plan_prices`;
  - renewal orders are always `extend_server`.
- **Invoices.**
  - They are built from `configuration` and the plan rows, with hard-coded
    server specs.
  - They have no link to orders or payments.
  - `generateInvoiceStep` is not idempotent.
- **External contracts.** Plan IDs travel through the `pck_` ID regex, the
  public `GET /offer-list` and the serverhunter feed. 209 references in 73
  files, 69 of them tests.
- **Migrations run during the Vercel build** while the previous deployment still
  serves, so every change has to be expand/contract.
- **Workflow step IDs embed their module path.** Moving a workflow file changes
  its step IDs, so runs in flight at deploy time cannot resume.

## Decision

### Products

**`products`** (`prd_`) replaces plans as the thing a customer buys. Its
columns:

- `kind`
- `provider_integration_id`, plus `provider_installation_id` (set null on
  delete)
- `slug`, `name`, `description`
- `status`: draft, active or archived
- `visibility`
- `config`: jsonb, validated against the provider's product schema
- `sort_order` and timestamps

`kind` is text, validated against the kinds registered in the composition root,
so that adding a kind needs no migration. Core registers `server`. The skeletons
add `game_server` and `domain`, and the design covers `mail`.

**`product_prices`** (`pprc_`) are list prices. Each row has a product, a
billing period (in months; a domain's years are multiples of 12), a currency,
an amount, a setup fee and an active flag. A product priced by its provider
(domains) declares `pricing: { mode: "provider", markup }`. Its price comes from
`provisioning.quote()` at checkout and is recorded the same way.

**`service_prices`** (`sprc_`) generalise what `server_plan_prices` actually is:
the price locked in for one purchase. Each row has:

- the product, and the list price row it came from;
- the period and the currency;
- the purchase amount and the renewal amount;
- the purchase discount and the renewal discount.

Subscriptions and services reference it.

**Server plans stay** as the server-kind detail of a product. `server_plans`
gains `product_id`, unique, and keeps its node group, specs and `pck_` IDs, so
the public offer list and the serverhunter feed keep working unchanged.

### Services

**`services`** (`svc_`) is what a customer owns. Its columns:

- `user_id`
- `product_id`, with `restrict`
- `kind`
- `provider_integration_id` and `provider_installation_id`
- `provider_ref`, the provider's own ID: a Pelican server UUID, a domain name,
  a Proxmox `kvm_` ID
- `status`, with `status_reason`
- `config`, the validated order configuration
- `origin_order_item_id`
- `provisioned_at`, `suspended_at`, `terminated_at`

**Status.** One of `pending`, `provisioning`, `active`, `suspended`,
`terminating`, `terminated` or `failed`. `status_reason` is `billing`, `abuse`,
`customer` or `operator`. Every change is appended to `service_transitions`,
which mirrors `order_transitions` and is what the `service.*` events are
emitted from.

**Rows are never deleted.** Termination sets `terminated`.

**The server's own detail.** `servers.service_id` links each server 1:1 to its
service. The `servers` row stays the Proxmox detail record. It too is no longer
deleted on termination, which keeps `subnet_allocations` history for abuse
attribution. Its timestamps remain; `services.status` becomes the summary that
generic code reads.

**Fulfilment creates the service first.** The service row is created as
`provisioning` before any provider is called. A failed provision becomes
`failed`, with the order linked to it, instead of disappearing.

### Orders and subscriptions become kind-agnostic

**Order types.** `orders.type` becomes `new_service | renewal | plan_change`.
The old values map one to one, and the old configuration variants keep parsing,
so history renders as before.

**Order items.** They gain `product_id`, `product_price_id` and `service_id`.
The plan and price columns stay nullable, for history.

**Subscriptions.** `subject_type` gains `'service'`, and `service_price_id`
replaces the `server_plan_prices` foreign key. Renewal orders are `renewal`, and
settlement calls the provider's `renew()` through the generic workflow.

**Invoices.** They gain an `order_id`, are built from `order_items` instead of
the plan rows, and become idempotent per order.

### The provisioning port

The port lives in `@virtbase/ports` and is the only way the order flow talks
to a provider:

```ts
interface ProvisioningProvider {
  readonly kinds: readonly ProductKind[];
  readonly productConfig: ValueDescriptor;            // admin: what a product of this provider needs
  describeOrder(i: { product }): Promise<OrderForm>;  // checkout fields, dynamic per product (TLD rules)
  validateOrder(i: { product; config; userId }): Promise<OrderValidation>; // availability, capacity, template
  quote?(i: { product; config; periodMonths }): Promise<Money>;            // provider-priced products
  provision(i: ServiceCommand & { config }): Promise<ProvisionResult>;     // active | pending (+ checkAfter)
  status(i: ServiceRef): Promise<ProviderStatus>;
  suspend(i: ServiceCommand & { reason }): Promise<void>;
  unsuspend(i: ServiceCommand & { reason }): Promise<void>;
  terminate(i: ServiceCommand): Promise<OperationResult>;
  renew?(i: ServiceCommand & { periodMonths }): Promise<OperationResult>;  // registry renewals; servers need none
  changePlan?(i: ServiceCommand & { toProduct }): Promise<OperationResult>;
  actions(i: ServiceRef & { actor }): Promise<ServiceAction[]>;            // described, so the dashboard can render them
  runAction(i: ServiceCommand & { action; input; actor }): Promise<OperationResult>;
}
```

**Idempotency.** Every command carries an `idempotencyKey` derived from the
service, the operation and the workflow step. A provider must make a repeated
command a no-op.

**Results.** `pending` means the provider accepted the work and the core
workflow calls `status()` after `checkAfter`. This one shape covers:

- a domain transfer that takes days;
- a Pelican install that takes minutes;
- a Proxmox clone that takes seconds.

**Workflows.** The generic workflows `provision-service`, `suspend-service`,
`unsuspend-service`, `terminate-service`, `renew-service` and
`change-service-plan` live in `packages/api/src/workflows`. Each one:

- calls the provider in a step;
- polls `pending` with `sleep()`;
- records a transition on the service and emits its event with a step-derived
  dedupe key.

They are the only callers of the port's mutating methods.

**Ownership.** The service records which provider installation owns it, so the
registry never has to choose among several providers of the slot.

**Checkout.** It validates through the provider before payment. That fixes
today's Proxmox gap, where a template is only checked after the customer has
paid.

**Actions.** `actions()` and `runAction()` cover what a customer can do with a
service. Each action is described with a key, a translated label, a field
descriptor form, a confirmation level and whether it is long-running, so the
dashboard can render it without provider code. Pages a generic action cannot
express come from the provider's pages ([ADR 0008](0008-integration-pages-and-routes.md)).

### How the design handles each provider's needs

| Need | Where it goes |
| --- | --- |
| Domain availability, per-TLD registry prices, periods in years | `validateOrder`, `quote`, months as multiples of 12 |
| Transfers with an auth code | an order configuration field (secret-typed: never in event payloads, stored encrypted in the service's provider data) and a `pending` provision |
| Registrant contacts with TLD-specific rules | dynamic `describeOrder` fields plus a `user`-level data requirement ([ADR 0010](0010-integration-data.md)). Personal fields are stored in `integration_data` on the order item, never in `orders.configuration`, so anonymisation stays generic. Today `anonymize-user.ts` scrubs the configuration by known server keys. |
| Registry renewal | `renew()`, called by the renewal workflow |
| Nameservers and zones | provider actions; zone records through a `dnsZones` port (the `dns` port today does reverse DNS only) |
| Game server eggs, nodes, allocations, limits | the product `config` (egg, node or location, limits); allocations in the integration's owned tables |
| The panel's own user accounts | an owned table mapping users to panel accounts, created on first provision; sign-on through a provider action that returns a short-lived login link |
| Mail domains, mailboxes, quotas | the service is the mail domain; mailboxes in owned tables; the quota in product config |
| Mail's DNS records (MX, SPF, DKIM) | `requires: { ports: ["dnsZones"] }` and records written through that port ([ADR 0007](0007-features-and-effective-state.md) handles a missing or later-disabled provider) |

### The dashboard

`/services` lists every service of every kind from the `services` table. A
service's detail page is its provider's service page
([ADR 0008](0008-integration-pages-and-routes.md)). For `server`, that is the
existing `/servers/[id]` tree, linked rather than moved.

## Consequences

- **The data migration is expand/contract across at least three releases**
  ([migration-plan.md](../migration-plan.md#3-products-orders-and-subscriptions)),
  and every step is backwards-compatible with the release before it.
- **Existing workflows are not moved or renamed.** The Proxmox provider starts
  them as they are ([ADR 0013](0013-proxmox-stays-core-for-now.md)), so no
  in-flight run loses its step IDs.
- **The abuse desk stays server- and IP-centric.** Enforcement against a
  non-server service will need `suspend` with reason `abuse`, and attribution
  of an address that is not a Proxmox allocation will need a provider hook.
  Both are written down as follow-ups, not built.
- **Two current failure modes disappear:** a failed provision is recorded as a
  `failed` service, and a deleted server keeps its address history. Both are
  intended behaviour changes, and the Phase 6 PR descriptions call them out.
