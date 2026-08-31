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
 * is - `useNow` and `useFormatter` are real here, and so is the
 * `NextIntlClientProvider` the render helper mounts.
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
let userEvent: Rendered["userEvent"];
let PaymentMethodItem: typeof import("../payment-method-item").PaymentMethodItem;
let RemovePaymentMethodDialog: typeof import("../remove-payment-method-dialog").RemovePaymentMethodDialog;
let IntlEnvironment: (props: { children: React.ReactNode }) => React.ReactNode;

beforeAll(async () => {
  // Imported after the mock is registered, or the components close over the
  // real `useExtracted`.
  const rendered = await import("@virtbase/test-utils/react");
  renderWithProviders = rendered.renderWithProviders;
  screen = rendered.screen;
  userEvent = rendered.userEvent;

  PaymentMethodItem = (await import("../payment-method-item"))
    .PaymentMethodItem;
  RemovePaymentMethodDialog = (await import("../remove-payment-method-dialog"))
    .RemovePaymentMethodDialog;

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

/** The id is our own row id, not a provider token - and it still never renders. */
const PAYMENT_METHOD_ID = "pm_1KDR24RNF2WY69G0FG7YHDQ6T";

const card = {
  id: PAYMENT_METHOD_ID,
  type: "card",
  brand: "visa",
  last4: "4242",
  exp_month: 4,
  exp_year: 2099,
  is_default: true,
  invalid_at: null as Date | null,
  invalid_reason: null as string | null,
};

const noop = () => {};

describe("PaymentMethodItem", () => {
  test("it shows the brand, the last four digits and the default marker", () => {
    renderWithProviders(
      <PaymentMethodItem
        paymentMethod={card}
        onSetDefault={noop}
        onRemove={noop}
      />,
    );

    expect(screen.getByTestId("payment-method-item")).toHaveTextContent(
      "Visa •••• 4242",
    );
    expect(screen.getByTestId("payment-method-default")).toHaveTextContent(
      "Default",
    );
    expect(screen.getByTestId("payment-method-item")).toHaveTextContent(
      "Expires 04 / 2099",
    );
  });

  test("it never puts an identifier on the page", () => {
    renderWithProviders(
      <PaymentMethodItem
        paymentMethod={card}
        onSetDefault={noop}
        onRemove={noop}
      />,
    );

    // Not in the text, not in an attribute, not in a `data-` hook, and not in
    // a URL - there is no route that takes one. The API returns no `provider`
    // and no `external_id` at all, so the row id is the only identifier that
    // even reaches this component, and it stays a React key.
    expect(document.body.innerHTML).not.toContain(PAYMENT_METHOD_ID);
    expect(document.body.innerHTML).not.toContain("pm_");
  });

  test("an expired card reads as work to do, not as a badge", () => {
    renderWithProviders(
      <PaymentMethodItem
        paymentMethod={{ ...card, exp_month: 1, exp_year: 2020 }}
        onSetDefault={noop}
        onRemove={noop}
      />,
    );

    const problem = screen.getByTestId("payment-method-problem");

    expect(problem).toHaveTextContent(
      "Expired — replace it to keep automatic renewal",
    );
    expect(problem).toHaveTextContent("This card expired in 01 / 2020.");
    expect(problem).toHaveTextContent(
      "Add a new one, choose it for renewals, and then remove this one.",
    );
    // Announced rather than sitting silently beside the number.
    expect(problem).toHaveAttribute("role", "alert");
  });

  test("a dead card is not offered as a target for renewals", () => {
    renderWithProviders(
      <PaymentMethodItem
        paymentMethod={{
          ...card,
          is_default: false,
          exp_month: 1,
          exp_year: 2020,
        }}
        onSetDefault={noop}
        onRemove={noop}
      />,
    );

    // Pointing renewals at a card the issuer has buried is a setting that
    // reads as done and fails at the next collection.
    expect(screen.queryByTestId("payment-method-set-default")).toBeNull();
    expect(screen.getByTestId("payment-method-remove")).toBeInTheDocument();
  });

  test("a card reported lost is never described as lost or stolen", () => {
    renderWithProviders(
      <PaymentMethodItem
        paymentMethod={{
          ...card,
          invalid_at: new Date("2026-08-01T00:00:00.000Z"),
          invalid_reason: "lost_card",
        }}
        onSetDefault={noop}
        onRemove={noop}
      />,
    );

    const problem = screen.getByTestId("payment-method-problem");

    // `packages/email/src/templates/decline-reason.ts` maps `lost_card`,
    // `stolen_card` and `pickup_card` to the neutral "declined by your bank"
    // sentence, and says why in its own comment: the issuer's guidance is not
    // to tell the person holding the card that it has been reported, because
    // the person holding it is not always the customer. A session is a weaker
    // proof of who is reading than the address the mail goes to, so the page
    // may not say more than the mail does.
    const text = document.body.textContent?.toLowerCase() ?? "";
    expect(text).not.toMatch(/\blost\b/);
    expect(text).not.toMatch(/\bstolen\b/);
    expect(text).not.toMatch(/\breported\b/);
    expect(document.body.innerHTML).not.toContain("lost_card");

    // And the customer still learns the two things they can act on: it cannot
    // be charged, and what to do instead.
    expect(problem).toHaveTextContent(
      "Refused — replace it to keep automatic renewal",
    );
    expect(problem).toHaveTextContent(
      "Your bank refused the last renewal and told us not to try again.",
    );
    expect(problem).toHaveTextContent(
      "Add another card and choose it for renewals.",
    );
  });

  test("a reported card reads exactly like an ordinary refusal", () => {
    const wording = (invalidReason: string) => {
      const { unmount } = renderWithProviders(
        <PaymentMethodItem
          paymentMethod={{
            ...card,
            invalid_at: new Date("2026-08-01T00:00:00.000Z"),
            invalid_reason: invalidReason,
          }}
          onSetDefault={noop}
          onRemove={noop}
        />,
      );

      const text =
        screen.getByTestId("payment-method-problem").textContent ?? "";
      unmount();

      return text;
    };

    // Not merely "does not say lost": indistinguishable. A customer who could
    // tell the two apart by reading the page has been told which one it is.
    expect(wording("lost_card")).toBe(wording("restricted_card"));
    expect(wording("stolen_card")).toBe(wording("restricted_card"));
    expect(wording("pickup_card")).toBe(wording("restricted_card"));
  });

  test("it classifies the provider's decline code instead of printing it", () => {
    renderWithProviders(
      <PaymentMethodItem
        paymentMethod={{
          ...card,
          invalid_at: new Date("2026-08-01T00:00:00.000Z"),
          invalid_reason: "revocation_of_all_authorizations",
        }}
        onSetDefault={noop}
        onRemove={noop}
      />,
    );

    expect(screen.getByTestId("payment-method-problem")).toHaveTextContent(
      "Stopped by your bank — replace it to keep automatic renewal",
    );
    expect(document.body.innerHTML).not.toContain(
      "revocation_of_all_authorizations",
    );
  });
});

describe("RemovePaymentMethodDialog", () => {
  const subscription = {
    id: "sub_1KDR24RNF2WY69G0FG7YHDQ6T",
    name: "web-01",
    endsAt: new Date("2026-11-01T00:00:00.000Z"),
  };

  test("removing the last card on an auto-renewing subscription warns and still allows it", async () => {
    const onConfirm = mock(() => {});

    renderWithProviders(
      <IntlEnvironment>
        <RemovePaymentMethodDialog
          open
          onOpenChange={noop}
          onConfirm={onConfirm}
          isPending={false}
          isLastPaymentMethod
          hasSurvivingDefault={false}
          affectedSubscriptions={[subscription]}
        />
      </IntlEnvironment>,
    );

    const warning = screen.getByTestId("remove-payment-method-warning");

    expect(warning).toHaveTextContent("Automatic renewal will stop");
    expect(warning).toHaveTextContent("This is the only card on your account");
    expect(warning).toHaveTextContent("Nothing is switched off today");
    expect(warning).toHaveTextContent("November 1, 2026");
    expect(warning).toHaveTextContent("You can still remove it.");

    // Warned, never blocked. Refusing to let a customer take their card off
    // our systems would be a dark pattern, and in Germany an avoidable
    // argument about a withdrawal that is supposed to be easy.
    const confirm = screen.getByTestId("confirm-remove-payment-method");
    expect(confirm).toBeEnabled();

    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  test("it says renewals move on when another default survives", () => {
    renderWithProviders(
      <IntlEnvironment>
        <RemovePaymentMethodDialog
          open
          onOpenChange={noop}
          onConfirm={noop}
          isPending={false}
          isLastPaymentMethod={false}
          hasSurvivingDefault
          affectedSubscriptions={[subscription]}
        />
      </IntlEnvironment>,
    );

    expect(screen.queryByTestId("remove-payment-method-warning")).toBeNull();
    expect(
      screen.getByTestId("remove-payment-method-notice"),
    ).toHaveTextContent(
      "They will be charged to the card you have chosen for renewals instead.",
    );
  });

  test("with nothing renewing it only says what removal does", () => {
    renderWithProviders(
      <IntlEnvironment>
        <RemovePaymentMethodDialog
          open
          onOpenChange={noop}
          onConfirm={noop}
          isPending={false}
          isLastPaymentMethod
          hasSurvivingDefault={false}
          affectedSubscriptions={[]}
        />
      </IntlEnvironment>,
    );

    expect(screen.queryByTestId("remove-payment-method-warning")).toBeNull();
    expect(screen.queryByTestId("remove-payment-method-notice")).toBeNull();
    expect(screen.getByTestId("confirm-remove-payment-method")).toBeEnabled();
  });
});
