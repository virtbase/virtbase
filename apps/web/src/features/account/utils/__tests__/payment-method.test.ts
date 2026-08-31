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
import { declineReasonKey } from "@virtbase/email/templates/decline-reason";
import {
  classifyInvalidReason,
  formatExpiry,
  hasExpired,
  resolveBrandName,
  resolvePaymentMethodHealth,
  resolvePaymentMethodState,
} from "../payment-method";

const card = {
  type: "card",
  brand: "visa",
  last4: "4242",
  exp_month: 4,
  exp_year: 2030,
  invalid_at: null,
  invalid_reason: null,
};

const JANUARY_2027 = new Date("2027-01-15T12:00:00.000Z");

describe("hasExpired", () => {
  test("a card is good through the last day of its expiry month", () => {
    // December 2026 is over; January 2027 is the month we are in.
    expect(hasExpired({ exp_month: 12, exp_year: 2026 }, JANUARY_2027)).toBe(
      true,
    );
    expect(hasExpired({ exp_month: 1, exp_year: 2027 }, JANUARY_2027)).toBe(
      false,
    );
  });

  test("an instrument with no expiry has not expired", () => {
    // A SEPA mandate carries no date. "We were told nothing" must never read
    // as "expired".
    expect(hasExpired({ exp_month: null, exp_year: null }, JANUARY_2027)).toBe(
      false,
    );
  });

  test("the month is read in UTC, not in the reader's own time zone", () => {
    // 12:30 on 1 January in UTC+13, which is 23:30 on 31 December everywhere
    // the renewal collector looks. A card expiring in December is still good
    // for another eleven and a half hours, and the customer must not be
    // refused it - `period.ts`, `claimRenewal` and `acceptMandate` all decide
    // in UTC, and a local month here is thirteen hours of disagreement.
    const newYearInAuckland = new Date("2026-12-31T23:30:00.000Z");

    expect(
      hasExpired({ exp_month: 12, exp_year: 2026 }, newYearInAuckland),
    ).toBe(false);

    // And an hour later, when UTC agrees, it is over.
    expect(
      hasExpired(
        { exp_month: 12, exp_year: 2026 },
        new Date("2027-01-01T00:30:00.000Z"),
      ),
    ).toBe(true);
  });
});

describe("resolvePaymentMethodHealth", () => {
  test("a live card with a future date is usable", () => {
    expect(resolvePaymentMethodHealth(card, JANUARY_2027)).toBe("usable");
  });

  test("the printed date alone is enough to call a card expired", () => {
    // Nothing has to decline first: a customer opening this page in January
    // is told the card that ran out in December is dead.
    expect(
      resolvePaymentMethodHealth(
        { ...card, exp_month: 12, exp_year: 2026 },
        JANUARY_2027,
      ),
    ).toBe("expired");
  });

  test("a provider that says the card expired is treated the same way", () => {
    expect(
      resolvePaymentMethodHealth(
        { ...card, invalid_at: new Date(), invalid_reason: "expired_card" },
        JANUARY_2027,
      ),
    ).toBe("expired");
  });

  test("any other dead credential is unusable rather than expired", () => {
    // A stolen card can have a perfectly good printed date, and the wording it
    // needs is not "get a new one from the same bank".
    expect(
      resolvePaymentMethodHealth(
        { ...card, invalid_at: new Date(), invalid_reason: "stolen_card" },
        JANUARY_2027,
      ),
    ).toBe("unusable");
  });
});

describe("resolvePaymentMethodState", () => {
  const saved = { ...card, id: "pm_1" };
  const chargeable = { id: "pm_1" };

  test("the credential the subscription names, when it would go through", () => {
    expect(
      resolvePaymentMethodState({
        isPending: false,
        saved: [saved],
        chargeable,
        now: JANUARY_2027,
      }),
    ).toBe("usable");
  });

  test("a card whose printed date has run out is not usable here either", () => {
    // The defect this replaced read `invalid_at` alone, so a card that had
    // simply run out was `usable` on the plan page while the billing page
    // called it expired in a destructive alert - and the switch enrolled the
    // customer on a credential the first collection would decline.
    const expired = { ...saved, exp_month: 12, exp_year: 2026 };

    expect(resolvePaymentMethodHealth(expired, JANUARY_2027)).toBe("expired");
    expect(
      resolvePaymentMethodState({
        isPending: false,
        saved: [expired],
        chargeable,
        now: JANUARY_2027,
      }),
    ).toBe("unusable");
  });

  test("nothing on file and nothing chargeable are different answers", () => {
    expect(
      resolvePaymentMethodState({
        isPending: false,
        saved: [],
        chargeable: null,
        now: JANUARY_2027,
      }),
    ).toBe("missing");

    // Cards on file, but the subscription names none of them: the same page
    // fixes it, and a different sentence describes it.
    expect(
      resolvePaymentMethodState({
        isPending: false,
        saved: [saved],
        chargeable: null,
        now: JANUARY_2027,
      }),
    ).toBe("unusable");
  });

  test("an unanswered query is loading, and never missing", () => {
    expect(
      resolvePaymentMethodState({
        isPending: true,
        saved: undefined,
        chargeable,
        now: JANUARY_2027,
      }),
    ).toBe("loading");
  });
});

describe("classifyInvalidReason", () => {
  test("it answers in the dunning mail's own vocabulary", () => {
    expect(classifyInvalidReason("expired_card")).toBe("expiredCard");
    expect(classifyInvalidReason("revocation_of_all_authorizations")).toBe(
      "cardUnusable",
    );
    expect(classifyInvalidReason("revocation_of_authorization")).toBe(
      "cardUnusable",
    );
  });

  test("a card reported lost or stolen is classified as a plain bank decline", () => {
    // The parity that matters, and the one this file used to break.
    // `packages/email/src/templates/decline-reason.ts` maps all three of these
    // to `declinedByBank` on purpose: the issuer's guidance is not to tell the
    // person holding the card that it has been reported, because the person
    // holding it is not always the customer. A screen that classified them
    // apart is a screen that says what the mail refuses to.
    for (const code of ["lost_card", "stolen_card", "pickup_card"]) {
      expect(classifyInvalidReason(code)).toBe("declinedByBank");
    }

    // And they are the same value an ordinary refusal gets, so nothing
    // downstream can tell them apart even if it tries.
    for (const code of [
      "card_not_supported",
      "invalid_account",
      "invalid_card_type",
      "restricted_card",
    ]) {
      expect(classifyInvalidReason(code)).toBe("declinedByBank");
    }
  });

  test("anything else lands on unknown", () => {
    // `invalid_reason` is stored unclassified, so a code we have never seen -
    // or free text - must not be able to reach a screen through here.
    //
    // `do_not_honor` used to be asserted here and is not any more: it is a
    // code the dunning mail does recognise, and this screen only answered
    // `unknown` for it because it carried a narrower copy of the mail's table.
    // Since the copy became an import, a code the mail can name is named.
    expect(classifyInvalidReason("frobnicated_by_the_bank")).toBe("unknown");
    expect(classifyInvalidReason("")).toBe("unknown");
    expect(classifyInvalidReason(null)).toBe("unknown");
  });

  test("it says the same thing as the email for every code it knows", () => {
    // The parity that used to need a hand-maintained mirror plus this test to
    // hold it together. Now it is an import, so this asserts the import rather
    // than a duplicate - and would fail loudly if anyone reintroduced a local
    // table.
    for (const code of [
      "lost_card",
      "stolen_card",
      "pickup_card",
      "expired_card",
      "revocation_of_authorization",
      "do_not_honor",
      "frobnicated_by_the_bank",
    ]) {
      expect(classifyInvalidReason(code)).toBe(declineReasonKey(code));
    }
  });
});

describe("resolveBrandName", () => {
  test("it names the networks we know", () => {
    expect(resolveBrandName("visa")).toBe("Visa");
    expect(resolveBrandName("AMEX")).toBe("American Express");
  });

  test("an unknown brand is not echoed back", () => {
    expect(resolveBrandName("<script>alert(1)</script>")).toBeNull();
    expect(resolveBrandName(null)).toBeNull();
  });
});

describe("formatExpiry", () => {
  test("it pads the month, because the card does", () => {
    expect(formatExpiry({ exp_month: 4, exp_year: 2030 })).toBe("04 / 2030");
  });

  test("an instrument with no expiry formats to nothing", () => {
    expect(formatExpiry({ exp_month: null, exp_year: 2030 })).toBeNull();
  });
});
