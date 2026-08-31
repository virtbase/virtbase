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

/** See the note in `cancel-subscription.test.tsx`. */
const translate = (message: string, values?: Record<string, unknown>) =>
  values
    ? message.replace(/\{(\w+)\}/g, (match, key: string) =>
        key in values ? String(values[key]) : match,
      )
    : message;

mock.module("next-intl", () => ({
  ...actualNextIntl,
  useExtracted: () => translate,
}));

type Rendered = typeof import("@virtbase/test-utils/react");

let renderWithProviders: Rendered["renderWithProviders"];
let screen: Rendered["screen"];
let userEvent: Rendered["userEvent"];
let AutoRenewSection: typeof import("../auto-renew-section").AutoRenewSection;
let MANDATE_VERSION: string;
let IntlEnvironment: (props: { children: React.ReactNode }) => React.ReactNode;

beforeAll(async () => {
  const rendered = await import("@virtbase/test-utils/react");
  renderWithProviders = rendered.renderWithProviders;
  screen = rendered.screen;
  userEvent = rendered.userEvent;

  AutoRenewSection = (await import("../auto-renew-section")).AutoRenewSection;
  MANDATE_VERSION = (await import("@virtbase/validators"))
    .SUBSCRIPTION_MANDATE_TEXT_VERSION;

  const { NextIntlClientProvider } = actualNextIntl;
  IntlEnvironment = ({ children }) => (
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={{}}>
      {children}
    </NextIntlClientProvider>
  );
});

const subscription = {
  id: "sub_1KDR24RNF2WY69G0FG7YHDQ6T",
  subject_type: "server",
  subject_id: "kvm_1KDR24RNF2WY69G0FG7YHDQ6T",
  subject_name: "web-01",
  status: "active" as const,
  interval_months: 1,
  currency: "EUR",
  current_period_start: new Date("2026-10-01T00:00:00.000Z"),
  current_period_end: new Date("2026-11-01T00:00:00.000Z"),
  auto_renew: false,
  payment_method: {
    id: "pm_1KDR24RNF2WY69G0FG7YHDQ6T",
    brand: "visa",
    last4: "4242",
  },
  mandate_accepted_at: null as Date | null,
  cancelled_at: null,
  cancel_reason: null,
  created_at: new Date("2026-10-01T00:00:00.000Z"),
};

const noop = () => {};

const section = (
  props: Partial<Parameters<typeof AutoRenewSection>[0]> = {},
) => (
  <IntlEnvironment>
    <AutoRenewSection
      subscription={subscription}
      renewalAmount={1200}
      paymentMethodState="usable"
      onAcceptMandate={noop}
      onSetAutoRenew={noop}
      isPending={false}
      {...props}
    />
  </IntlEnvironment>
);

const renderSection = (
  props: Partial<Parameters<typeof AutoRenewSection>[0]> = {},
) => renderWithProviders(section(props));

describe("AutoRenewSection preconditions", () => {
  test("with no payment method it names that, and links to the page that fixes it", async () => {
    const onSetAutoRenew = mock(() => {});

    renderSection({ paymentMethodState: "missing", onSetAutoRenew });

    await userEvent.click(screen.getByTestId("auto-renew-switch"));

    const blocked = screen.getByTestId("auto-renew-blocked");

    // The specific reason, not "something went wrong". The customer is told
    // what is missing and given somewhere to go.
    expect(blocked).toHaveTextContent("Add a payment method first");
    expect(
      screen.getByRole("link", { name: "Manage payment methods" }),
    ).toHaveAttribute("href", "/account/settings/billing");

    // And nothing was sent: the server would only have refused it, and a
    // round trip to be told what the page already knew is a round trip.
    expect(onSetAutoRenew).not.toHaveBeenCalled();
    // No mandate is collected either - consent to a charge we cannot make.
    expect(screen.queryByTestId("mandate-text")).toBeNull();
  });

  test("a dead credential gets its own sentence, not the same one", async () => {
    renderSection({ paymentMethodState: "unusable" });

    await userEvent.click(screen.getByTestId("auto-renew-switch"));

    expect(screen.getByTestId("auto-renew-blocked")).toHaveTextContent(
      "The payment method we would charge cannot be used.",
    );
  });

  test("a click before the saved cards arrive says so, and accuses nobody", async () => {
    const onSetAutoRenew = mock(() => {});

    renderSection({ paymentMethodState: "loading", onSetAutoRenew });

    await userEvent.click(screen.getByTestId("auto-renew-switch"));

    // The customer on a slow connection who presses the switch in the first
    // second used to be told "Add a payment method first", under a link to a
    // billing page that already listed their default card - and the alert then
    // flickered away with no explanation. "We do not know yet" is a different
    // fact from "you have none", and it is the true one.
    const checking = screen.getByTestId("auto-renew-checking");
    expect(checking).toHaveTextContent(
      "We are still checking which card would be charged.",
    );
    expect(checking).toHaveTextContent("Give it a moment, then try again.");

    expect(screen.queryByTestId("auto-renew-blocked")).toBeNull();
    expect(screen.queryByText(/Add a payment method first/)).toBeNull();

    // Nothing is sent and no consent is asked for on an answer we do not have.
    expect(onSetAutoRenew).not.toHaveBeenCalled();
    expect(screen.queryByTestId("mandate-text")).toBeNull();
  });

  test("the answer arriving turns that same click into the real one", async () => {
    const onSetAutoRenew = mock((_enabled: boolean) => {});
    const subscribed = {
      ...subscription,
      mandate_accepted_at: new Date("2026-10-01T00:00:00.000Z"),
    };

    const { rerender } = renderSection({
      subscription: subscribed,
      paymentMethodState: "loading",
      onSetAutoRenew,
    });

    await userEvent.click(screen.getByTestId("auto-renew-switch"));
    expect(screen.getByTestId("auto-renew-checking")).toBeVisible();

    // The query lands. The sentence goes with it rather than lingering, and
    // the customer's next click is the one that enrols them - which is the
    // whole reason this waits for a click instead of enrolling on their behalf
    // after they have stopped looking.
    rerender(
      section({
        subscription: subscribed,
        paymentMethodState: "usable",
        onSetAutoRenew,
      }),
    );

    expect(screen.queryByTestId("auto-renew-checking")).toBeNull();

    await userEvent.click(screen.getByTestId("auto-renew-switch"));
    expect(onSetAutoRenew).toHaveBeenCalledWith(true);
  });

  test("the switch stays usable while a precondition is missing", () => {
    renderSection({ paymentMethodState: "missing" });

    // Disabling it would be tidier and would tell the customer nothing. The
    // click is what earns them the explanation.
    expect(screen.getByTestId("auto-renew-switch")).toBeEnabled();
  });

  test("it surfaces the server's own refusal rather than a generic failure", () => {
    renderSection({
      errorMessage: "Automatic renewal needs a usable payment method.",
    });

    expect(screen.getByTestId("auto-renew-error")).toHaveTextContent(
      "Automatic renewal needs a usable payment method.",
    );
  });

  test("turning it off asks for nothing at all", async () => {
    const onSetAutoRenew = mock((_enabled: boolean) => {});

    renderSection({
      subscription: { ...subscription, auto_renew: true },
      onSetAutoRenew,
    });

    await userEvent.click(screen.getByTestId("auto-renew-switch"));

    // No dialog, no confirmation, no mandate. Withdrawing consent to be
    // charged is never something to gate.
    expect(screen.queryByTestId("mandate-text")).toBeNull();
    expect(onSetAutoRenew).toHaveBeenCalledWith(false);
  });
});

describe("AutoRenewSection mandate", () => {
  test("with everything in place it asks for consent before enrolling", async () => {
    const onSetAutoRenew = mock(() => {});
    const onAcceptMandate = mock((_version: string) => {});

    renderSection({ onSetAutoRenew, onAcceptMandate });

    await userEvent.click(screen.getByTestId("auto-renew-switch"));

    const mandate = screen.getByTestId("mandate-text");

    // What is charged, how often, that it is automatic, and how to stop it.
    expect(mandate).toHaveTextContent("€12.00 every month");
    expect(mandate).toHaveTextContent("Visa •••• 4242");
    expect(mandate).toHaveTextContent("This happens automatically");
    expect(mandate).toHaveTextContent("You can turn automatic renewal off");
    expect(mandate).toHaveTextContent("“Cancel subscription” button");
    expect(mandate).toHaveTextContent(`Agreement version ${MANDATE_VERSION}`);

    // The enrolment has not happened: consent first, and it is a separate
    // decision made by a separate call.
    expect(onSetAutoRenew).not.toHaveBeenCalled();
  });

  test("the box starts empty and the button is dead until it is ticked", async () => {
    const onAcceptMandate = mock((_version: string) => {});

    renderSection({ onAcceptMandate });

    await userEvent.click(screen.getByTestId("auto-renew-switch"));

    // A pre-ticked box is not consent.
    const box = screen.getByTestId("mandate-agree");
    expect(box).toHaveAttribute("data-state", "unchecked");
    expect(screen.getByTestId("mandate-accept")).toBeDisabled();

    await userEvent.click(box);

    expect(screen.getByTestId("mandate-accept")).toBeEnabled();
    await userEvent.click(screen.getByTestId("mandate-accept"));

    // The version travels with the text the customer was shown; the server
    // refuses anything else.
    expect(onAcceptMandate).toHaveBeenCalledWith(MANDATE_VERSION);
  });

  test("a recorded mandate is not asked for twice", async () => {
    const onSetAutoRenew = mock((_enabled: boolean) => {});

    renderSection({
      subscription: {
        ...subscription,
        mandate_accepted_at: new Date("2026-10-01T00:00:00.000Z"),
      },
      onSetAutoRenew,
    });

    await userEvent.click(screen.getByTestId("auto-renew-switch"));

    expect(screen.queryByTestId("mandate-text")).toBeNull();
    expect(onSetAutoRenew).toHaveBeenCalledWith(true);
  });

  test("with no price to agree to, the click says so instead of nothing", async () => {
    const onSetAutoRenew = mock(() => {});
    const onAcceptMandate = mock((_version: string) => {});

    // The plan query has not answered - loading, failed, or a server whose
    // plan is not in what came back. All three arrive here as a null price.
    renderSection({ renewalAmount: null, onSetAutoRenew, onAcceptMandate });

    await userEvent.click(screen.getByTestId("auto-renew-switch"));

    // Something the customer can read. Before this, the handler opened a
    // dialog that was not rendered and returned: no dialog, no alert, no
    // toast, and a switch that snapped back on the next render.
    expect(
      screen.getByTestId("auto-renew-price-unavailable"),
    ).toHaveTextContent("We cannot work out what this renewal would cost");

    // And nothing was sent or consented to: the mandate has to name the
    // amount, so there is no wording to show and nothing to record.
    expect(screen.queryByTestId("mandate-text")).toBeNull();
    expect(onAcceptMandate).not.toHaveBeenCalled();
    expect(onSetAutoRenew).not.toHaveBeenCalled();
  });

  test("the price arriving turns that same click into the dialog", async () => {
    const { rerender } = renderSection({ renewalAmount: null });

    await userEvent.click(screen.getByTestId("auto-renew-switch"));
    expect(screen.getByTestId("auto-renew-price-unavailable")).toBeVisible();

    // A loading query resolves and the customer's second click works. A
    // failed one does not, and they keep the sentence that tells them to
    // reload - which is the only honest difference between the two.
    rerender(section({ renewalAmount: 1200 }));
    await userEvent.click(screen.getByTestId("auto-renew-switch"));

    expect(screen.getByTestId("mandate-text")).toHaveTextContent(
      "€12.00 every month",
    );
    expect(screen.queryByTestId("auto-renew-price-unavailable")).toBeNull();
  });

  test("a recorded mandate does not need a price at all", async () => {
    const onSetAutoRenew = mock((_enabled: boolean) => {});

    renderSection({
      subscription: {
        ...subscription,
        mandate_accepted_at: new Date("2026-10-01T00:00:00.000Z"),
      },
      renewalAmount: null,
      onSetAutoRenew,
    });

    await userEvent.click(screen.getByTestId("auto-renew-switch"));

    // The price is a condition of *asking for consent*, not of enrolling.
    // Blocking here would refuse a customer who has already agreed.
    expect(screen.queryByTestId("auto-renew-price-unavailable")).toBeNull();
    expect(onSetAutoRenew).toHaveBeenCalledWith(true);
  });

  test("turning it off never waits for a price either", async () => {
    const onSetAutoRenew = mock((_enabled: boolean) => {});

    renderSection({
      subscription: { ...subscription, auto_renew: true },
      renewalAmount: null,
      onSetAutoRenew,
    });

    await userEvent.click(screen.getByTestId("auto-renew-switch"));

    expect(screen.queryByTestId("auto-renew-price-unavailable")).toBeNull();
    expect(onSetAutoRenew).toHaveBeenCalledWith(false);
  });

  test("a subscription the collector would skip cannot be enrolled", () => {
    renderSection({
      subscription: { ...subscription, status: "cancelled" },
    });

    expect(screen.getByTestId("auto-renew-switch")).toBeDisabled();
    expect(screen.getByText(/Resume this subscription/)).toBeInTheDocument();
  });
});
