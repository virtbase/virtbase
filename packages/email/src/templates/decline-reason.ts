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

/**
 * A provider's decline code, said in words a customer can act on.
 *
 * The mapping lives beside the wording rather than in `@virtbase/api`,
 * because it *is* wording: the only thing it decides is which sentence the
 * dunning mail prints, and a caller that had to pick the sentence would be a
 * second place to keep the list in step with the messages file.
 *
 * Codes are stored raw (`subscription_renewals.failure_code`,
 * `payment_methods.invalid_reason`), so this is deliberately a lookup with a
 * fallback and never an exhaustive `Record`: every provider has codes we have
 * not seen, and a new one must produce an honest sentence rather than a crash
 * or a blank paragraph.
 */

/** The sub-key under the `payment-decline-reason` namespace. */
export type DeclineReasonKey =
  | "expiredCard"
  | "insufficientFunds"
  | "cardDetails"
  | "noPaymentMethod"
  | "cardUnusable"
  | "authenticationExpired"
  | "temporary"
  | "declinedByBank"
  | "unknown";

/**
 * Every code that resolves to something more specific than "your bank said
 * no".
 *
 * **Lost, stolen and pickup cards deliberately map to `declinedByBank`.** The
 * issuer's own guidance is not to tell the person holding the card that it has
 * been reported, because the person holding it is not always the customer -
 * and the customer already knows. `expired_card` is the opposite case and the
 * single highest-value line in the whole mail: it names a fix that takes a
 * minute.
 */
const REASON_FOR_CODE: Record<string, DeclineReasonKey> = {
  authentication_expired: "authenticationExpired",
  authentication_required: "authenticationExpired",
  call_issuer: "declinedByBank",
  card_declined: "declinedByBank",
  card_not_supported: "declinedByBank",
  card_velocity_exceeded: "declinedByBank",
  currency_not_supported: "declinedByBank",
  debit_notification_undelivered: "temporary",
  do_not_honor: "declinedByBank",
  duplicate_transaction: "temporary",
  expired_card: "expiredCard",
  fraudulent: "declinedByBank",
  generic_decline: "declinedByBank",
  incorrect_cvc: "cardDetails",
  incorrect_number: "cardDetails",
  incorrect_zip: "cardDetails",
  insufficient_funds: "insufficientFunds",
  invalid_account: "declinedByBank",
  invalid_card_type: "declinedByBank",
  invalid_cvc: "cardDetails",
  invalid_expiry_month: "cardDetails",
  invalid_expiry_year: "cardDetails",
  invalid_number: "cardDetails",
  issuer_not_available: "temporary",
  lost_card: "declinedByBank",
  merchant_blacklist: "declinedByBank",
  no_action_taken: "declinedByBank",
  no_payment_method: "noPaymentMethod",
  not_permitted: "declinedByBank",
  payment_method_invalid: "cardUnusable",
  pickup_card: "declinedByBank",
  processing_error: "temporary",
  reenter_transaction: "temporary",
  restricted_card: "declinedByBank",
  revocation_of_all_authorizations: "cardUnusable",
  revocation_of_authorization: "cardUnusable",
  security_violation: "declinedByBank",
  service_not_allowed: "declinedByBank",
  stolen_card: "declinedByBank",
  testmode_decline: "declinedByBank",
  transaction_not_allowed: "declinedByBank",
  try_again_later: "temporary",
  withdrawal_count_limit_exceeded: "declinedByBank",
};

/**
 * The reason to print for a stored decline code.
 *
 * `unknown` is not an error state - it is the honest answer, and it is worded
 * as one. A customer told "your bank declined this and did not say why" can
 * still act; a customer told nothing, or told something the code does not
 * support, cannot.
 */
export const declineReasonKey = (code?: string | null): DeclineReasonKey =>
  (code && REASON_FOR_CODE[code]) || "unknown";
