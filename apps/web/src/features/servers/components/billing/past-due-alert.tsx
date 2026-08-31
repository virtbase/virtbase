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

import { Alert, AlertDescription, AlertTitle } from "@virtbase/ui/alert";
import { Button } from "@virtbase/ui/button";
import { LucideCircleAlert } from "@virtbase/ui/icons";
import { Spinner } from "@virtbase/ui/spinner";
import { useExtracted, useFormatter } from "next-intl";
import type { Subscription } from "@/features/servers/hooks/billing/use-server-subscription";

interface PastDueAlertProps {
  subscription: Subscription;
  onRetry: () => void;
  isRetrying: boolean;
}

/**
 * What a failing renewal actually looks like, said out loud.
 *
 * `past_due` means a collection has been attempted and declined, and the
 * dunning ladder is still climbing. A dashboard that renders that as an
 * ordinary "active" subscription is lying to a customer whose server is about
 * to be switched off, so this states three things: that a payment failed, what
 * happens next, and by when they have to do something about it.
 *
 * "Retry now" is here rather than buried in a menu because the customer who
 * has just replaced their card wants exactly one thing, and waiting a day for
 * the sweep to notice is not it. The server rate limits it to three an hour -
 * every press is a real charge presented to a real issuer.
 */
export function PastDueAlert({
  subscription,
  onRetry,
  isRetrying,
}: PastDueAlertProps) {
  const t = useExtracted();
  const format = useFormatter();

  const endDate = format.dateTime(subscription.current_period_end, {
    dateStyle: "long",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  return (
    <Alert variant="destructive">
      <LucideCircleAlert aria-hidden="true" />
      <AlertTitle>{t("A payment for this server failed")}</AlertTitle>
      <AlertDescription>
        <p className="text-foreground">
          {t(
            "We could not collect the payment for your next term. We will try again automatically over the coming days. If it keeps failing, your server is suspended after {date} and deleted once the grace period has passed.",
            { date: endDate },
          )}
        </p>
        <p className="text-foreground">
          {t(
            "If you have just replaced your payment method, you do not have to wait for the next attempt.",
          )}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={onRetry}
          disabled={isRetrying}
        >
          {isRetrying && <Spinner />}
          {t("Retry now")}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
