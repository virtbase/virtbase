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
import { useIsMobile } from "@virtbase/ui/hooks";
import { ResponsiveDialog } from "@virtbase/ui/responsive-dialog";
import { Spinner } from "@virtbase/ui/spinner";
import { useExtracted, useFormatter } from "next-intl";

interface CancelSubscriptionDialogProps
  extends Omit<
    React.ComponentProps<typeof ResponsiveDialog>,
    "title" | "description" | "footer" | "children"
  > {
  /** The server this subscription pays for, when it still exists. */
  subjectName: string | null;
  /** End of the term the customer has already paid for. */
  periodEnd: Date;
  /**
   * Whether the service has already stopped - a `suspended` subscription.
   *
   * Passed in rather than worked out from `periodEnd` against the clock: what
   * the customer is told here has to follow the status the rest of the page is
   * showing, and a dialog that reads the time is a dialog whose wording changes
   * under a test that pins it.
   */
  alreadyStopped?: boolean;
  onConfirm: () => void;
  isPending: boolean;
}

/**
 * The cancellation confirmation. **Its contents are a legal requirement.**
 *
 * ## § 312k BGB - do not add anything to this dialog
 *
 * German law requires that terminating a continuing obligation is at least as
 * easy as entering into one, and prescribes the shape of both the button and
 * the confirmation. The Bundesgerichtshof has sharpened it twice: in May 2025
 * it held the duty covers contracts whose service is performed continuously,
 * not only self-renewing ones - so it applies to a Virtbase server whether or
 * not automatic renewal happens to be switched on. In July 2026 it held that
 * the confirmation page must contain **nothing but the cancellation**, and
 * that an alternative offer placed there is itself the violation.
 *
 * So this dialog contains exactly three things, and may never contain a
 * fourth:
 *
 * 1. what ends,
 * 2. when it ends,
 * 3. a button that ends it.
 *
 * **Specifically forbidden here**, however well meant, and regardless of what
 * it does to churn: a retention offer, a discount, a pause-instead option, a
 * "you will lose your backups / your IP / your data" warning framed as a
 * reason to stay, an exit survey, a "please tell us why" field, a support-chat
 * prompt, an "are you sure?" second step. If a change to this file feels like
 * it would help retention, that feeling is the thing the statute prohibits.
 * The corresponding assertions live in `__tests__/cancel-subscription.test.tsx`
 * and assert on *absence*; they are there to fail loudly if this is quietly
 * grown.
 *
 * **No reason is collected.** `subscriptions.cancel` accepts an optional one
 * and this deliberately never sends it: any field asking why the customer is
 * leaving would be content on the confirmation page that is not the
 * cancellation. Feedback can be asked for elsewhere, after the fact, by
 * something that cannot stand between a customer and the button.
 *
 * The dismiss button says "Go back", not "Keep my subscription" - the second
 * is a retention prompt wearing a dismiss button's clothes.
 *
 * `alreadyStopped` selects between two wordings of items 1 and 2 for a server
 * the suspension sweep has already powered off. It adds no fourth thing, no
 * control and no offer - both branches say what ends and when - and the
 * absence assertions are run against it too.
 */
export function CancelSubscriptionDialog({
  subjectName,
  periodEnd,
  alreadyStopped = false,
  onConfirm,
  isPending,
  ...props
}: CancelSubscriptionDialogProps) {
  const t = useExtracted();
  const format = useFormatter();
  const isMobile = useIsMobile();

  const endDate = format.dateTime(periodEnd, {
    dateStyle: "long",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  return (
    <ResponsiveDialog
      /*
       * A distinct string from the trigger's on purpose. § 312k Abs. 2 BGB
       * names two different labels - "Verträge hier kündigen" for the control
       * that opens this, "Jetzt kündigen" for the button that completes it -
       * and one shared msgid could only carry one of them into German.
       */
      title={t("Cancelling your subscription")}
      description={t("Confirm that you want to cancel this subscription.")}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            data-testid="cancel-subscription-dismiss"
            onClick={() => props.onOpenChange?.(false)}
            disabled={isPending}
            autoFocus={!isMobile}
          >
            {t("Go back")}
          </Button>
          {/*
           * The confirmation button § 312k asks for. Its label is unambiguous
           * on purpose - the German string for it is the statutory
           * "Jetzt kündigen". Do not soften it, and do not make it the
           * secondary action.
           */}
          <Button
            type="button"
            variant="destructive"
            data-testid="confirm-cancel-subscription"
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending && <Spinner />}
            {t("Cancel subscription now")}
          </Button>
        </>
      }
      {...props}
    >
      <div
        className="flex flex-col gap-4 text-sm"
        data-testid="cancel-subscription-confirmation"
      >
        <p>
          {subjectName
            ? t("The subscription for {name} will be cancelled.", {
                name: subjectName,
              })
            : t("This subscription will be cancelled.")}
        </p>
        {/*
         * The same two facts either way - what the term does, and what
         * cancelling does to it - said truthfully for a server that is already
         * off. `suspended` gets here because it can still be cancelled; being
         * told "nothing is switched off today" about a machine that was
         * switched off last week is not a softer version of the same sentence,
         * it is a different and false one. Neither branch is a warning designed
         * to make the customer reconsider, and neither may become one.
         */}
        {alreadyStopped ? (
          <>
            <p>
              {t(
                "This server is suspended and was switched off when the term ended on {date}.",
                {
                  date: endDate,
                },
              )}
            </p>
            <p>
              {t(
                "Cancelling stops it being renewed. You will not be charged again, and it does not switch the server back on.",
              )}
            </p>
          </>
        ) : (
          <>
            <p>
              {t(
                "Your server keeps running until {date}, the end of the term you have already paid for. Nothing is switched off today and you will not be charged again.",
                { date: endDate },
              )}
            </p>
            <p>
              {t("After {date} the server is not renewed and is shut down.", {
                date: endDate,
              })}
            </p>
          </>
        )}
      </div>
    </ResponsiveDialog>
  );
}
