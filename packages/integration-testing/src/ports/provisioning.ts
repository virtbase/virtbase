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

import { expect } from "bun:test";
import type {
  ActionConfirmation,
  ProviderStatus,
  ProvisioningProduct,
  ProvisioningProvider,
  ProvisionResult,
  ServiceActor,
  ServiceRef,
} from "@virtbase/ports";
import { checkFormDescriptor } from "../checks/fields";
import type { Check } from "../checks/run";
import { describeChecks, runChecks } from "../checks/run";

/** What the `provisioning` contract suite needs from an integration's tests. */
export interface ProvisioningContractSetup {
  /** The provider under test, talking to a fresh fake that holds no service. */
  provider: ProvisioningProvider;
  /** A product of a kind the provider serves, with a config its `productConfig` accepts. */
  product: ProvisioningProduct;
  /** Another product to move the service onto; required when the provider has `changePlan()`. */
  otherProduct?: ProvisioningProduct;
  /** An order configuration of `product` that the fake carries out. */
  config: unknown;
  /** An order configuration of `product` that the fake fails to provision, such as a taken domain. */
  rejectedConfig: unknown;
  /**
   * The key of an action the active service offers, and an input its form
   * accepts; required when `actions()` lists any.
   */
  action?: { key: string; input: unknown };
  /**
   * Finishes every piece of work the fake answered `pending` for, as waiting
   * out its `checkAfterMs` would.
   */
  finishPendingWork(): Promise<void>;
  /**
   * Everything the fake holds, as plain data. A repeated command must leave
   * it equal, by `toEqual`, to what the first run of the command left.
   */
  snapshot(): Promise<unknown>;
}

const SERVICE_ID = "svc_contract1";
const USER_ID = "usr_contract1";
const ACTOR: ServiceActor = { kind: "customer", userId: USER_ID };

/** How often the suite asks `status()` before it gives up on a `pending` answer. */
const MAX_STATUS_POLLS = 5;

/** `<integration id>.<reason>`, the shape of an issue's and a failure's code. */
const CODE_PATTERN = /^[a-z][a-z0-9-]*\.[a-z0-9][a-z0-9_.-]*$/;

/** Every confirmation level of `ActionConfirmation`; the type keeps the record complete. */
const CONFIRMATIONS: Record<ActionConfirmation, true> = {
  none: true,
  confirm: true,
  typed: true,
};

/** A stable idempotency key per operation, as a workflow step derives it. */
const keyFor = (operation: string) => `${SERVICE_ID}:${operation}:step-1`;

/** The status with its suspension reasons sorted, so it compares by `toEqual`. */
const statusOf = async (
  setup: ProvisioningContractSetup,
  ref: ServiceRef,
): Promise<ProviderStatus> => {
  const status = await setup.provider.status(ref);
  return status.status === "suspended"
    ? { status: "suspended", reasons: [...status.reasons].sort() }
    : status;
};

/**
 * Asks `status()` until it stops answering `pending`, finishing the fake's
 * pending work between two polls. `waits` collects every `checkAfterMs` seen.
 */
const settle = async (
  setup: ProvisioningContractSetup,
  ref: ServiceRef,
  waits: number[] = [],
): Promise<ProviderStatus> => {
  for (let poll = 0; poll < MAX_STATUS_POLLS; poll += 1) {
    const status = await statusOf(setup, ref);
    if (status.status !== "pending") return status;
    waits.push(status.checkAfterMs);
    await setup.finishPendingWork();
  }
  throw new Error(
    `status() still answers pending after ${MAX_STATUS_POLLS} polls`,
  );
};

/** The status once a command's answer has settled. */
const settleAnswer = (
  setup: ProvisioningContractSetup,
  ref: ServiceRef,
  answer: { status: string } | undefined,
): Promise<ProviderStatus> =>
  answer?.status === "pending" ? settle(setup, ref) : statusOf(setup, ref);

/** Provisions `config` under the provision key and waits for it to settle. */
const provisionSettled = async (
  setup: ProvisioningContractSetup,
  config: unknown,
  waits: number[] = [],
): Promise<{ result: ProvisionResult; status: ProviderStatus }> => {
  const result = await setup.provider.provision({
    serviceId: SERVICE_ID,
    idempotencyKey: keyFor("provision"),
    userId: USER_ID,
    product: setup.product,
    config,
  });
  if (result.status === "pending") waits.push(result.checkAfterMs);
  const ref = { serviceId: SERVICE_ID, providerRef: result.providerRef };
  return {
    result,
    status:
      result.status === "pending"
        ? await settle(setup, ref, waits)
        : await statusOf(setup, ref),
  };
};

/** Provisions `setup.config` and returns the reference of the active service. */
const provisionActive = async (
  setup: ProvisioningContractSetup,
): Promise<ServiceRef & { providerRef: string }> => {
  const { status } = await provisionSettled(setup, setup.config);
  if (status.status !== "active") {
    throw new Error(`provision() settled ${status.status}, not active`);
  }
  return { serviceId: SERVICE_ID, providerRef: status.providerRef };
};

/**
 * Runs `command` twice, letting each run settle, and expects the second run
 * to leave the fake as the first one left it.
 */
const expectNoSecondEffect = async (
  setup: ProvisioningContractSetup,
  ref: ServiceRef,
  command: () => Promise<{ status: string } | undefined>,
): Promise<void> => {
  await settleAnswer(setup, ref, await command());
  const afterFirst = await setup.snapshot();
  await settleAnswer(setup, ref, await command());
  expect(await setup.snapshot()).toEqual(afterFirst);
};

const PROVISIONING_CHECKS: Check<ProvisioningContractSetup>[] = [
  {
    title: "kinds lists the product's kind",
    run: ({ provider, product }) => {
      expect(provider.kinds).toContain(product.kind);
    },
  },
  {
    title: "productConfig is a complete form that accepts the product's config",
    run: ({ provider, product }) => {
      expect(
        checkFormDescriptor("productConfig", provider.productConfig),
      ).toEqual([]);
      expect(
        provider.productConfig.schema.safeParse(product.config).success,
      ).toBe(true);
    },
  },
  {
    title:
      "describeOrder() is a complete form, with password fields for its secret keys, that accepts the order configuration",
    run: async ({ provider, product, config }) => {
      const form = await provider.describeOrder({ product });
      expect(
        checkFormDescriptor("describeOrder()", form, form.secretKeys),
      ).toEqual([]);
      expect(form.schema.safeParse(config).success).toBe(true);
    },
  },
  {
    title: "validateOrder() accepts an order the provider carries out",
    run: async ({ provider, product, config }) => {
      expect(
        await provider.validateOrder({ product, config, userId: USER_ID }),
      ).toEqual({ status: "valid" });
    },
  },
  {
    title:
      "validateOrder() rejects, with a code for each issue, an order provision() fails on",
    run: async (setup) => {
      const validation = await setup.provider.validateOrder({
        product: setup.product,
        config: setup.rejectedConfig,
        userId: USER_ID,
      });
      expect(validation.status).toBe("invalid");
      const issues = validation.status === "invalid" ? validation.issues : [];
      expect(issues.length).toBeGreaterThan(0);
      for (const issue of issues) expect(issue.code).toMatch(CODE_PATTERN);

      // A provider may reject the provision or settle it `failed`; either
      // proves that setup.rejectedConfig is an order provision() fails on.
      const settled = await provisionSettled(setup, setup.rejectedConfig).then(
        ({ status }) => status,
        () => null,
      );
      expect(settled?.status).not.toBe("active");
      if (settled?.status === "failed") {
        expect(settled.code).toMatch(CODE_PATTERN);
      }
    },
  },
  {
    title:
      "provision() settles active, through status() while it answers pending",
    run: async (setup) => {
      const { result, status } = await provisionSettled(setup, setup.config);
      expect(status.status).toBe("active");
      const providerRef = status.status === "active" ? status.providerRef : "";
      expect(providerRef).not.toBe("");
      if (result.providerRef !== null) {
        expect(providerRef).toBe(result.providerRef);
      }
    },
  },
  {
    title: "every pending answer waits a finite, non-negative time",
    run: async (setup) => {
      const waits: number[] = [];
      const { status } = await provisionSettled(setup, setup.config, waits);
      if (status.status === "active") {
        const ref = { serviceId: SERVICE_ID, providerRef: status.providerRef };
        const answer = await setup.provider.terminate({
          ...ref,
          idempotencyKey: keyFor("terminate"),
        });
        if (answer.status === "pending") waits.push(answer.checkAfterMs);
        await settle(setup, ref, waits);
      }
      for (const wait of waits) {
        expect(Number.isFinite(wait)).toBe(true);
        expect(wait).toBeGreaterThanOrEqual(0);
      }
    },
  },
  {
    title: "provision() repeated with the same key provisions once",
    run: async (setup) => {
      const first = await provisionSettled(setup, setup.config);
      const afterFirst = await setup.snapshot();
      const second = await provisionSettled(setup, setup.config);
      expect(second.status).toEqual(first.status);
      expect(await setup.snapshot()).toEqual(afterFirst);
    },
  },
  {
    title: "status() changes nothing at the provider",
    run: async (setup) => {
      const ref = await provisionActive(setup);
      const before = await setup.snapshot();
      await setup.provider.status(ref);
      await setup.provider.status(ref);
      expect(await setup.snapshot()).toEqual(before);
    },
  },
  {
    title: "unsuspend() lifts what suspend() did for the same reason",
    run: async (setup) => {
      const { provider } = setup;
      const ref = await provisionActive(setup);
      await provider.suspend({
        ...ref,
        idempotencyKey: keyFor("suspend-billing"),
        reason: "billing",
      });
      expect(await statusOf(setup, ref)).toEqual({
        status: "suspended",
        reasons: ["billing"],
      });
      await provider.unsuspend({
        ...ref,
        idempotencyKey: keyFor("unsuspend-billing"),
        reason: "billing",
      });
      expect(await statusOf(setup, ref)).toEqual({
        status: "active",
        providerRef: ref.providerRef,
      });
    },
  },
  {
    title:
      "unsuspend() for one reason leaves the suspension for another in place",
    run: async (setup) => {
      const { provider } = setup;
      const ref = await provisionActive(setup);
      for (const reason of ["billing", "abuse"] as const) {
        await provider.suspend({
          ...ref,
          idempotencyKey: keyFor(`suspend-${reason}`),
          reason,
        });
      }
      expect(await statusOf(setup, ref)).toEqual({
        status: "suspended",
        reasons: ["abuse", "billing"],
      });
      await provider.unsuspend({
        ...ref,
        idempotencyKey: keyFor("unsuspend-billing"),
        reason: "billing",
      });
      expect(await statusOf(setup, ref)).toEqual({
        status: "suspended",
        reasons: ["abuse"],
      });
    },
  },
  {
    title: "suspend() repeated with the same key has no further effect",
    run: async (setup) => {
      const ref = await provisionActive(setup);
      await expectNoSecondEffect(setup, ref, () =>
        setup.provider
          .suspend({
            ...ref,
            idempotencyKey: keyFor("suspend"),
            reason: "billing",
          })
          .then(() => undefined),
      );
    },
  },
  {
    title: "unsuspend() repeated with the same key has no further effect",
    run: async (setup) => {
      const ref = await provisionActive(setup);
      await setup.provider.suspend({
        ...ref,
        idempotencyKey: keyFor("suspend"),
        reason: "billing",
      });
      await expectNoSecondEffect(setup, ref, () =>
        setup.provider
          .unsuspend({
            ...ref,
            idempotencyKey: keyFor("unsuspend"),
            reason: "billing",
          })
          .then(() => undefined),
      );
    },
  },
  {
    title: "terminate() settles terminated",
    run: async (setup) => {
      const ref = await provisionActive(setup);
      const answer = await setup.provider.terminate({
        ...ref,
        idempotencyKey: keyFor("terminate"),
      });
      expect(await settleAnswer(setup, ref, answer)).toEqual({
        status: "terminated",
      });
    },
  },
  {
    title: "terminate() repeated with the same key has no further effect",
    run: async (setup) => {
      const ref = await provisionActive(setup);
      await expectNoSecondEffect(setup, ref, () =>
        setup.provider.terminate({
          ...ref,
          idempotencyKey: keyFor("terminate"),
        }),
      );
    },
  },
  {
    title: "a terminated service stays terminated",
    run: async (setup) => {
      const { provider } = setup;
      const ref = await provisionActive(setup);
      await settleAnswer(
        setup,
        ref,
        await provider.terminate({
          ...ref,
          idempotencyKey: keyFor("terminate"),
        }),
      );
      // A provider may reject a command for a terminated service; the check
      // reads only the status afterwards.
      await provider
        .suspend({ ...ref, idempotencyKey: keyFor("suspend"), reason: "abuse" })
        .catch(() => undefined);
      await provider
        .unsuspend({
          ...ref,
          idempotencyKey: keyFor("unsuspend"),
          reason: "abuse",
        })
        .catch(() => undefined);
      expect(await statusOf(setup, ref)).toEqual({ status: "terminated" });
    },
  },
  {
    title:
      "renew(), where present, repeated with the same key has no further effect",
    run: async (setup) => {
      const { provider } = setup;
      if (provider.renew === undefined) return;
      const ref = await provisionActive(setup);
      await expectNoSecondEffect(setup, ref, async () =>
        provider.renew?.({
          ...ref,
          idempotencyKey: keyFor("renew"),
          periodMonths: 12,
        }),
      );
    },
  },
  {
    title:
      "changePlan(), where present, repeated with the same key has no further effect",
    run: async (setup) => {
      const { provider, otherProduct } = setup;
      if (provider.changePlan === undefined) return;
      if (otherProduct === undefined) {
        throw new Error(
          "setup.otherProduct must name a product, because the provider has changePlan()",
        );
      }
      const ref = await provisionActive(setup);
      await expectNoSecondEffect(setup, ref, async () =>
        provider.changePlan?.({
          ...ref,
          idempotencyKey: keyFor("change-plan"),
          toProduct: otherProduct,
        }),
      );
    },
  },
  {
    title:
      "quote(), where present, prices in integer minor units with an ISO 4217 currency",
    run: async ({ provider, product, config }) => {
      if (provider.quote === undefined) return;
      const price = await provider.quote({ product, config, periodMonths: 12 });
      expect(Number.isInteger(price.amount)).toBe(true);
      expect(price.amount).toBeGreaterThanOrEqual(0);
      expect(price.currency).toMatch(/^[A-Z]{3}$/);
    },
  },
  {
    title:
      "actions() describes each action with a unique key, a label, a complete form and a confirmation level",
    run: async (setup) => {
      const ref = await provisionActive(setup);
      const actions = await setup.provider.actions({ ...ref, actor: ACTOR });
      const keys = actions.map((action) => action.key);
      expect(new Set(keys).size).toBe(keys.length);
      for (const action of actions) {
        expect(action.key).not.toBe("");
        expect(action.label).not.toBe("");
        expect(
          checkFormDescriptor(`action ${action.key}`, action.form),
        ).toEqual([]);
        expect(Object.hasOwn(CONFIRMATIONS, action.confirmation)).toBe(true);
        expect(typeof action.longRunning).toBe("boolean");
      }
    },
  },
  {
    title: "runAction() repeated with the same key has no further effect",
    run: async (setup) => {
      const { provider, action } = setup;
      const ref = await provisionActive(setup);
      const actions = await provider.actions({ ...ref, actor: ACTOR });
      if (actions.length === 0) return;
      if (action === undefined) {
        throw new Error(
          "setup.action must name an action and its input, because actions() lists some",
        );
      }
      const described = actions.find(({ key }) => key === action.key);
      expect(described?.form.schema.safeParse(action.input).success).toBe(true);
      await expectNoSecondEffect(setup, ref, () =>
        provider.runAction({
          ...ref,
          idempotencyKey: keyFor(`action-${action.key}`),
          action: action.key,
          input: action.input,
          actor: ACTOR,
        }),
      );
    },
  },
];

/**
 * The `provisioning` port contract (§4.8 of integration-first.md): every
 * provider runs it against its own fake. `setup` runs before each check and
 * must return a provider on a fake that holds no service.
 *
 * It proves the promises of `ProvisioningProvider`: the product and order
 * forms are complete; `validateOrder` accepts what the provider carries out
 * and rejects what `provision` fails on; a `pending` answer settles through
 * `status()` after a finite wait; every command repeated with the same key
 * has no further effect; `status()` changes nothing; suspensions are held
 * per reason and lifted per reason; `terminate` is final; `quote` prices in
 * integer minor units; and `actions()` describes every action.
 */
export const describeProvisioningProvider = (
  name: string,
  setup: () => Promise<ProvisioningContractSetup>,
): void =>
  describeChecks(`${name} provides provisioning`, PROVISIONING_CHECKS, setup);

/** Runs the `provisioning` contract and returns one line per failed check, for the suite's own tests. */
export const runProvisioningContract = (
  setup: () => Promise<ProvisioningContractSetup>,
): Promise<string[]> => runChecks(PROVISIONING_CHECKS, setup);
