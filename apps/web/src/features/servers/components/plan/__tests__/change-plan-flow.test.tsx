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

import { beforeAll, describe, expect, mock, test } from "bun:test";
import * as actualNextIntl from "next-intl";

/** See the note in `billing/__tests__/cancel-subscription.test.tsx`. */
const translate = Object.assign(
  (message: string, values?: Record<string, unknown>) =>
    values
      ? message.replace(/\{(\w+)\}/g, (match, key: string) =>
          key in values ? String(values[key]) : match,
        )
      : message,
  {
    /**
     * The consent labels are rich text. The tags are dropped rather than
     * rendered: what the boxes say is asserted elsewhere, and what matters
     * here is that they are boxes a customer has to tick.
     */
    rich: (message: string) => message.replace(/<\/?\w+>/g, ""),
  },
);

mock.module("next-intl", () => ({
  ...actualNextIntl,
  useExtracted: () => translate,
}));

type Rendered = typeof import("@virtbase/test-utils/react");

let renderWithProviders: Rendered["renderWithProviders"];
let screen: Rendered["screen"];
let within: Rendered["within"];
let userEvent: Rendered["userEvent"];
let PlanProvider: typeof import("../plan-context").PlanProvider;
let PlanCatalog: typeof import("../plan-catalog").PlanCatalog;
let PlanOrderDialog: typeof import("../plan-order-dialog").PlanOrderDialog;
type PlanCheckoutState = import("../plan-context").PlanCheckoutState;
type Plan = import("../plan-context").Plan;
let IntlEnvironment: (props: { children: React.ReactNode }) => React.ReactNode;

beforeAll(async () => {
  const rendered = await import("@virtbase/test-utils/react");
  renderWithProviders = rendered.renderWithProviders;
  screen = rendered.screen;
  within = rendered.within;
  userEvent = rendered.userEvent;

  PlanProvider = (await import("../plan-context")).PlanProvider;
  PlanCatalog = (await import("../plan-catalog")).PlanCatalog;
  PlanOrderDialog = (await import("../plan-order-dialog")).PlanOrderDialog;

  const { NextIntlClientProvider } = actualNextIntl;
  IntlEnvironment = ({ children }) => (
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={{}}>
      {children}
    </NextIntlClientProvider>
  );
});

const SERVER_ID = "kvm_1KDR24RNF2WY69G0FG7YHDQ6T";

const currentPlan: Plan = {
  id: "sp_1KDR24RNF2WY69G0FG7YHDQ6T",
  name: "VPS 4",
  price: 1200,
  cores: 4,
  memory: 8192,
  storage: 160,
  netrate: 1000,
  current: true,
  available: true,
  renewal_price: 1200,
  renewal_discount: null,
  upgrade_price: null,
};

const biggerPlan: Plan = {
  id: "sp_2KDR24RNF2WY69G0FG7YHDQ6T",
  name: "VPS 8",
  price: 2400,
  cores: 8,
  memory: 16384,
  storage: 320,
  netrate: 1000,
  current: false,
  available: true,
  renewal_price: 2400,
  renewal_discount: null,
  upgrade_price: 640,
};

const biggestPlan: Plan = {
  id: "sp_3KDR24RNF2WY69G0FG7YHDQ6T",
  name: "VPS 16",
  price: 4800,
  cores: 16,
  memory: 32768,
  storage: 640,
  netrate: 1000,
  current: false,
  available: true,
  renewal_price: 4800,
  renewal_discount: null,
  upgrade_price: 1800,
};

/** Smaller storage than the server has, which is not a move we support. */
const smallerPlan: Plan = {
  id: "sp_4KDR24RNF2WY69G0FG7YHDQ6T",
  name: "VPS 2",
  price: 600,
  cores: 2,
  memory: 4096,
  storage: 80,
  netrate: 1000,
  current: false,
  available: true,
  renewal_price: 600,
  renewal_discount: null,
  upgrade_price: 0,
};

/** Bigger, but the term it would be prorated against has already lapsed. */
const lapsedUpgradePlan: Plan = {
  id: "sp_5KDR24RNF2WY69G0FG7YHDQ6T",
  name: "VPS 32",
  price: 9600,
  cores: 32,
  memory: 65536,
  storage: 1280,
  netrate: 1000,
  current: false,
  available: true,
  renewal_price: 9600,
  renewal_discount: null,
  upgrade_price: 0,
};

/** Bigger, orderable in principle, and out of stock right now. */
const soldOutPlan: Plan = {
  id: "sp_6KDR24RNF2WY69G0FG7YHDQ6T",
  name: "VPS 12",
  price: 3600,
  cores: 12,
  memory: 24576,
  storage: 480,
  netrate: 1000,
  current: false,
  available: false,
  renewal_price: 3600,
  renewal_discount: null,
  upgrade_price: 1200,
};

const plans = [
  smallerPlan,
  currentPlan,
  biggerPlan,
  biggestPlan,
  soldOutPlan,
  lapsedUpgradePlan,
];

const idleCheckout: PlanCheckoutState = {
  orderId: null,
  clientSecret: null,
  customerSessionClientSecret: null,
  isPending: false,
  error: null,
  createOrder: () => {},
  resetCheckoutSession: () => {},
};

/**
 * The list and the dialog, wired the way the card wires them.
 *
 * Both are rendered together because what is under test is the seam between
 * them: which control was pressed, and what that turns into when the dialog is
 * confirmed.
 */
const renderFlow = (checkout: Partial<PlanCheckoutState> = {}) => {
  const createOrder = mock((_input: unknown) => {});
  const resetCheckoutSession = mock(() => {});

  const rendered = renderWithProviders(
    <IntlEnvironment>
      <PlanProvider
        serverId={SERVER_ID}
        plans={plans}
        currentPlan={currentPlan}
        isPending={false}
        checkout={{
          ...idleCheckout,
          createOrder,
          resetCheckoutSession,
          ...checkout,
        }}
      >
        <PlanCatalog />
        <PlanOrderDialog />
      </PlanProvider>
    </IntlEnvironment>,
  );

  return { ...rendered, createOrder, resetCheckoutSession };
};

const rowFor = (name: string) => {
  const row = screen
    .getAllByTestId("plan-row")
    .find((candidate) => candidate.textContent?.includes(name));

  if (!row) throw new Error(`No plan row for ${name}`);

  return row;
};

/** Press the row's own button, which is the only way in. */
const activate = async (name: string) => {
  await userEvent.click(
    within(rowFor(name)).getByRole("button", { name: "Upgrade" }),
  );
};

/** Tick both consent boxes and confirm. */
const confirm = async () => {
  const dialog = screen.getByRole("dialog");
  for (const box of within(dialog).getAllByRole("checkbox")) {
    await userEvent.click(box);
  }
  await userEvent.click(screen.getByTestId("confirm-plan-order"));
};

describe("Choosing a plan", () => {
  test("every row is comparable: a name, its specs and a monthly price", () => {
    renderFlow();

    const row = rowFor("VPS 8");

    expect(row).toHaveTextContent("VPS 8");
    expect(within(row).getByTestId("plan-specs")).toHaveTextContent(
      "320GB NVMe SSD",
    );
    expect(row).toHaveTextContent("€24.00 / month");
    // The pro-rata is the quieter second line; the dialog is where it is the
    // headline.
    expect(row).toHaveTextContent("€6.40 today");
    // One control, named for what pressing it does.
    expect(within(row).getByRole("button", { name: "Upgrade" })).toBeEnabled();
  });

  test("the current row is marked in white and is the only one carrying Extend", () => {
    renderFlow();

    const badge = within(rowFor("VPS 4")).getByTestId("current-plan-badge");

    expect(badge).toHaveTextContent("Current plan");
    // Unfilled. The marker is on the page every single visit, and a solid
    // chip that never goes away is one people stop seeing.
    expect(badge).toHaveAttribute("data-variant", "outline");

    expect(screen.getAllByTestId("extend-plan")).toHaveLength(1);
    expect(within(rowFor("VPS 4")).getByTestId("extend-plan")).toBeVisible();
    // Nothing offers to upgrade to the plan the server is already on.
    expect(
      within(rowFor("VPS 4")).queryByRole("button", { name: "Upgrade" }),
    ).toBeNull();
  });

  test("Upgrade on a plan that is not the current one opens the dialog", async () => {
    renderFlow();

    expect(screen.queryByRole("dialog")).toBeNull();

    await activate("VPS 8");

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Upgrade to VPS 8");
    // What you are buying, then what it costs today.
    expect(within(dialog).getByTestId("due-today")).toHaveTextContent("€6.40");
    expect(within(dialog).getByTestId("confirm-plan-order")).toHaveTextContent(
      "Upgrade for €6.40",
    );
  });

  test("the current row's Extend opens the same dialog in extend mode", async () => {
    renderFlow();

    await userEvent.click(screen.getByTestId("extend-plan"));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Extend VPS 4");
    // The extension is a month at the renewal price, not a pro-rata upgrade.
    expect(within(dialog).getByTestId("due-today")).toHaveTextContent("€12.00");
    expect(dialog).toHaveTextContent(
      "Your current plan will be extended by one month.",
    );
    expect(within(dialog).getByTestId("confirm-plan-order")).toHaveTextContent(
      "Extend for €12.00",
    );
  });

  test("there is nothing to select: a row is pressed, not picked", () => {
    renderFlow();

    // No radio, no checked row, no state to leave stale between two presses.
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.getAllByTestId("plan-row")).toHaveLength(plans.length);
    // One button per row, and only the current plan's says "Extend".
    expect(screen.getAllByRole("button", { name: "Upgrade" })).toHaveLength(
      plans.length - 1,
    );
  });

  test("a plan with less storage is refused in the row, with the reason", async () => {
    renderFlow();

    const row = rowFor("VPS 2");
    const button = within(row).getByRole("button", { name: "Upgrade" });

    // The row stays, priced and legible. What changes is that the button is
    // dead and says why, which is what a vanished row never gets to do.
    expect(button).toBeDisabled();
    expect(within(row).getByTestId("plan-blocked-reason")).toHaveTextContent(
      "Less storage than your plan",
    );

    await userEvent.click(button);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("a sold-out plan is refused the same way", async () => {
    renderFlow();

    const row = rowFor("VPS 12");
    const button = within(row).getByRole("button", { name: "Upgrade" });

    expect(button).toBeDisabled();
    expect(within(row).getByTestId("plan-blocked-reason")).toHaveTextContent(
      "Sold out",
    );

    await userEvent.click(button);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("What the dialog orders", () => {
  test("the current plan is ordered as an extension", async () => {
    const { createOrder } = renderFlow();

    await userEvent.click(screen.getByTestId("extend-plan"));
    await confirm();

    expect(createOrder).toHaveBeenCalledTimes(1);
    expect(createOrder).toHaveBeenCalledWith({
      type: "extend_server",
      server_id: SERVER_ID,
      server_plan_id: currentPlan.id,
      terms: true,
      waiver: true,
    });
  });

  test("any other plan is ordered as an upgrade", async () => {
    const { createOrder } = renderFlow();

    await activate("VPS 8");
    await confirm();

    expect(createOrder).toHaveBeenCalledWith({
      type: "upgrade_server",
      server_id: SERVER_ID,
      server_plan_id: biggerPlan.id,
      terms: true,
      waiver: true,
    });
  });

  test("nothing is ordered until both boxes are ticked", async () => {
    const { createOrder } = renderFlow();

    await activate("VPS 8");
    await userEvent.click(screen.getByTestId("confirm-plan-order"));

    expect(createOrder).not.toHaveBeenCalled();
  });

  test("dismissing and reopening on another plan cannot submit the old order", async () => {
    const { createOrder } = renderFlow();

    // Open one action, walk away from it, open a different one. The type and
    // the plan both have to follow the second press, not the first.
    await activate("VPS 8");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await activate("VPS 16");
    await confirm();

    expect(createOrder).toHaveBeenCalledTimes(1);
    expect(createOrder).toHaveBeenCalledWith({
      type: "upgrade_server",
      server_id: SERVER_ID,
      server_plan_id: biggestPlan.id,
      terms: true,
      waiver: true,
    });
  });

  test("an upgrade dismissed for an extension orders the extension", async () => {
    const { createOrder } = renderFlow();

    await activate("VPS 8");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(screen.getByTestId("extend-plan"));
    await confirm();

    expect(createOrder).toHaveBeenCalledWith({
      type: "extend_server",
      server_id: SERVER_ID,
      server_plan_id: currentPlan.id,
      terms: true,
      waiver: true,
    });
  });

  test("consent is asked for again every time the dialog is opened", async () => {
    renderFlow();

    await activate("VPS 8");
    for (const box of within(screen.getByRole("dialog")).getAllByRole(
      "checkbox",
    )) {
      await userEvent.click(box);
    }
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await activate("VPS 16");

    for (const box of within(screen.getByRole("dialog")).getAllByRole(
      "checkbox",
    )) {
      expect(box).not.toBeChecked();
    }
  });

  test("an expired term is refused with a reason, not a dead button", async () => {
    renderFlow();

    // A pro-rata of zero means the term has already lapsed, so there is
    // nothing meaningful to charge for the bigger plan yet.
    await activate("VPS 32");

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Your current term has expired");
    expect(within(dialog).getByTestId("confirm-plan-order")).toBeDisabled();
  });

  test("a failed order says so in the dialog", async () => {
    renderFlow({ error: new Error("Your card was declined.") });

    await activate("VPS 8");

    expect(screen.getByTestId("plan-order-error")).toHaveTextContent(
      "Your card was declined.",
    );
  });
});

describe("An order left unpaid", () => {
  const paidForCheckout = {
    orderId: "ord_1KDR24RNF2WY69G0FG7YHDQ6T",
    clientSecret: "pi_1_secret_1",
    customerSessionClientSecret: "cuss_1",
  };

  test("closing the dialog mid-flight says what was left behind", async () => {
    renderFlow(paidForCheckout);

    // The dialog is not open: this is a page loaded with a checkout session
    // still in the URL, which is what a dismissal leaves behind.
    expect(screen.getByTestId("unpaid-order")).toHaveTextContent(
      "An order is waiting to be paid",
    );
    expect(screen.getByTestId("unpaid-order")).toHaveTextContent(
      "Nothing has been charged",
    );

    await userEvent.click(screen.getByTestId("resume-order"));
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Complete your payment",
    );
  });

  test("the payment step keeps its actions in the dialog footer", async () => {
    const { resetCheckoutSession } = renderFlow(paidForCheckout);

    await userEvent.click(screen.getByTestId("resume-order"));

    const dialog = screen.getByRole("dialog");

    // Same two slots as the summary step - a way out, then the thing the
    // customer came for - so nothing moves when the dialog changes step. On a
    // phone this is also what keeps "Pay now" out of the scrolling body,
    // where a Payment Element is taller than the viewport.
    const pay = within(dialog).getByTestId("confirm-plan-payment");
    expect(pay).toHaveTextContent("Pay now");
    expect(within(dialog).queryByTestId("confirm-plan-order")).toBeNull();

    // No Elements is mounted here, so the form the footer submits does not
    // exist yet. A button whose press would be dropped says so.
    expect(pay).toBeDisabled();

    await userEvent.click(
      within(dialog).getByRole("button", { name: "Change plan" }),
    );
    expect(resetCheckoutSession).toHaveBeenCalledTimes(1);
  });

  test("discarding it clears the session", async () => {
    const { resetCheckoutSession } = renderFlow(paidForCheckout);

    await userEvent.click(screen.getByTestId("discard-order"));

    expect(resetCheckoutSession).toHaveBeenCalledTimes(1);
  });

  test("opening a different plan throws the stale session away", async () => {
    const { resetCheckoutSession } = renderFlow(paidForCheckout);

    // The intent behind that session is priced for whatever it was created
    // for. Dropping the customer onto it from a different row would charge
    // them for the wrong plan.
    await activate("VPS 8");

    expect(resetCheckoutSession).toHaveBeenCalledTimes(1);
  });
});
