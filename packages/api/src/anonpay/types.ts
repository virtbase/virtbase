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

import * as z4 from "zod/v4";

/**
 * @see https://trocador.app/en/anonpaydocumentation
 */
export interface AnonpayCreateInput {
  // Required Parameters
  /**
   * The ticker of the coin you want to receive. E.g. btc, xmr, eth, etc.
   */
  ticker_to: string;
  /**
   * The network of the coin you want to receive. E.g. Mainnet, ERC20, BEP20, etc.
   */
  network_to: string;
  /**
   * The address in which you want to receive. E.g. 89Jb5....D1LdB12 for our Monero address
   */
  address: string;
  // Optional Parameters
  /**
   * For payments, it is the amount of the coin you want to receive and it'll be locked.
   * For donations, it is the preset amount of the coin the user will donate.
   */
  amount?: string;

  /**
   * If the network of the coin you want to receive uses Memo/ExtraID you need to provide it using this parameter
   * or use '0' for no Memo.
   */
  memo?: string | 0;

  /**
   * True will activate the donation mode, otherwise it defaults to payment mode.
   */
  donation?: boolean;

  /**
   * False will make the URL work as an API and return a JSON response with the ID of the created transaction.
   */
  direct?: boolean;

  /**
   * If you want you can define the preselected coin the user will transfer, as in ticker_to this is the coin's ticker.
   */
  ticker_from?: string;

  /**
   * If you want you can define the preselected coin the user will transfer, as in network_to this is the coin's network.
   */
  network_from?: string;

  /**
   * The name you want to appear on the widget. Special characters must be URL encoded ('A B' is 'A%20B').
   */
  name?: string;

  /**
   * A description to appear in the checkout screen for the payment/donation.
   * Special characters must be URL encoded ('A B' is 'A%20B').
   */
  description?: string;

  /**
   * If you have a referral code from our affiliate program you can use it here.
   */
  ref?: string;

  /**
   * The color of the button, should be in hex format without the '#'. E.g. ff0000 for red.
   */
  buttonbgcolor?: string;

  /**
   * The color of the text of the button, should be in hex format without the '#'. E.g. ffffff for white.
   */
  textcolor?: string;

  /**
   * True will give the page a gray background, otherwise it'll be transparent/white.
   * If you won't use AnonPay in an iframe this is recommended.
   * You can also use a color in hex format without the '#'.
   * E.g. Example: 000000ff for black with no transparency.
   */
  bgcolor?: boolean | string;

  /**
   * An email in which you will receive confirmation when the transaction is completed.
   */
  email?: string;

  /**
   * If you want your transaction to be denominated in fiat currency provide a valid currency abbreviation (e.g. USD or EUR).
   * Note that you'll receive in your chosen coin and your clients will pay in crypto, we don't yet accept fiat payments.
   */
  fiat_equiv?: string;

  /**
   * If you don't want the user to pay you directly through AnonPay with the coin you chose to receive,
   * you can set this parameter to True. Useful if you have another preferred method to receive in your chosen coin
   * and want to use AnonPay only for other coins.
   */
  remove_direct_pay?: true;

  /**
   * If you want to use only exchanges with a minimum of A, B or C KYC rating, please provide this parameter (Optional).
   */
  min_kycrating?: "A" | "B" | "C";

  /**
   * Allows the user to change the amount to be paid when set to True.
   */
  editable?: true;

  /**
   * If you provide an URL on this parameter, every time the status of the transaction changes,
   * you will receive on this URL a POST request sending you the transaction data.
   * This avoids having to call so many times our server to check the transaction status (Optional).
   */
  webhook?: string;

  /**
   * When set to True the checkout screen will be more streamlined for easier use by people not that familiar with crypto.
   */
  simple_mode?: true;

  /**
   * Sets a maximum amount for donations, in USD equivalent.
   */
  maximum?: number;
}

export interface AnonpayCreateResponse {
  ID: string;
  url: string;
  url_onion: string;
  status_url: string;
  status_url_onion: string;
}

export const AnonpayWebhookSchema = z4.object({
  trade_id: z4.string(),
  date: z4.string(),
  /**
   * Status of the anonpay trade.
   *
   * - anonpaynew: the trade is created, but no coin was selected for payment yet
   * - waiting: you created the swap but no deposit was detected
   * - confirming: deposit was detected and is yet to be confirmed
   * - sending: deposit confirmed and provider is sending the coins
   * - finished: there is already a payment hash to the user
   * - paid partially: there is already a payment hash to the user, but the amount is lower than asked
   * - failed: something might have happened to the swap, please contact support
   * - expired: payment time expired
   * - halted: some issue happened with the swap, please contact support
   * - refunded: exchange claims to have refunded the user
   */
  status: z4.enum([
    "anonpaynew", // the trade is created, but no coin was selected for payment yet
    "waiting", // you created the swap but no deposit was detected
    "confirming", // deposit was detected and is yet to be confirmed
    "sending", // deposit confirmed and provider is sending the coins
    "finished", // there is already a payment hash to the user
    "paid partially", // there is already a payment hash to the user, but the amount is lower than asked
    "failed", // something might have happened to the swap, please contact support
    "expired", // payment time expired
    "halted", // some issue happened with the swap, please contact support
    "refunded", // exchange claims to have refunded the user
  ]),
  details: z4.object({
    fiat_equiv: z4.string(),
    fiat_amount: z4.number(),
  }),
});

export type AnonpayWebhookResponse = z4.infer<typeof AnonpayWebhookSchema>;
