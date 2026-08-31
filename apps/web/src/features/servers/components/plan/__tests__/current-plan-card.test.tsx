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
let CurrentPlanCard: typeof import("../current-plan-card").CurrentPlanCard;
let IntlEnvironment: (props: { children: React.ReactNode }) => React.ReactNode;

beforeAll(async () => {
  const rendered = await import("@virtbase/test-utils/react");
  renderWithProviders = rendered.renderWithProviders;
  screen = rendered.screen;
  userEvent = rendered.userEvent;

  CurrentPlanCard = (await import("../current-plan-card")).CurrentPlanCard;

  const { NextIntlClientProvider } = actualNextIntl;
  IntlEnvironment = ({ children }) => (
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={{}}>
      {children}
    </NextIntlClientProvider>
  );
});

/** Midday rather than midnight, so the printed day survives a negative offset. */
const PERIOD_END = new Date("2026-11-01T12:00:00.000Z");

const DEFAULT_METHOD_ID = "pm_1KDR24RNF2WY69G0FG7YHDQ6T";
const NAMED_METHOD_ID = "pm_2KDR24RNF2WY69G0FG7YHDQ6T";

const subscription = {
  id: "sub_1KDR24RNF2WY69G0FG7YHDQ6T",
  subject_type: "server",
  subject_id: "kvm_1KDR24RNF2WY69G0FG7YHDQ6T",
  subject_name: "web-01",
  status: "active" as const,
  interval_months: 1,
  currency: "EUR",
  current_period_start: new Date("2026-10-01T12:00:00.000Z"),
  current_period_end: PERIOD_END,
  auto_renew: true,
  payment_method: {
    id: DEFAULT_METHOD_ID,
    brand: "visa",
    last4: "4242",
  },
  mandate_accepted_at: new Date("2026-10-01T12:00:00.000Z"),
  cancelled_at: null,
  cancel_reason: null,
  created_at: new Date("2026-10-01T12:00:00.000Z"),
};

const plan = {
  name: "VPS 4",
  cores: 4,
  memory: 8192,
  storage: 160,
  netrate: 1000,
};

/** The account default. Deliberately not the one every subscription names. */
const defaultCard = {
  id: DEFAULT_METHOD_ID,
  type: "card",
  brand: "visa",
  last4: "4242",
  exp_month: 4,
  exp_year: 2030,
  invalid_at: null,
  invalid_reason: null,
};

const noop = () => {};

const renderCard = (
  props: Partial<Parameters<typeof CurrentPlanCard>[0]> = {},
) =>
  renderWithProviders(
    <IntlEnvironment>
      <CurrentPlanCard
        subscription={subscription}
        terminatesAt={PERIOD_END}
        plan={plan}
        renewalAmount={1200}
        savedPaymentMethods={[defaultCard]}
        isPaymentMethodsPending={false}
        paymentMethodState="usable"
        onAcceptMandate={noop}
        onSetAutoRenew={noop}
        isUpdatingRenewal={false}
        onRetry={noop}
        isRetrying={false}
        {...props}
      />
    </IntlEnvironment>,
  );

describe("CurrentPlanCard without a subscription", () => {
  test("it explains that renewal is not set up and offers the way in", () => {
    renderCard({ subscription: null });

    // The common case on this branch: a server provisioned before the billing
    // tables existed. It is a state, not a failure, so the card still shows
    // what the customer has rather than rendering an apology.
    const card = screen.getByTestId("current-plan-card");
    expect(card).toHaveTextContent("VPS 4");
    expect(card).toHaveTextContent("€12.00");

    const empty = screen.getByTestId("no-subscription");
    expect(empty).toBeVisible();
    expect(empty).toHaveTextContent("Automatic renewal is not set up");
    expect(empty).toHaveTextContent("nothing is charged without you");
    // The date, never an interval the customer has to work out.
    expect(empty).toHaveTextContent("keeps running until November 1, 2026");

    // And somewhere to go, on the same page.
    expect(screen.getByTestId("no-subscription-extend")).toHaveAttribute(
      "href",
      "#change-plan",
    );
  });

  test("it offers nothing that has no subscription behind it", () => {
    renderCard({ subscription: null });

    // No switch to flip: `setAutoRenew` needs a subscription id and there is
    // none. No credential either - nothing would be charged.
    expect(screen.queryByTestId("auto-renew-switch")).toBeNull();
    expect(screen.queryByTestId("renewal-payment-method")).toBeNull();
    expect(screen.queryByTestId("subscription-status")).toBeNull();

    // The term still comes from the server's own end date.
    expect(screen.getByTestId("plan-term")).toHaveTextContent(
      "Ends on November 1, 2026",
    );
  });
});

describe("CurrentPlanCard payment method", () => {
  test("it shows the credential that would actually be charged", () => {
    renderCard({
      subscription: {
        ...subscription,
        // The subscription names its own card, which is not the account
        // default. The server has already resolved which one pays.
        payment_method: {
          id: NAMED_METHOD_ID,
          brand: "mastercard",
          last4: "1111",
        },
      },
      savedPaymentMethods: [
        defaultCard,
        {
          id: NAMED_METHOD_ID,
          type: "card",
          brand: "mastercard",
          last4: "1111",
          exp_month: 9,
          exp_year: 2031,
          invalid_at: null,
          invalid_reason: null,
        },
      ],
    });

    const method = screen.getByTestId("renewal-payment-method");

    expect(method).toHaveTextContent("Mastercard •••• 1111");
    // The account default must not be what a customer reads here: they would
    // go and replace a card that pays for nothing.
    expect(method).not.toHaveTextContent("4242");
    // The expiry belongs to the card that pays, matched by id.
    expect(method).toHaveTextContent("Expires 09 / 2031");
  });

  test("a dead credential says so here, where a failing renewal is read", () => {
    renderCard({
      savedPaymentMethods: [{ ...defaultCard, exp_month: 1, exp_year: 2020 }],
    });

    expect(
      screen.getByTestId("renewal-payment-method-problem"),
    ).toHaveTextContent("Expired 01 / 2020");
  });

  test("a buried credential says so without saying which way it was buried", () => {
    renderCard({
      savedPaymentMethods: [
        {
          ...defaultCard,
          invalid_at: new Date("2026-08-01T00:00:00.000Z"),
          invalid_reason: "lost_card",
        },
      ],
      paymentMethodState: "unusable",
    });

    // The same rule the dunning mail follows, on the same row a customer reads
    // when a renewal has failed: they learn the card cannot be charged, and not
    // that it has been reported. The person holding a card is not always the
    // customer.
    expect(
      screen.getByTestId("renewal-payment-method-problem"),
    ).toHaveTextContent("Your bank refused this card.");

    const text = document.body.textContent?.toLowerCase() ?? "";
    expect(text).not.toMatch(/\blost\b/);
    expect(text).not.toMatch(/\bstolen\b/);
    expect(document.body.innerHTML).not.toContain("lost_card");
  });

  test("with nothing chosen it says so and links to where one is added", () => {
    renderCard({
      subscription: { ...subscription, payment_method: null },
      savedPaymentMethods: [],
      paymentMethodState: "missing",
    });

    expect(screen.getByTestId("renewal-payment-method")).toHaveTextContent(
      "None chosen",
    );
    expect(
      screen.getByRole("link", { name: "Add a payment method" }),
    ).toHaveAttribute("href", "/account/settings/billing");
  });
});

describe("CurrentPlanCard term and status", () => {
  test("the term is a date and says which way it goes", () => {
    renderCard();

    expect(screen.getByTestId("plan-term")).toHaveTextContent(
      "Renews automatically on November 1, 2026",
    );
  });

  test("with renewal off it says when the server stops instead", () => {
    renderCard({ subscription: { ...subscription, auto_renew: false } });

    expect(screen.getByTestId("plan-term")).toHaveTextContent(
      "Ends on November 1, 2026",
    );
  });

  test("a working subscription is not badged at anyone", () => {
    renderCard();

    // `active` is the state the rest of the card already describes. A green
    // chip beside it only makes the red one easier to miss.
    expect(screen.queryByTestId("subscription-status")).toBeNull();
  });

  test("a failed payment is badged, explained and retryable in place", async () => {
    const onRetry = mock(() => {});

    renderCard({
      subscription: { ...subscription, status: "past_due" },
      onRetry,
    });

    expect(screen.getByTestId("subscription-status")).toHaveTextContent(
      "Payment failed",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "A payment for this server failed",
    );

    await userEvent.click(screen.getByRole("button", { name: "Retry now" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
