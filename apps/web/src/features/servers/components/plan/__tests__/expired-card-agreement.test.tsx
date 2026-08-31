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

/**
 * The clock, pinned for both screens at once.
 *
 * `useNow` is what the billing page's list reads a printed expiry against, and
 * the plan page passes the same value into `resolvePaymentMethodState`. Freezing
 * it here is what makes "they agree" an assertion about the rule rather than
 * about how long the test took to run.
 */
const NOW = new Date("2026-06-15T12:00:00.000Z");

mock.module("next-intl", () => ({
  ...actualNextIntl,
  useExtracted: () => translate,
  useNow: () => NOW,
}));

type Rendered = typeof import("@virtbase/test-utils/react");

let renderWithProviders: Rendered["renderWithProviders"];
let screen: Rendered["screen"];
let userEvent: Rendered["userEvent"];
let PaymentMethodItem: typeof import("@/features/account/components/billing/payment-method-item").PaymentMethodItem;
let CurrentPlanCard: typeof import("../current-plan-card").CurrentPlanCard;
let resolvePaymentMethodState: typeof import("@/features/account/utils/payment-method").resolvePaymentMethodState;
let resolvePaymentMethodHealth: typeof import("@/features/account/utils/payment-method").resolvePaymentMethodHealth;
let IntlEnvironment: (props: { children: React.ReactNode }) => React.ReactNode;

beforeAll(async () => {
  const rendered = await import("@virtbase/test-utils/react");
  renderWithProviders = rendered.renderWithProviders;
  screen = rendered.screen;
  userEvent = rendered.userEvent;

  PaymentMethodItem = (
    await import("@/features/account/components/billing/payment-method-item")
  ).PaymentMethodItem;
  CurrentPlanCard = (await import("../current-plan-card")).CurrentPlanCard;

  const utils = await import("@/features/account/utils/payment-method");
  resolvePaymentMethodState = utils.resolvePaymentMethodState;
  resolvePaymentMethodHealth = utils.resolvePaymentMethodHealth;

  const { NextIntlClientProvider } = actualNextIntl;
  IntlEnvironment = ({ children }) => (
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={{}}>
      {children}
    </NextIntlClientProvider>
  );
});

const METHOD_ID = "pm_1KDR24RNF2WY69G0FG7YHDQ6T";

/**
 * A card that ran out on its own, and was never declined.
 *
 * `invalid_at` is null - nothing has failed yet, because nothing has been
 * collected since December. This is the exact row the two screens used to
 * disagree about: the plan page consulted `invalid_at` alone and called it
 * usable, while the billing page consulted the printed date and called it
 * expired in a destructive alert.
 */
const expiredCard = {
  id: METHOD_ID,
  type: "card",
  brand: "visa",
  last4: "4242",
  exp_month: 12,
  exp_year: 2025,
  invalid_at: null as Date | null,
  invalid_reason: null as string | null,
};

const subscription = {
  id: "sub_1KDR24RNF2WY69G0FG7YHDQ6T",
  subject_type: "server",
  subject_id: "kvm_1KDR24RNF2WY69G0FG7YHDQ6T",
  subject_name: "web-01",
  status: "active" as const,
  interval_months: 1,
  currency: "EUR",
  current_period_start: new Date("2026-06-01T12:00:00.000Z"),
  current_period_end: new Date("2026-07-01T12:00:00.000Z"),
  auto_renew: false,
  payment_method: { id: METHOD_ID, brand: "visa", last4: "4242" },
  mandate_accepted_at: new Date("2026-06-01T12:00:00.000Z"),
  cancelled_at: null,
  cancel_reason: null,
  created_at: new Date("2026-06-01T12:00:00.000Z"),
};

const plan = {
  name: "VPS 4",
  cores: 4,
  memory: 8192,
  storage: 160,
  netrate: 1000,
};

const noop = () => {};

describe("An expired card, read by both screens (one rule)", () => {
  test("the billing page calls it expired and stops offering it for renewals", () => {
    renderWithProviders(
      <IntlEnvironment>
        <PaymentMethodItem
          paymentMethod={{ ...expiredCard, is_default: false }}
          onSetDefault={noop}
          onRemove={noop}
        />
      </IntlEnvironment>,
    );

    expect(screen.getByTestId("payment-method-problem")).toHaveTextContent(
      "Expired — replace it to keep automatic renewal",
    );
    // Pointing renewals at it is not offered, so the plan page must not do the
    // equivalent by enrolling on it.
    expect(screen.queryByTestId("payment-method-set-default")).toBeNull();
  });

  test("the plan page refuses to enrol on the same card", async () => {
    const onSetAutoRenew = mock((_enabled: boolean) => {});

    const paymentMethodState = resolvePaymentMethodState({
      isPending: false,
      saved: [expiredCard],
      chargeable: subscription.payment_method,
      now: NOW,
    });

    // The plan page's answer is the billing page's rule, called once.
    expect(resolvePaymentMethodHealth(expiredCard, NOW)).toBe("expired");
    expect(paymentMethodState).toBe("unusable");

    renderWithProviders(
      <IntlEnvironment>
        <CurrentPlanCard
          subscription={subscription}
          terminatesAt={subscription.current_period_end}
          plan={plan}
          renewalAmount={1200}
          savedPaymentMethods={[expiredCard]}
          isPaymentMethodsPending={false}
          paymentMethodState={paymentMethodState}
          onAcceptMandate={noop}
          onSetAutoRenew={onSetAutoRenew}
          isUpdatingRenewal={false}
          onRetry={noop}
          isRetrying={false}
        />
      </IntlEnvironment>,
    );

    // The row that names what pays says the same thing the billing page does.
    expect(
      screen.getByTestId("renewal-payment-method-problem"),
    ).toHaveTextContent("Expired 12 / 2025");

    await userEvent.click(screen.getByTestId("auto-renew-switch"));

    // And the switch does not quietly enrol the customer on it. Before this,
    // `setAutoRenew` was called and accepted, and the first collection of the
    // new term declined.
    expect(screen.getByTestId("auto-renew-blocked")).toHaveTextContent(
      "The payment method we would charge cannot be used.",
    );
    expect(onSetAutoRenew).not.toHaveBeenCalled();
  });
});
