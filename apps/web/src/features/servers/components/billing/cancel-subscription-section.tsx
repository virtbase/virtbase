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

"use client";

import { Button } from "@virtbase/ui/button";
import { Spinner } from "@virtbase/ui/spinner";
import { useExtracted, useFormatter } from "next-intl";
import { useState } from "react";
import type { Subscription } from "@/features/servers/hooks/billing/use-server-subscription";
import { CancelSubscriptionDialog } from "./cancel-subscription-dialog";

interface CancelSubscriptionSectionProps {
  subscription: Subscription;
  onCancel: () => void;
  onResume: () => void;
  isCancelling: boolean;
  isResuming: boolean;
}

/**
 * The cancellation control. **Its placement is a legal requirement.**
 *
 * ## § 312k BGB - this must stay where it is and look like what it is
 *
 * The statute requires a cancellation control that is *ständig verfügbar sowie
 * unmittelbar und leicht zugänglich* - permanently available, and directly and
 * easily reachable. The Bundesgerichtshof extended the duty in May 2025 to
 * every contract whose service is performed continuously, which is what a
 * Virtbase server is whether or not automatic renewal is switched on.
 *
 * Concretely, and none of these is a style preference:
 *
 * - It is rendered **inline as the last section of the server's plan page**,
 *   the one page that carries the price, the term, the renewal switch and the
 *   catalogue, so a customer who came to reconsider what they pay finds the
 *   button in the same place as everything else about the money. The server
 *   overview - the page a customer lands on when they open a server - carries
 *   a permanent, data-free link to it (`PlanLinkCard`), so the path is one
 *   click long and cannot be hidden by a query that has not answered yet.
 * - It is **never** behind a dropdown, a `<details>`, an accordion, a "danger
 *   zone" the customer has to expand, a support ticket or a chat widget.
 *   Moving it behind any of those is the violation, not a refactor. The
 *   surrounding card is deliberately quieter than the rest of the page, but
 *   quiet is contrast; it is never a disclosure the customer has to open.
 * - It is **always rendered** for a live subscription. It is not hidden while
 *   something is loading elsewhere on the page, and it is not conditional on
 *   automatic renewal being switched on.
 * - The label is unambiguous and says what the button does. Its German string
 *   is the statutory *Jetzt kündigen*, and so is the confirmation button's
 *   behind it. "Manage", "Options" or "Billing settings" would all fail the
 *   statute's requirement that the button be legibly labelled with nothing but
 *   the cancellation.
 *
 * Those two German strings are written into `src/i18n/messages/de.po` by
 * hand rather than left to the translation round trip. Everything else in this
 * application can wait for a translator; a cancellation button that reads
 * "Cancel subscription" to a German customer cannot, because the statute is
 * about the wording.
 *
 * The confirmation behind it is {@link CancelSubscriptionDialog}, which
 * carries the other half of the rule: it must contain nothing but the
 * cancellation. Read the note there before touching it.
 *
 * ## Resuming is a different state, not an alternative offer
 *
 * A subscription that has already been cancelled shows a resume button
 * instead, because there is nothing left to cancel. That is not a retention
 * prompt: it is only ever reached *after* the customer has cancelled and the
 * cancellation has taken effect, so it never stands between them and the
 * button. It must never be shown next to, or instead of, the cancel control on
 * a live subscription.
 *
 * ## `suspended` and `ended` are two different answers, and neither is the live one
 *
 * The statute is about contracts that can be terminated, so what the four
 * states get is decided by what `subscriptions.cancel` actually does to them:
 *
 * - `active` and `past_due` - the live case, and the only one this file may
 *   ever be quiet about changing. Everything above applies to it verbatim.
 * - `suspended` - **still cancellable and still gets the button.** The router
 *   accepts it and turns `auto_renew` off, which is the whole of what
 *   cancelling means once the service is already stopped. What it must not do
 *   is repeat the live sentence: the server was powered off when the term ran
 *   out, and "your server keeps running until <a date in the past>" is a
 *   falsehood on the one control a customer is least able to argue with.
 * - `ended` - **nothing left to cancel, and no button.** The deletion sweep
 *   ends the subscription before it queues the workflow, so this state is on
 *   screen for as long as the deletion takes and indefinitely if it fails on an
 *   unreachable node. `subscriptions.cancel` refuses it outright - "This
 *   subscription has already ended." - so a permanently visible control here
 *   would be a permanently visible error. § 312k asks for a control that
 *   terminates the contract, not for one that cannot.
 *
 * Nothing in that list may become a reason to hide, disable or defer the
 * control on a subscription that is still live.
 */
export function CancelSubscriptionSection({
  subscription,
  onCancel,
  onResume,
  isCancelling,
  isResuming,
}: CancelSubscriptionSectionProps) {
  const t = useExtracted();
  const format = useFormatter();

  const [isConfirming, setIsConfirming] = useState(false);

  const endDate = format.dateTime(subscription.current_period_end, {
    dateStyle: "long",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  // Already cancelled, and still inside the term the customer paid for - the
  // one window in which `resume` does anything.
  if ("cancelled" === subscription.status) {
    const withinTerm = subscription.current_period_end.getTime() > Date.now();

    return (
      <div
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
        data-testid="cancel-subscription-section"
      >
        <div className="flex max-w-prose flex-col gap-1">
          <p className="font-medium">{t("Subscription cancelled")}</p>
          <p className="text-muted-foreground text-sm">
            {withinTerm
              ? t(
                  "Your server keeps running until {date} and will not be renewed.",
                  { date: endDate },
                )
              : t("The paid-for term ended on {date}.", { date: endDate })}
          </p>
        </div>
        {withinTerm && (
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            data-testid="resume-subscription"
            onClick={onResume}
            disabled={isResuming}
          >
            {isResuming && <Spinner />}
            {t("Resume subscription")}
          </Button>
        )}
      </div>
    );
  }

  // Over. The one state the router refuses, so there is no control to offer -
  // only the fact, and the date it happened on.
  if ("ended" === subscription.status) {
    return (
      <div
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
        data-testid="cancel-subscription-section"
      >
        <div className="flex max-w-prose flex-col gap-1">
          <p className="font-medium">{t("Subscription ended")}</p>
          <p className="text-muted-foreground text-sm">
            {t(
              "The paid-for term ended on {date}. There is nothing left to cancel and you will not be charged again.",
              { date: endDate },
            )}
          </p>
        </div>
      </div>
    );
  }

  /*
   * The service is already stopped, and the contract is not.
   *
   * Cancelling still does something - it turns automatic renewal off - so the
   * § 312k control stays exactly where it is. Only the sentence beside it
   * changes, and so does the confirmation's, because both of them otherwise
   * promise a machine that is running.
   */
  const alreadyStopped = "suspended" === subscription.status;

  return (
    <div
      className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      data-testid="cancel-subscription-section"
    >
      <div className="flex max-w-prose flex-col gap-1">
        {/*
         * A heading, deliberately not the same string as the button. The
         * button's German is the statutory "Jetzt kündigen" and a heading
         * carrying that wording twice reads as two controls.
         */}
        <p className="font-medium">{t("Cancellation")}</p>
        <p className="text-muted-foreground text-sm">
          {alreadyStopped
            ? t(
                "This server is suspended and the term you paid for ended on {date}. Cancelling stops it being renewed; it does not switch the server back on.",
                { date: endDate },
              )
            : t(
                "Your server keeps running until {date}. Cancelling only stops it being renewed after that.",
                { date: endDate },
              )}
        </p>
      </div>
      {/*
       * § 312k BGB: permanently visible, directly reachable, unambiguously
       * labelled. Do not move this into a menu, an accordion or a sub-page,
       * and do not make it conditional on anything about the page - not on a
       * query that has not answered, not on automatic renewal, not on a
       * mutation in flight. The two returns above are the only exception the
       * statute allows, and they are about the contract rather than the page:
       * a subscription that has already been cancelled or has already ended
       * has nothing left for this button to do.
       */}
      <Button
        type="button"
        variant="destructive"
        className="shrink-0"
        data-testid="cancel-subscription-trigger"
        onClick={() => setIsConfirming(true)}
        disabled={isCancelling}
      >
        {isCancelling && <Spinner />}
        {t("Cancel subscription")}
      </Button>
      <CancelSubscriptionDialog
        open={isConfirming}
        onOpenChange={setIsConfirming}
        subjectName={subscription.subject_name}
        periodEnd={subscription.current_period_end}
        alreadyStopped={alreadyStopped}
        onConfirm={onCancel}
        isPending={isCancelling}
      />
    </div>
  );
}
