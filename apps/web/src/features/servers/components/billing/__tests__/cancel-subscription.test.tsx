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

/**
 * A translator that answers with the source string.
 *
 * `useExtracted` throws under `bun test`: the runner sets `NODE_ENV=test`,
 * which resolves `use-intl` to its production build, and there the hook
 * expects messages compiled by the next-intl plugin instead of falling back to
 * the literal at the call site. Everything else in the module is kept as it
 * is - `useFormatter` is real here, and so is the `NextIntlClientProvider` the
 * render helper mounts.
 */
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
let within: Rendered["within"];
let userEvent: Rendered["userEvent"];
let CancelSubscriptionDialog: typeof import("../cancel-subscription-dialog").CancelSubscriptionDialog;
let CancelSubscriptionSection: typeof import("../cancel-subscription-section").CancelSubscriptionSection;
let IntlEnvironment: (props: { children: React.ReactNode }) => React.ReactNode;

beforeAll(async () => {
  // Imported after the mock is registered, or the components close over the
  // real `useExtracted`.
  const rendered = await import("@virtbase/test-utils/react");
  renderWithProviders = rendered.renderWithProviders;
  screen = rendered.screen;
  within = rendered.within;
  userEvent = rendered.userEvent;

  CancelSubscriptionDialog = (await import("../cancel-subscription-dialog"))
    .CancelSubscriptionDialog;
  CancelSubscriptionSection = (await import("../cancel-subscription-section"))
    .CancelSubscriptionSection;

  // Pins the time zone the dates below are formatted in. Without it `use-intl`
  // falls back to the machine's, which turns a UTC midnight into the previous
  // day west of Greenwich and makes the assertion depend on where the test
  // runs.
  const { NextIntlClientProvider } = actualNextIntl;
  IntlEnvironment = ({ children }) => (
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={{}}>
      {children}
    </NextIntlClientProvider>
  );
});

const PERIOD_END = new Date("2026-11-01T00:00:00.000Z");

const subscription = {
  id: "sub_1KDR24RNF2WY69G0FG7YHDQ6T",
  subject_type: "server",
  subject_id: "kvm_1KDR24RNF2WY69G0FG7YHDQ6T",
  subject_name: "web-01",
  status: "active" as const,
  interval_months: 1,
  currency: "EUR",
  current_period_start: new Date("2026-10-01T00:00:00.000Z"),
  current_period_end: PERIOD_END,
  auto_renew: true,
  payment_method: {
    id: "pm_1KDR24RNF2WY69G0FG7YHDQ6T",
    brand: "visa",
    last4: "4242",
  },
  mandate_accepted_at: new Date("2026-10-01T00:00:00.000Z"),
  cancelled_at: null,
  cancel_reason: null,
  created_at: new Date("2026-10-01T00:00:00.000Z"),
};

const noop = () => {};

/**
 * The words that must never appear on the cancellation confirmation.
 *
 * § 312k BGB, as sharpened by the Bundesgerichtshof in July 2026: the
 * confirmation page has to contain the cancellation and nothing else, and an
 * alternative offer placed there is itself the violation. This list is the
 * vocabulary such an offer arrives in - a discount, a pause, a plea, a survey
 * - so a well-meant retention change to that dialog trips these assertions
 * before it reaches a customer.
 */
const RETENTION_VOCABULARY = [
  "discount",
  "offer",
  "instead",
  "pause",
  "downgrade",
  "cheaper",
  "free month",
  "special",
  "reconsider",
  "are you sure",
  "why",
  "reason",
  "feedback",
  "survey",
  "stay",
  "miss",
  "lose",
  "talk to",
  "contact support",
  "chat",
];

describe("CancelSubscriptionDialog (§ 312k BGB)", () => {
  test("it says what ends and when, and offers a way to end it", () => {
    renderWithProviders(
      <IntlEnvironment>
        <CancelSubscriptionDialog
          open
          onOpenChange={noop}
          subjectName="web-01"
          periodEnd={PERIOD_END}
          onConfirm={noop}
          isPending={false}
        />
      </IntlEnvironment>,
    );

    const body = screen.getByTestId("cancel-subscription-confirmation");

    expect(body).toHaveTextContent("The subscription for web-01");
    // The paid-for term is untouched, and the customer has to be able to see
    // that. Someone who believes cancelling destroys their server today does
    // not cancel - they charge back.
    expect(body).toHaveTextContent("keeps running until November 1, 2026");
    expect(body).toHaveTextContent("Nothing is switched off today");
    expect(body).toHaveTextContent("you will not be charged again");
    expect(screen.getByTestId("confirm-cancel-subscription")).toBeEnabled();
  });

  test("it contains no retention offer, no survey and no upsell", () => {
    renderWithProviders(
      <IntlEnvironment>
        <CancelSubscriptionDialog
          open
          onOpenChange={noop}
          subjectName="web-01"
          periodEnd={PERIOD_END}
          onConfirm={noop}
          isPending={false}
        />
      </IntlEnvironment>,
    );

    // Asserting on absence, deliberately. This is the § 312k guard: it exists
    // to fail the day somebody adds "keep 20% off" or "tell us why you are
    // leaving" to the confirmation, which the Bundesgerichtshof held in July
    // 2026 is itself the violation.
    //
    // Scoped to the dialog, and matched on whole words: everything inside it
    // is content the customer reads on the confirmation, and "close" must not
    // be allowed to count as "lose".
    const dialog = screen.getByRole("dialog");
    const text = dialog.textContent?.toLowerCase() ?? "";

    for (const word of RETENTION_VOCABULARY) {
      expect(text).not.toMatch(new RegExp(`\\b${word}\\b`));
    }

    // No way to type a reason, and no way to pick one. `subscriptions.cancel`
    // accepts an optional reason and this dialog deliberately never sends one:
    // asking why must never stand between a customer and the button.
    expect(dialog.querySelector("textarea")).toBeNull();
    expect(dialog.querySelector("select")).toBeNull();
    expect(dialog.querySelector("input")).toBeNull();

    // Three controls and no more: the dialog's own close affordance, a
    // dismissal, and the cancellation. A fourth is an offer.
    expect(
      within(dialog)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Go back", "Cancel subscription now", "Close"]);
  });

  test("for a server already switched off it says that, and still nothing else", () => {
    renderWithProviders(
      <IntlEnvironment>
        <CancelSubscriptionDialog
          open
          onOpenChange={noop}
          subjectName="web-01"
          periodEnd={PERIOD_END}
          alreadyStopped
          onConfirm={noop}
          isPending={false}
        />
      </IntlEnvironment>,
    );

    const body = screen.getByTestId("cancel-subscription-confirmation");

    // The live wording is a promise about a running machine, and a suspended
    // server is not one. Saying "nothing is switched off today" to someone
    // whose server went off last week is not a gentler sentence, it is a
    // false one.
    expect(body).toHaveTextContent("The subscription for web-01");
    expect(body).toHaveTextContent(
      "This server is suspended and was switched off when the term ended on November 1, 2026",
    );
    expect(body).toHaveTextContent("You will not be charged again");
    expect(body).not.toHaveTextContent("Nothing is switched off today");
    expect(body).not.toHaveTextContent("keeps running until");

    // And § 312k is untouched by the variant: the same three controls, no
    // retention vocabulary, nothing to type or pick.
    const dialog = screen.getByRole("dialog");
    const text = dialog.textContent?.toLowerCase() ?? "";

    for (const word of RETENTION_VOCABULARY) {
      expect(text).not.toMatch(new RegExp(`\\b${word}\\b`));
    }

    expect(dialog.querySelector("textarea")).toBeNull();
    expect(dialog.querySelector("select")).toBeNull();
    expect(dialog.querySelector("input")).toBeNull();
    expect(
      within(dialog)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Go back", "Cancel subscription now", "Close"]);
    expect(screen.getByTestId("confirm-cancel-subscription")).toBeEnabled();
  });

  test("the dismissal is a dismissal, not a plea to stay", () => {
    renderWithProviders(
      <IntlEnvironment>
        <CancelSubscriptionDialog
          open
          onOpenChange={noop}
          subjectName={null}
          periodEnd={PERIOD_END}
          onConfirm={noop}
          isPending={false}
        />
      </IntlEnvironment>,
    );

    expect(screen.getByTestId("cancel-subscription-dismiss")).toHaveTextContent(
      "Go back",
    );
  });

  test("confirming cancels in one call", async () => {
    const onConfirm = mock(() => {});

    renderWithProviders(
      <IntlEnvironment>
        <CancelSubscriptionDialog
          open
          onOpenChange={noop}
          subjectName="web-01"
          periodEnd={PERIOD_END}
          onConfirm={onConfirm}
          isPending={false}
        />
      </IntlEnvironment>,
    );

    await userEvent.click(screen.getByTestId("confirm-cancel-subscription"));

    // One click, one call. No second confirmation, no step-up, no survey in
    // between.
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

/**
 * The control itself. Where it ends up on a page is the other half of the
 * rule, and is asserted in
 * `features/servers/components/plan/__tests__/cancellation-placement.test.tsx`
 * against the card the plan page actually renders it in.
 */
describe("CancelSubscriptionSection (§ 312k BGB)", () => {
  test("the control is rendered inline, not behind anything", async () => {
    renderWithProviders(
      <IntlEnvironment>
        <CancelSubscriptionSection
          subscription={subscription}
          onCancel={noop}
          onResume={noop}
          isCancelling={false}
          isResuming={false}
        />
      </IntlEnvironment>,
    );

    const trigger = screen.getByTestId("cancel-subscription-trigger");

    // Permanently visible and directly reachable: on the page, enabled, and
    // labelled with what it does. Not inside a `<details>`, a dropdown or a
    // disclosure the customer has to find first.
    expect(trigger).toBeVisible();
    expect(trigger).toBeEnabled();
    expect(trigger).toHaveTextContent("Cancel subscription");
    expect(trigger.closest("details")).toBeNull();
    expect(trigger.closest("[data-slot='dropdown-menu-content']")).toBeNull();
    expect(trigger.closest("[data-slot='collapsible-content']")).toBeNull();

    // And it opens the confirmation directly.
    await userEvent.click(trigger);
    expect(
      screen.getByTestId("cancel-subscription-confirmation"),
    ).toBeInTheDocument();
  });

  test("it says the paid-for term survives before the dialog is even opened", () => {
    renderWithProviders(
      <IntlEnvironment>
        <CancelSubscriptionSection
          subscription={subscription}
          onCancel={noop}
          onResume={noop}
          isCancelling={false}
          isResuming={false}
        />
      </IntlEnvironment>,
    );

    expect(screen.getByTestId("cancel-subscription-section")).toHaveTextContent(
      "Your server keeps running until November 1, 2026",
    );
  });

  test("a cancelled subscription inside its term offers a resume instead", async () => {
    const onResume = mock(() => {});

    renderWithProviders(
      <IntlEnvironment>
        <CancelSubscriptionSection
          subscription={{
            ...subscription,
            status: "cancelled",
            auto_renew: false,
            cancelled_at: new Date(),
            cancel_reason: "customer",
            // Well inside the paid-for term, which is the only window in which
            // `resume` does anything.
            current_period_end: new Date(Date.now() + 30 * 24 * 3600 * 1000),
          }}
          onCancel={noop}
          onResume={onResume}
          isCancelling={false}
          isResuming={false}
        />
      </IntlEnvironment>,
    );

    // There is nothing left to cancel, so the § 312k button is gone rather
    // than sitting next to a "no, stay!" - which is what it would be if both
    // were shown at once.
    expect(screen.queryByTestId("cancel-subscription-trigger")).toBeNull();

    await userEvent.click(screen.getByTestId("resume-subscription"));
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  test("a suspended subscription keeps the button but does not claim the server keeps running", async () => {
    renderWithProviders(
      <IntlEnvironment>
        <CancelSubscriptionSection
          subscription={{
            ...subscription,
            status: "suspended",
            auto_renew: false,
            // The term ran out; the suspension sweep powered the machine off
            // and the deletion grace period is running.
            current_period_end: new Date("2026-02-01T00:00:00.000Z"),
          }}
          onCancel={noop}
          onResume={noop}
          isCancelling={false}
          isResuming={false}
        />
      </IntlEnvironment>,
    );

    const section = screen.getByTestId("cancel-subscription-section");

    // The contract is still live and `subscriptions.cancel` still does
    // something with it - `auto_renew: false` - so § 312k keeps its control.
    const trigger = screen.getByTestId("cancel-subscription-trigger");
    expect(trigger).toBeVisible();
    expect(trigger).toBeEnabled();
    expect(trigger).toHaveTextContent("Cancel subscription");

    // What it must not do is repeat the live sentence over a machine that has
    // been off since February.
    expect(section).not.toHaveTextContent("Your server keeps running until");
    expect(section).toHaveTextContent(
      "This server is suspended and the term you paid for ended on February 1, 2026",
    );
    expect(section).toHaveTextContent("it does not switch the server back on");

    // And the confirmation behind it says the same true thing.
    await userEvent.click(trigger);
    expect(
      screen.getByTestId("cancel-subscription-confirmation"),
    ).toHaveTextContent("This server is suspended and was switched off");
  });

  test("an ended subscription offers no cancellation, because there is nothing to cancel", () => {
    renderWithProviders(
      <IntlEnvironment>
        <CancelSubscriptionSection
          subscription={{
            ...subscription,
            status: "ended",
            auto_renew: false,
            current_period_end: new Date("2026-02-01T00:00:00.000Z"),
          }}
          onCancel={noop}
          onResume={noop}
          isCancelling={false}
          isResuming={false}
        />
      </IntlEnvironment>,
    );

    // `delete-suspended-servers` ends the subscription before it queues the
    // deletion, so this is what the plan page shows while that runs - and
    // indefinitely if it fails on an unreachable node. `subscriptions.cancel`
    // refuses an ended subscription outright, so the button that used to be
    // here could only ever produce "This subscription has already ended."
    expect(screen.queryByTestId("cancel-subscription-trigger")).toBeNull();
    // Nor is it a resume: resuming is only ever offered after the customer
    // cancelled, and only inside the term they paid for.
    expect(screen.queryByTestId("resume-subscription")).toBeNull();

    const section = screen.getByTestId("cancel-subscription-section");
    expect(section).not.toHaveTextContent("Your server keeps running until");
    expect(section).toHaveTextContent("Subscription ended");
    expect(section).toHaveTextContent(
      "The paid-for term ended on February 1, 2026",
    );
    expect(section).toHaveTextContent("There is nothing left to cancel");
  });

  test("a term that has already run out offers nothing to resume", () => {
    renderWithProviders(
      <IntlEnvironment>
        <CancelSubscriptionSection
          subscription={{
            ...subscription,
            status: "cancelled",
            auto_renew: false,
            current_period_end: new Date(Date.now() - 1000),
          }}
          onCancel={noop}
          onResume={noop}
          isCancelling={false}
          isResuming={false}
        />
      </IntlEnvironment>,
    );

    // After the period end, reviving the row would sell a new term with no
    // price, order or invoice behind it - that is a purchase, and belongs to
    // checkout.
    expect(screen.queryByTestId("resume-subscription")).toBeNull();
  });
});
