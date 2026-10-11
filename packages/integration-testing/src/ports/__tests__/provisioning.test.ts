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

import { describe, expect, test } from "bun:test";
import type {
  ActionResult,
  OperationResult,
  ProviderStatus,
  ProvisioningProduct,
  ProvisioningProvider,
  ProvisionResult,
  ServiceRef,
  SuspensionReason,
} from "@virtbase/ports";
import { PortError } from "@virtbase/ports";
import * as z from "zod";
import type { ProvisioningContractSetup } from "../provisioning";
import {
  describeProvisioningProvider,
  runProvisioningContract,
} from "../provisioning";

interface Defects {
  /** Creates another service for a repeated provision. */
  provisionsTwice?: boolean;
  /** Answers `pending` with a negative wait. */
  waitsNegative?: boolean;
  /** Approves every order, the taken hostname included. */
  approvesEverything?: boolean;
  /** Counts each suspend, so a repeated one has to be lifted twice. */
  stacksSuspensions?: boolean;
  /** Powers the guest on again for every unsuspend. */
  powersOnTwice?: boolean;
  /** Lifts every suspension when one reason is lifted. */
  liftsEveryReason?: boolean;
  /** Counts each terminate, a repeated one included. */
  terminatesTwice?: boolean;
  /** Brings a terminated service back on unsuspend. */
  revivesTerminated?: boolean;
  /** Renews again for a repeated renew. */
  renewsTwice?: boolean;
  /** Answers a renew `pending` with a negative wait. */
  renewWaitsNegative?: boolean;
  /** Changes the plan again for a repeated change. */
  changesPlanTwice?: boolean;
  /** Runs the action again for a repeated one. */
  runsActionTwice?: boolean;
  /** Describes its action without a label. */
  unlabelledAction?: boolean;
  /** Quotes in major units, as a provider's float. */
  quotesFloats?: boolean;
  /** Never finishes pending work. */
  neverFinishes?: boolean;
  /** Rejects an order it cannot carry out with a plain `Error`. */
  rejectsWithPlainError?: boolean;
}

interface Options {
  /**
   * Answers `active` and `done` at once instead of `pending`, and rejects an
   * order it cannot carry out instead of settling it `failed`.
   */
  immediate?: boolean;
  /** Leaves out `renew`, `changePlan` and `quote`, and offers no action. */
  minimal?: boolean;
}

const TAKEN_HOSTNAME = "taken.example";

const ProductConfigSchema = z.object({ location: z.enum(["fsn", "nbg"]) });
const OrderConfigSchema = z.object({
  hostname: z.string().min(1),
  rootPassword: z.string().optional(),
});

const PRODUCT: ProvisioningProduct = {
  id: "prd_small",
  kind: "game_server",
  config: { location: "fsn" },
};
const LARGER_PRODUCT: ProvisioningProduct = {
  id: "prd_large",
  kind: "game_server",
  config: { location: "nbg" },
};

interface FakeService {
  serviceId: string;
  providerRef: string;
  productId: string;
  state: "installing" | "running" | "failed" | "terminating" | "terminated";
  suspensions: SuspensionReason[];
  powerOns: number;
  terminations: number;
  renewedMonths: number;
  planChanges: number;
  actionRuns: number;
}

const portError = (detail: string) =>
  new PortError(detail, { port: "provisioning", integrationId: "reference" });

/** An in-memory provider that keeps the contract, unless told otherwise. */
const referenceProvider = async (
  defects: Defects = {},
  { immediate = false, minimal = false }: Options = {},
): Promise<ProvisioningContractSetup> => {
  const services: FakeService[] = [];
  const checkAfterMs = defects.waitsNegative ? -1 : 1_000;

  const find = ({ serviceId, providerRef }: ServiceRef): FakeService => {
    const service = [...services]
      .reverse()
      .find(
        (candidate) =>
          candidate.serviceId === serviceId &&
          (providerRef === null || candidate.providerRef === providerRef),
      );
    if (!service) throw portError(`no service ${serviceId}`);
    return service;
  };

  /** Lifts the suspension for `reason`, and powers on once none is left. */
  const lift = (service: FakeService, reason: SuspensionReason) => {
    const index = service.suspensions.indexOf(reason);
    if (defects.liftsEveryReason) service.suspensions = [];
    else if (index >= 0) service.suspensions.splice(index, 1);
    if (service.suspensions.length === 0) service.powerOns += 1;
  };

  /**
   * One command's answers by idempotency key: the effect runs once per key,
   * unless `repeat` makes it run every time.
   */
  const answersOf = <T>() => {
    const answers = new Map<string, T>();
    return async (
      key: string,
      repeat: boolean | undefined,
      effect: () => T,
    ): Promise<T> => {
      const known = answers.get(key);
      if (!repeat && known !== undefined) return known;
      const answer = effect();
      answers.set(key, answer);
      return answer;
    };
  };
  const provisionOnce = answersOf<ProvisionResult>();
  const suspendOnce = answersOf<true>();
  const unsuspendOnce = answersOf<true>();
  const terminateOnce = answersOf<OperationResult>();
  const renewOnce = answersOf<OperationResult>();
  const changePlanOnce = answersOf<OperationResult>();
  const actionOnce = answersOf<ActionResult>();

  const full: ProvisioningProvider = {
    kinds: ["game_server"],
    productConfig: {
      schema: ProductConfigSchema,
      fields: [
        {
          key: "location",
          label: "Location",
          widget: "select",
          options: [
            { value: "fsn", label: "Falkenstein" },
            { value: "nbg", label: "Nuremberg" },
          ],
        },
      ],
    },
    describeOrder: async () => ({
      schema: OrderConfigSchema,
      fields: [
        { key: "hostname", label: "Hostname", widget: "text" },
        {
          key: "rootPassword",
          label: "Root password",
          widget: "password",
          optional: true,
        },
      ],
      secretKeys: ["rootPassword"],
    }),
    validateOrder: async ({ config }) =>
      OrderConfigSchema.parse(config).hostname === TAKEN_HOSTNAME &&
      !defects.approvesEverything
        ? {
            status: "invalid",
            issues: [{ code: "reference.hostname-taken", field: "hostname" }],
          }
        : { status: "valid" },
    quote: async () => ({
      amount: defects.quotesFloats ? 12.5 : 1250,
      currency: "EUR",
    }),
    provision: ({ serviceId, idempotencyKey, product, config }) =>
      provisionOnce(idempotencyKey, defects.provisionsTwice, () => {
        const { hostname } = OrderConfigSchema.parse(config);
        if (immediate && hostname === TAKEN_HOSTNAME) {
          throw defects.rejectsWithPlainError
            ? new Error(`${hostname} is taken`)
            : portError(`${hostname} is taken`);
        }
        const service: FakeService = {
          serviceId,
          providerRef: `srv-${services.length + 1}`,
          productId: product.id,
          state: hostname === TAKEN_HOSTNAME ? "failed" : "installing",
          suspensions: [],
          powerOns: 0,
          terminations: 0,
          renewedMonths: 0,
          planChanges: 0,
          actionRuns: 0,
        };
        services.push(service);
        if (immediate && service.state === "installing") {
          service.state = "running";
          return { status: "active", providerRef: service.providerRef };
        }
        return { status: "pending", checkAfterMs, providerRef: null };
      }),
    status: async (ref): Promise<ProviderStatus> => {
      const service = find(ref);
      switch (service.state) {
        case "installing":
        case "terminating":
          return { status: "pending", checkAfterMs };
        case "failed":
          return { status: "failed", code: "reference.hostname-taken" };
        case "terminated":
          return { status: "terminated" };
        case "running":
          return service.suspensions.length > 0
            ? {
                status: "suspended",
                reasons: [...new Set(service.suspensions)],
              }
            : { status: "active", providerRef: service.providerRef };
        default: {
          const unreachable: never = service.state;
          throw new Error(`unknown state ${String(unreachable)}`);
        }
      }
    },
    suspend: async ({ idempotencyKey, reason, ...ref }) => {
      await suspendOnce(idempotencyKey, defects.stacksSuspensions, () => {
        const service = find(ref);
        if (service.state !== "running") throw portError("not running");
        if (
          defects.stacksSuspensions ||
          !service.suspensions.includes(reason)
        ) {
          service.suspensions.push(reason);
        }
        return true;
      });
    },
    unsuspend: async ({ idempotencyKey, reason, ...ref }) => {
      await unsuspendOnce(idempotencyKey, defects.powersOnTwice, () => {
        const service = find(ref);
        if (service.state === "terminated" && defects.revivesTerminated) {
          service.state = "running";
        }
        if (service.state !== "running") throw portError("not running");
        lift(service, reason);
        return true;
      });
    },
    terminate: ({ idempotencyKey, ...ref }) =>
      terminateOnce(idempotencyKey, defects.terminatesTwice, () => {
        const service = find(ref);
        service.terminations += 1;
        if (service.state === "terminated") return { status: "done" };
        service.state = immediate ? "terminated" : "terminating";
        return immediate
          ? { status: "done" }
          : { status: "pending", checkAfterMs };
      }),
    renew: ({ idempotencyKey, periodMonths, ...ref }) =>
      renewOnce(idempotencyKey, defects.renewsTwice, () => {
        find(ref).renewedMonths += periodMonths;
        if (immediate) return { status: "done" };
        return {
          status: "pending",
          checkAfterMs: defects.renewWaitsNegative ? -1 : checkAfterMs,
        };
      }),
    changePlan: ({ idempotencyKey, toProduct, ...ref }) =>
      changePlanOnce(idempotencyKey, defects.changesPlanTwice, () => {
        const service = find(ref);
        service.productId = toProduct.id;
        service.planChanges += 1;
        return { status: "done" };
      }),
    actions: async () => [
      {
        key: "panel-login",
        label: defects.unlabelledAction ? "" : "Open the panel",
        form: { schema: z.object({}), fields: [] },
        confirmation: "none",
        longRunning: false,
      },
    ],
    runAction: ({ idempotencyKey, ...ref }) =>
      actionOnce(idempotencyKey, defects.runsActionTwice, () => {
        find(ref).actionRuns += 1;
        return { status: "redirect", url: "https://panel.example/login/t" };
      }),
  };

  const { renew, changePlan, quote, ...required } = full;
  const provider: ProvisioningProvider = minimal
    ? { ...required, actions: async () => [] }
    : full;

  return {
    provider,
    product: PRODUCT,
    otherProduct: LARGER_PRODUCT,
    config: { hostname: "play.example" },
    rejectedConfig: { hostname: TAKEN_HOSTNAME },
    action: { key: "panel-login", input: {} },
    finishPendingWork: async () => {
      if (defects.neverFinishes) return;
      for (const service of services) {
        if (service.state === "installing") service.state = "running";
        if (service.state === "terminating") service.state = "terminated";
      }
    },
    snapshot: async () => structuredClone(services),
  };
};

const failedTitles = async (
  setup: () => Promise<ProvisioningContractSetup>,
): Promise<string[]> =>
  (await runProvisioningContract(setup)).map((failure) =>
    failure.slice(0, failure.indexOf(":")),
  );

describeProvisioningProvider("the reference provider", () =>
  referenceProvider(),
);

describeProvisioningProvider("a provider that answers at once", () =>
  referenceProvider({}, { immediate: true }),
);

describeProvisioningProvider("a provider without optional methods", () =>
  referenceProvider({}, { minimal: true }),
);

describe("runProvisioningContract", () => {
  const cases: [string, Defects, string][] = [
    [
      "provisions again for a repeated key",
      { provisionsTwice: true },
      "provision() repeated with the same key provisions once",
    ],
    [
      "answers pending with a negative wait",
      { waitsNegative: true },
      "every pending answer waits a finite, non-negative time",
    ],
    [
      "approves an order it then fails to provision",
      { approvesEverything: true },
      "validateOrder() rejects, with a code for each issue, an order provision() fails on",
    ],
    [
      "counts a repeated suspend",
      { stacksSuspensions: true },
      "suspend() repeated with the same key has no further effect",
    ],
    [
      "powers on again for a repeated unsuspend",
      { powersOnTwice: true },
      "unsuspend() repeated with the same key has no further effect",
    ],
    [
      "lifts every suspension when one reason is lifted",
      { liftsEveryReason: true },
      "unsuspend() for one reason leaves the suspension for another in place",
    ],
    [
      "counts a repeated terminate",
      { terminatesTwice: true },
      "terminate() repeated with the same key has no further effect",
    ],
    [
      "brings a terminated service back",
      { revivesTerminated: true },
      "a terminated service stays terminated",
    ],
    [
      "renews again for a repeated key",
      { renewsTwice: true },
      "renew(), where present, repeated with the same key has no further effect",
    ],
    [
      "answers a renew pending with a negative wait",
      { renewWaitsNegative: true },
      "every pending answer waits a finite, non-negative time",
    ],
    [
      "changes the plan again for a repeated key",
      { changesPlanTwice: true },
      "changePlan(), where present, repeated with the same key has no further effect",
    ],
    [
      "runs an action again for a repeated key",
      { runsActionTwice: true },
      "runAction() repeated with the same key has no further effect",
    ],
    [
      "describes an action without a label",
      { unlabelledAction: true },
      "actions() describes each action with a unique key, a label, a complete form and a confirmation level",
    ],
    [
      "quotes in major units",
      { quotesFloats: true },
      "quote(), where present, prices in integer minor units with an ISO 4217 currency",
    ],
  ];

  for (const [defect, defects, title] of cases) {
    test(`fails a provider that ${defect}`, async () => {
      expect(await failedTitles(() => referenceProvider(defects))).toEqual([
        title,
      ]);
    });
  }

  test("fails a setup that names no product to change to", async () => {
    expect(
      await failedTitles(async () => ({
        ...(await referenceProvider()),
        otherProduct: undefined,
      })),
    ).toEqual([
      "changePlan(), where present, repeated with the same key has no further effect",
    ]);
  });

  test("fails a setup that names no action, because the provider offers one", async () => {
    expect(
      await failedTitles(async () => ({
        ...(await referenceProvider()),
        action: undefined,
      })),
    ).toEqual(["runAction() repeated with the same key has no further effect"]);
  });

  test("fails a provider that rejects a failed provision with a plain Error", async () => {
    expect(
      await failedTitles(() =>
        referenceProvider({ rejectsWithPlainError: true }, { immediate: true }),
      ),
    ).toEqual([
      "validateOrder() rejects, with a code for each issue, an order provision() fails on",
    ]);
  });

  test("fails a provider whose pending work never finishes", async () => {
    const failures = await runProvisioningContract(() =>
      referenceProvider({ neverFinishes: true }),
    );
    expect(failures).toContain(
      "provision() settles active, through status() while it answers pending: status() still answers pending after 5 polls",
    );
  });

  test("fails a provider whose provision of a valid order fails", async () => {
    const failures = await runProvisioningContract(async () => ({
      ...(await referenceProvider()),
      config: { hostname: TAKEN_HOSTNAME },
    }));
    expect(failures).toContain(
      "status() changes nothing at the provider: provision() settled failed, not active",
    );
  });
});
