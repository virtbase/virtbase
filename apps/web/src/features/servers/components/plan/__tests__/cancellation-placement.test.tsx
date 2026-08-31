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
let CancellationCard: typeof import("../cancellation-card").CancellationCard;
let IntlEnvironment: (props: { children: React.ReactNode }) => React.ReactNode;

beforeAll(async () => {
  const rendered = await import("@virtbase/test-utils/react");
  renderWithProviders = rendered.renderWithProviders;
  screen = rendered.screen;
  userEvent = rendered.userEvent;

  CancellationCard = (await import("../cancellation-card")).CancellationCard;

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
  current_period_start: new Date("2026-10-01T12:00:00.000Z"),
  current_period_end: new Date("2026-11-01T12:00:00.000Z"),
  auto_renew: true,
  payment_method: {
    id: "pm_1KDR24RNF2WY69G0FG7YHDQ6T",
    brand: "visa",
    last4: "4242",
  },
  mandate_accepted_at: new Date("2026-10-01T12:00:00.000Z"),
  cancelled_at: null,
  cancel_reason: null,
  created_at: new Date("2026-10-01T12:00:00.000Z"),
};

const noop = () => {};

const renderCard = () =>
  renderWithProviders(
    <IntlEnvironment>
      <CancellationCard
        subscription={subscription}
        onCancel={noop}
        onResume={noop}
        isCancelling={false}
        isResuming={false}
      />
    </IntlEnvironment>,
  );

/**
 * Everything that could hide the control between the page and the button.
 *
 * Written as selectors rather than as component names on purpose: the statute
 * is about what a customer can reach, so what matters is the markup that ends
 * up around the trigger, whichever component put it there.
 */
const DISCLOSURE_SELECTORS = [
  "details",
  "[data-slot='dropdown-menu-content']",
  "[data-slot='collapsible-content']",
  "[data-slot='accordion-content']",
  "[data-slot='popover-content']",
  "[data-slot='dialog-content']",
  "[role='dialog']",
  "[hidden]",
  "[aria-hidden='true']",
  "[data-state='closed']",
];

describe("Cancellation on the plan page (§ 312k BGB)", () => {
  test("the control has no disclosure anywhere above it", () => {
    renderCard();

    const trigger = screen.getByTestId("cancel-subscription-trigger");

    // Permanently available, directly and easily reachable: on screen on
    // first paint, enabled, and with nothing between it and the page that a
    // customer would have to open, expand or scroll a menu for.
    expect(trigger).toBeVisible();
    expect(trigger).toBeEnabled();

    for (const selector of DISCLOSURE_SELECTORS) {
      expect(trigger.closest(selector)).toBeNull();
    }
  });

  test("the quieter card it sits in is contrast, not concealment", () => {
    renderCard();

    const card = screen.getByTestId("cancellation-card");
    const trigger = screen.getByTestId("cancel-subscription-trigger");

    // The section is deliberately the quietest thing on the page. That is a
    // matter of borders and colour; it must never become a thing to open.
    expect(card).toContainElement(trigger);
    expect(card.querySelector("details")).toBeNull();
    expect(card.querySelector("summary")).toBeNull();
    expect(card.querySelector("[data-slot='collapsible']")).toBeNull();
    expect(card.querySelector("[data-slot='accordion']")).toBeNull();
  });

  test("it says the paid-for term survives before anything is clicked", () => {
    renderCard();

    // The customer has to be able to read this without opening the dialog:
    // someone who believes cancelling destroys their server today does not
    // cancel, they charge back.
    expect(screen.getByTestId("cancellation-card")).toHaveTextContent(
      "Your server keeps running until November 1, 2026",
    );
  });

  test("the trigger opens the confirmation in one press", async () => {
    renderCard();

    await userEvent.click(screen.getByTestId("cancel-subscription-trigger"));

    expect(
      screen.getByTestId("cancel-subscription-confirmation"),
    ).toBeInTheDocument();
  });
});
