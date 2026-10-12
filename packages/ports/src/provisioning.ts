/*
 *   Copyright (c) 2026 Janic Bellmann
 *
 *   This program is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU General Public License as published by
 *   the Free Software Foundation, either version 3 of the License, or
 *   (at your option) any later version.
 *
 *   This program is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU General Public License for more details.
 *
 *   You should have received a copy of the GNU General Public License
 *   along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import type { FieldDescriptor } from "@virtbase/validators";
import type * as z from "zod";
import type { Money } from "./common";

/**
 * What a product is, as text: `server`, `game_server`, `domain`, `mail`.
 *
 * Text rather than a union, because the composition root registers the kinds
 * and adding one needs no migration (ADR 0012). A provider declares the kinds
 * it serves in {@link ProvisioningProvider.kinds}.
 */
export type ProductKind = string;

/**
 * A Zod schema plus the field descriptors the admin console and checkout
 * render a form from, one field per key of `schema`.
 */
export interface FormDescriptor {
  readonly schema: z.ZodType;
  readonly fields: readonly FieldDescriptor[];
}

/**
 * A product as a provider sees it: a row of `products` reduced to what a
 * provider needs.
 */
export interface ProvisioningProduct {
  /** The product's id, `prd_…`. */
  id: string;
  kind: ProductKind;
  /**
   * The product's stored configuration, as admin saved it against
   * {@link ProvisioningProvider.productConfig}: an egg and limits for a game
   * server, a quota for a mail domain. The provider must parse it with that
   * schema before reading it.
   */
  config: unknown;
}

/**
 * The checkout form for one product, from
 * {@link ProvisioningProvider.describeOrder}. Its values become the order
 * configuration and, once paid, the service's `config`.
 */
export interface OrderForm extends FormDescriptor {
  /**
   * Keys of `fields` whose values are secret, such as a domain transfer's
   * auth code. Their values must be stored encrypted and must never reach an
   * event payload (ADR 0012).
   */
  readonly secretKeys: readonly string[];
}

/** One reason an order cannot be carried out. */
export interface OrderIssue {
  /**
   * A stable code, `<integration id>.<reason>` like an `IntegrationError`'s
   * (§4.5 of integration-first.md), which the integration translates.
   */
  code: string;
  /**
   * The key of the {@link OrderForm} field the issue is about, when it is
   * about one. ADR 0012 gives an issue no field; it is this port's choice, so
   * that checkout shows the issue next to the field the customer has to
   * change.
   */
  field?: string;
}

/**
 * Whether a provider can carry out an order, asked before payment.
 *
 * `invalid` is an answer, not a failure: the domain is taken, the location is
 * full, the template no longer exists. The method must reject only when the
 * provider cannot answer at all.
 */
export type OrderValidation =
  | { status: "valid" }
  | { status: "invalid"; issues: readonly OrderIssue[] };

/**
 * Why a service is suspended: the values of `services.status_reason`
 * (ADR 0012).
 *
 * A provider must keep one suspension per reason. A guest suspended for
 * non-payment and then abuse-locked stays off until both are lifted, and no
 * longer; C46 records the Proxmox code keeping it off after both were lifted.
 */
export type SuspensionReason = "billing" | "abuse" | "customer" | "operator";

/**
 * The service a call is about.
 *
 * `providerRef` is the provider's own id for it, `services.provider_ref`: a
 * Pelican server UUID, a domain name, a Proxmox `kvm_` id. It is null until
 * the provider has reported one through {@link ProvisionResult} or
 * {@link ProviderStatus}, so a provider must find a service whose provision is
 * still pending by its `serviceId`.
 */
export interface ServiceRef {
  /** The service's id, `svc_…`. */
  serviceId: string;
  providerRef: string | null;
}

/**
 * A call that changes a service at the provider: `suspend`, `unsuspend`,
 * `terminate`, `renew`, `changePlan` or `runAction`, and through
 * {@link ProvisionInput} `provision`.
 *
 * The same command can arrive more than once, because the workflow step or
 * the dashboard request that sends it is retried.
 */
export interface ServiceCommand extends ServiceRef {
  /**
   * For `provision`, `suspend`, `unsuspend`, `terminate`, `renew` and
   * `changePlan`, the caller must derive it from the service, the operation
   * and the workflow step, never from the clock (CMP-6). For `runAction` it
   * comes from the dashboard request, one key per request. A provider must
   * make a command repeated with the same key a no-op.
   */
  idempotencyKey: string;
}

/** The input of {@link ProvisioningProvider.provision}. */
export type ProvisionInput = Pick<
  ServiceCommand,
  "serviceId" | "idempotencyKey"
> & {
  /**
   * The customer who owns the service. ADR 0012 has Pelican create the
   * customer's panel account on their first provision.
   */
  userId: string;
  product: ProvisioningProduct;
  /**
   * The order configuration. It must have parsed against the product's
   * {@link OrderForm} and passed {@link ProvisioningProvider.validateOrder}
   * before payment.
   */
  config: unknown;
};

/**
 * The answer that the provider accepted the work and it is still running: the
 * caller asks {@link ProvisioningProvider.status} again after `checkAfterMs`.
 */
export interface PendingAnswer {
  status: "pending";
  /** How long the caller waits before the next `status()`, in milliseconds. */
  checkAfterMs: number;
}

/**
 * The answer to a provision: `active`, or a {@link PendingAnswer}. One shape
 * covers a Proxmox clone that takes seconds, a Pelican install that takes
 * minutes, and a domain transfer that takes days (ADR 0012).
 */
export type ProvisionResult =
  | { status: "active"; providerRef: string }
  | (PendingAnswer & {
      /**
       * The provider's id for the service, when it has one before the work
       * finishes, such as the UUID Pelican returns for a server that is still
       * installing. ADR 0012 has `pending` carry only the wait; reporting the
       * id early is this port's choice, so that `services.provider_ref` is set
       * while the work runs.
       */
      providerRef: string | null;
    });

/**
 * The answer to a command other than a provision: `done`, or a
 * {@link PendingAnswer}.
 */
export type OperationResult = { status: "done" } | PendingAnswer;

/**
 * The answer to {@link ProvisioningProvider.runAction}: an
 * {@link OperationResult}, or a link the dashboard sends the customer to, such
 * as Pelican's short-lived panel login (ADR 0015).
 *
 * [!] A `redirect`'s `url` signs the customer in at the provider, so it must
 * never be logged, stored, or put into an event payload: anyone who reads it
 * holds the customer's session until it expires.
 */
export type ActionResult =
  | OperationResult
  | { status: "redirect"; url: string };

/**
 * A service as the provider sees it.
 *
 * - `pending`: a command the provider answered `pending` is still running.
 * - `active`: the service runs; `providerRef` is the provider's id for it.
 * - `suspended`: one suspension is held for each entry of `reasons`.
 * - `terminated`: final; nothing brings the service back.
 * - `failed`: the provision failed and nothing runs at the provider for the
 *   service; `code` is `<integration id>.<reason>`, as in {@link OrderIssue}.
 */
export type ProviderStatus =
  | PendingAnswer
  | { status: "active"; providerRef: string }
  | { status: "suspended"; reasons: readonly SuspensionReason[] }
  | { status: "terminated" }
  | { status: "failed"; code: string };

/**
 * The customer asking for, or running, a service action. ADR 0012: "`actions()`
 * and `runAction()` cover what a customer can do with a service."
 */
export interface ServiceActor {
  /** The customer's id, `usr_…`. */
  userId: string;
}

/**
 * How firmly the dashboard confirms an action before running it. ADR 0012
 * describes each action with "a confirmation level" and names no levels, so
 * the three are this port's choice, from the least friction to the most:
 *
 * - `none`: the action runs on click, for an action that changes nothing at
 *   the provider, such as Pelican's panel login (ADR 0015).
 * - `confirm`: a dialog asks first, for an action the customer can recover
 *   from, such as a restart.
 * - `typed`: the customer types the service's name, for an action that
 *   destroys data, because a dialog is too easy to click by accident; the
 *   dashboard's account deletion asks for a typed confirmation for the same
 *   reason.
 */
export type ActionConfirmation = "none" | "confirm" | "typed";

/**
 * Something a customer can do with a service, described so the dashboard
 * renders it without provider code (ADR 0012).
 */
export interface ServiceAction {
  /** Unique among the service's actions; passed back to `runAction()`. */
  key: string;
  /** Translated by the integration. */
  label: string;
  /** The input the action takes; a form without fields takes none. */
  form: FormDescriptor;
  confirmation: ActionConfirmation;
  /** Whether the action outlives the request, so the dashboard shows progress. */
  longRunning: boolean;
}

/**
 * A provider of one or more product kinds, and the only way the order flow
 * reaches it (ADR 0012). ADR 0013 makes core the provider of kind `server`,
 * over the Proxmox code; ADR 0015 builds Pelican and AutoDNS on the port.
 *
 * Only the generic workflows of ADR 0012 (`provision-service`,
 * `suspend-service`, `unsuspend-service`, `terminate-service`,
 * `renew-service` and `change-service-plan`) may call the mutating methods
 * `provision`, `suspend`, `unsuspend`, `terminate`, `renew` and `changePlan`.
 * They must poll a `pending` answer with `status()` (ADR 0012).
 *
 * Each mutating method and `runAction` takes an idempotency key, and a command
 * repeated with the same key must change nothing at the provider
 * ({@link ServiceCommand}). The `provisioning` contract suite of
 * `@virtbase/integration-testing` checks this for each of them.
 *
 * @experimental The port stays open to change until Phase 6 of
 * integration-first.md ends (risk R21): AutoDNS exercises `quote`, `pending`
 * transfers and dynamic checkout fields before the shape is declared stable.
 */
export interface ProvisioningProvider {
  /** The product kinds this provider serves. */
  readonly kinds: readonly ProductKind[];
  /** What admin configures on a product of this provider: an egg, a location, a quota. */
  readonly productConfig: FormDescriptor;

  /**
   * The checkout form for `product`. It depends on the product, so a domain's
   * form carries the fields its TLD needs.
   */
  describeOrder(input: { product: ProvisioningProduct }): Promise<OrderForm>;
  /**
   * Checks before payment what `provision()` would otherwise fail on after
   * it: availability, capacity, a template that exists. An order this
   * answers `valid` for must not fail to provision for a reason it could
   * have checked.
   */
  validateOrder(input: {
    product: ProvisioningProduct;
    config: unknown;
    userId: string;
  }): Promise<OrderValidation>;
  /**
   * The provider's price for a product priced by its provider, such as a
   * domain's registry price per TLD. Optional: a product with list prices in
   * `product_prices` needs none.
   */
  quote?(input: {
    product: ProvisioningProduct;
    config: unknown;
    /** The billing period; a domain's years are multiples of 12. */
    periodMonths: number;
  }): Promise<Money>;

  /**
   * Creates the service at the provider. A provision that fails must either
   * reject with a `PortError` or an `IntegrationError`, or answer `pending`
   * and have `status()` settle `failed`.
   */
  provision(input: ProvisionInput): Promise<ProvisionResult>;
  /** Reads the service's state at the provider, and must change nothing there. */
  status(input: ServiceRef): Promise<ProviderStatus>;
  /**
   * Suspends the service for `reason`. Resolves once `status()` reports the
   * suspension. On a terminated service it may reject, and the service must
   * stay terminated.
   */
  suspend(input: ServiceCommand & { reason: SuspensionReason }): Promise<void>;
  /**
   * Lifts the suspension for `reason`, and only that one: the service runs
   * again once no suspension is left. Resolves once `status()` reports it. On
   * a terminated service it may reject, and the service must stay terminated.
   */
  unsuspend(
    input: ServiceCommand & { reason: SuspensionReason },
  ): Promise<void>;
  /** Ends the service for good; once terminated, it stays terminated. */
  terminate(input: ServiceCommand): Promise<OperationResult>;
  /**
   * Renews the service at the provider for `periodMonths`, as a registry
   * renews a domain. Optional.
   */
  renew?(
    input: ServiceCommand & { periodMonths: number },
  ): Promise<OperationResult>;
  /** Moves the service onto another product of the same provider. Optional. */
  changePlan?(
    input: ServiceCommand & { toProduct: ProvisioningProduct },
  ): Promise<OperationResult>;
  /** The actions `actor` may run on the service now, described. */
  actions(
    input: ServiceRef & { actor: ServiceActor },
  ): Promise<ServiceAction[]>;
  /**
   * Runs the action `action`, a key from `actions()`, with `input`. The caller
   * must parse `input` against the action's form before the call.
   */
  runAction(
    input: ServiceCommand & {
      action: string;
      input: unknown;
      actor: ServiceActor;
    },
  ): Promise<ActionResult>;
}
