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

import { useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription, AlertTitle } from "@virtbase/ui/alert";
import { Button } from "@virtbase/ui/button";
import { LucideCircleCheck, LucideTriangleAlert } from "@virtbase/ui/icons";
import { Skeleton } from "@virtbase/ui/skeleton";
import { APP_DOMAIN } from "@virtbase/utils";
import { useSearchParams } from "next/navigation";
import { useExtracted } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCreatePaymentMethodSetupSession } from "@/features/account/hooks/billing/create-payment-method-setup-session";
import { ElementsProvider } from "@/features/checkout/components/elements-provider";
import { paths } from "@/lib/paths";
import { useTRPC } from "@/lib/trpc/react";
import type { SetupOutcome } from "./add-payment-method-form";
import { AddPaymentMethodForm } from "./add-payment-method-form";

/**
 * Where a provider that can only confirm by redirecting sends the customer.
 *
 * Absolute and on the dashboard host, because the session cookie is scoped
 * there and a customer coming back has to still be signed in. Unlike the
 * router's own `SETUP_RETURN_URL` it points at this page rather than the
 * settings index, so the return lands where the cards are.
 */
const RETURN_URL = `${APP_DOMAIN}${paths.app.account.settings.billing.getHref()}`;

/** Names the panel for assistive tech the way a dialog title names a dialog. */
const PANEL_TITLE_ID = "add-payment-method-title";

/**
 * The "add a card" half of the billing card.
 *
 * **A panel, not a `ResponsiveDialog` - the one control on this page that is
 * not.** The house pattern is a modal Radix dialog, and a modal Radix dialog
 * cannot host this form. Two reasons, both in the primitive rather than in
 * how we use it:
 *
 * - `DialogContentModal` passes `disableOutsidePointerEvents: context.open`,
 *   and `DismissableLayer` implements that by setting
 *   `document.body.style.pointerEvents = "none"` for as long as the dialog is
 *   open. Stripe runs the issuer's 3-D Secure challenge in an iframe it
 *   appends to `document.body` *after* that point, so the challenge inherits
 *   `pointer-events: none` and cannot be clicked at all.
 * - `DialogContentModal` also passes `trapFocus: context.open`, and
 *   `FocusScope`'s `focusin` handler returns focus to the content whenever it
 *   lands outside. Focus entering the challenge iframe is focus leaving the
 *   content, so it is taken straight back out again.
 *
 * Radix sets both *after* spreading `{...props}`, so nothing passed to
 * `DialogContent` can switch either off, and `onInteractOutside` /
 * `onPointerDownOutside` only suppress dismissal - they restore neither
 * pointer events nor focus. The single supported escape is
 * `<Dialog modal={false}>`, which gives up the focus trap for the whole
 * dialog: a bad trade on a form that is not in a challenge most of the time.
 *
 * And this is the normal path rather than an edge case. The SetupIntent is
 * created with `usage: "off_session"`, which is exactly what SCA makes an
 * EEA issuer challenge.
 *
 * What is *not* a reason, despite being the one originally given here:
 * `hideOthers` from `aria-hidden`. It runs once in a mount effect and installs
 * no `MutationObserver`, so a node appended to the body afterwards is never
 * marked `aria-hidden`.
 *
 * So the mount stays outside the trap, and the surface is brought into line by
 * hand instead: the trigger is `CreateSSHKeyButton`'s trigger, and the panel
 * repeats `ResponsiveDialog`'s header / body / footer shape. Focus is moved
 * into the panel on open and back to the trigger on close, which is the one
 * thing a dialog would otherwise have done for free.
 *
 * The secret is minted only once the customer has actually asked to add a
 * card: every call creates a SetupIntent at the provider, so opening the
 * billing page must not create one for the majority of visitors who came to
 * read.
 */
export function AddPaymentMethod() {
  const t = useExtracted();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [isOpen, setIsOpen] = useState(false);

  const panelRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const shouldRestoreFocus = useRef(false);

  /**
   * A provider that could only confirm by redirecting sends the customer back
   * here with its own verdict in the query string. Only `redirect_status` is
   * read: the intent id beside it is the provider's, and nothing on this page
   * has any business with it.
   */
  const redirectStatus = useSearchParams().get("redirect_status");

  const [outcome, setOutcome] = useState<SetupOutcome | null>(
    redirectStatus === "succeeded"
      ? "saved"
      : redirectStatus === "processing"
        ? "processing"
        : null,
  );

  const {
    mutate: createSetupSession,
    data,
    isError,
    reset,
  } = useCreatePaymentMethodSetupSession();

  const open = useCallback(() => {
    setOutcome(null);
    setIsOpen(true);
    createSetupSession();
  }, [createSetupSession]);

  const close = useCallback(() => {
    shouldRestoreFocus.current = true;
    setIsOpen(false);
    // The secret belongs to one attempt. Dropping it means re-opening mints a
    // fresh SetupIntent rather than confirming against a spent one.
    reset();
  }, [reset]);

  // The trigger is unmounted while the panel is up, so neither end of this can
  // be left to the browser: opening would drop focus onto `<body>`, and
  // closing would leave it on a button that no longer exists.
  useEffect(() => {
    if (isOpen) {
      panelRef.current?.focus();
      return;
    }

    if (shouldRestoreFocus.current) {
      shouldRestoreFocus.current = false;
      triggerRef.current?.focus();
    }
  }, [isOpen]);

  const refreshList = useCallback(
    () => queryClient.invalidateQueries(trpc.paymentMethods.list.queryFilter()),
    [queryClient, trpc],
  );

  const handleSaved = useCallback(
    async (result: SetupOutcome) => {
      shouldRestoreFocus.current = true;
      setIsOpen(false);
      setOutcome(result);
      reset();

      await Promise.all([
        queryClient.invalidateQueries(trpc.paymentMethods.list.queryFilter()),
        queryClient.invalidateQueries(trpc.subscriptions.list.queryFilter()),
      ]);
    },
    [queryClient, reset, trpc],
  );

  const action = t("Add a card");

  if (isOpen) {
    return (
      <section
        ref={panelRef}
        tabIndex={-1}
        aria-labelledby={PANEL_TITLE_ID}
        className="flex w-full flex-col gap-4 outline-none"
      >
        <h3
          id={PANEL_TITLE_ID}
          className="font-semibold text-lg leading-none"
          data-testid="add-payment-method-title"
        >
          {action}
        </h3>

        {/*
         * Shown from the moment the panel opens rather than only while the
         * mutation is in flight: `createSetupSession()` is fired in the same
         * event as `setIsOpen(true)`, so `isPending` is still false for the
         * first render and the panel would flash empty.
         */}
        {!data?.client_secret && !isError && (
          <div
            className="flex flex-col gap-3"
            role="status"
            aria-live="polite"
            aria-busy="true"
          >
            <p className="text-muted-foreground text-sm">
              {t("Opening a secure form…")}
            </p>
            <Skeleton className="h-56 w-full" />
          </div>
        )}

        {isError && (
          <Alert variant="destructive" data-testid="setup-session-error">
            <LucideTriangleAlert aria-hidden="true" />
            <AlertTitle className="line-clamp-none">
              {t("The card form could not be opened")}
            </AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-3">
              <p>
                {t(
                  "Nothing was saved and nothing was charged. Try again in a moment.",
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={close}
                >
                  {t("Cancel")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => createSetupSession()}
                >
                  {t("Try again")}
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {data?.client_secret && (
          <ElementsProvider clientSecret={data.client_secret}>
            <AddPaymentMethodForm
              returnUrl={RETURN_URL}
              onSaved={handleSaved}
              onCancel={close}
            />
          </ElementsProvider>
        )}
      </section>
    );
  }

  return (
    <div className="flex w-full flex-col gap-4">
      {outcome && (
        <Alert data-testid="add-payment-method-outcome">
          <LucideCircleCheck aria-hidden="true" />
          <AlertTitle className="line-clamp-none">
            {outcome === "processing"
              ? t("Your bank is confirming the mandate")
              : t("Card saved")}
          </AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3">
            <p>
              {outcome === "processing"
                ? t(
                    "This can take a day or two. Nothing is charged in the meantime.",
                  )
                : t("It appears in the list above in a few seconds.")}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void refreshList()}
            >
              {t("Refresh")}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex w-full flex-col items-center justify-center gap-4 lg:flex-row lg:justify-between">
        <p className="text-center text-muted-foreground text-sm lg:text-left">
          {t("Nothing is charged when you add a card.")}
        </p>
        <Button
          ref={triggerRef}
          size="sm"
          onClick={open}
          data-testid="add-payment-method"
        >
          {action}
        </Button>
      </div>
    </div>
  );
}
