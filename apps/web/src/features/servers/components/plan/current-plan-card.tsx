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

import { cn } from "@virtbase/ui";
import { Badge } from "@virtbase/ui/badge";
import { buttonVariants } from "@virtbase/ui/button";
import { Card, CardContent, CardFooter } from "@virtbase/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@virtbase/ui/empty";
import {
  LucideArrowDown,
  LucideCalendarClock,
  LucideRefreshCw,
  LucideServer,
} from "@virtbase/ui/icons";
import { Skeleton } from "@virtbase/ui/skeleton";
import NextLink from "next/link";
import { useExtracted, useFormatter } from "next-intl";
import { ItemRow } from "@/features/account/components/item-row";
import type { PaymentMethodState } from "@/features/servers/components/billing/auto-renew-section";
import { AutoRenewSection } from "@/features/servers/components/billing/auto-renew-section";
import { PastDueAlert } from "@/features/servers/components/billing/past-due-alert";
import type { Subscription } from "@/features/servers/hooks/billing/use-server-subscription";
import { paths } from "@/lib/paths";
import { CHANGE_PLAN_ANCHOR } from "./anchors";
import type { PlanSpecsShape } from "./plan-specs";
import { PlanSpecs } from "./plan-specs";
import type { SavedPaymentMethod } from "./renewal-payment-method";
import { RenewalPaymentMethod } from "./renewal-payment-method";

interface CurrentPlanCardProps {
  /**
   * The standing agreement that pays for this server, when there is one.
   *
   * Null is the ordinary case rather than an error: a subscription is written
   * when a server is provisioned, so every server sold before the billing
   * tables existed has none, and an extension does not create one.
   */
  subscription: Subscription | null;
  /**
   * `servers.terminates_at` - the only term a server without a subscription
   * has, and what the empty state counts down to.
   */
  terminatesAt: Date | null;
  /** The plan this server is on. Null while the catalog loads. */
  plan: (PlanSpecsShape & { name: string }) | null;
  /** What a renewal costs today, in cents. Null while the plan loads. */
  renewalAmount: number | null;
  /** The saved credentials, which is where a card's health lives. */
  savedPaymentMethods: SavedPaymentMethod[] | undefined;
  isPaymentMethodsPending: boolean;
  paymentMethodState: PaymentMethodState;
  onAcceptMandate: (version: string) => void;
  onSetAutoRenew: (enabled: boolean) => void;
  isUpdatingRenewal: boolean;
  /** Whatever the server refused the renewal change with, verbatim. */
  renewalError?: string | null;
  onRetry: () => void;
  isRetrying: boolean;
}

/**
 * Everything about the money for one server, at a glance.
 *
 * ## Three facts, as three rows
 *
 * *What do I have*, *when does it end*, *what pays for it* - the same
 * `ItemRow` the account pages list SSH keys, passkeys and saved cards with, so
 * a customer reads this card the way they read those: a glyph, a title, one
 * muted line under it, and whatever is terse enough to belong on the right.
 * The switch that decides between the first two outcomes goes in the footer,
 * where the account cards keep their one action.
 *
 * Anything that is merely true rather than actionable stays out; the catalogue
 * and the checkout are the section below this one.
 *
 * The term is written as a date and never as an interval. "Renews
 * automatically on 30 September 2026" is something a customer can act on;
 * "renews in 30 days" makes them do arithmetic against a calendar they cannot
 * see, and is wrong the moment the page has been open for a day.
 *
 * ## Pure, and handed everything
 *
 * Nothing here reaches for a query client, a router or a session: the
 * container above it does that. That is not decoration - the cancellation and
 * renewal flows have assertions written against what they must and must not
 * contain, and those are only worth having if the thing under test can be
 * rendered in isolation. Keep it that way.
 *
 * ## Colour means something
 *
 * A badge appears for `past_due`, `cancelled`, `suspended` and `ended`, and
 * `active` gets none: a green chip saying "everything is fine" trains people
 * to stop reading the row where the red one will eventually appear.
 */
export function CurrentPlanCard({
  subscription,
  terminatesAt,
  plan,
  renewalAmount,
  savedPaymentMethods,
  isPaymentMethodsPending,
  paymentMethodState,
  onAcceptMandate,
  onSetAutoRenew,
  isUpdatingRenewal,
  renewalError,
  onRetry,
  isRetrying,
}: CurrentPlanCardProps) {
  const t = useExtracted();
  const format = useFormatter();

  const intervalMonths = subscription?.interval_months ?? 1;
  const currency = subscription?.currency ?? "EUR";

  // The subscription's period is the authority when there is one; a server
  // without one only has the date its own term runs out on.
  const periodEnd = subscription?.current_period_end ?? terminatesAt;
  const endDate = periodEnd
    ? format.dateTime(periodEnd, {
        dateStyle: "long",
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
    : null;

  const price =
    renewalAmount == null
      ? null
      : format.number(renewalAmount / 100, { style: "currency", currency });

  return (
    <Card
      data-testid="current-plan-card"
      // `pb-0` only when the footer is there to close the card off. Without a
      // subscription there is no switch, and a card that ends flush against
      // nothing is a card with a missing bottom edge.
      className={cn("overflow-hidden", subscription && "pb-0")}
    >
      <CardContent className="flex flex-col gap-4">
        {subscription && "past_due" === subscription.status && (
          <PastDueAlert
            subscription={subscription}
            onRetry={onRetry}
            isRetrying={isRetrying}
          />
        )}

        {/*
         * A plain block rather than a flex column: `ItemRow` pulls itself in
         * by a pixel on every side so neighbouring rows share one border, and
         * flex would double that gap back up.
         */}
        <div>
          <ItemRow
            data-testid="current-plan-row"
            icon={
              <LucideServer className="size-6 shrink-0" aria-hidden="true" />
            }
            rightSide={
              <div className="flex flex-col gap-1 lg:items-end">
                {price === null ? (
                  <Skeleton className="h-5 w-28" />
                ) : (
                  <p className="whitespace-nowrap text-sm tabular-nums">
                    {1 === intervalMonths
                      ? t("{price} / month", { price })
                      : t("{price} every {months} months", {
                          price,
                          months: format.number(intervalMonths),
                        })}
                  </p>
                )}
                <p className="text-muted-foreground text-sm leading-none">
                  {t("Incl. statutory VAT, if applicable")}
                </p>
              </div>
            }
          >
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {plan ? (
                <p className="truncate font-medium text-sm">{plan.name}</p>
              ) : (
                <Skeleton className="h-4 w-24" />
              )}
              <SubscriptionStatusBadge status={subscription?.status ?? null} />
            </div>
            {plan ? (
              <PlanSpecs
                plan={plan}
                className="text-muted-foreground text-sm leading-none"
              />
            ) : (
              <Skeleton className="h-4 w-56 max-w-full" />
            )}
          </ItemRow>

          <TermRow
            subscription={subscription}
            endDate={endDate}
            periodEnd={periodEnd}
          />

          {subscription && (
            <RenewalPaymentMethod
              chargeable={subscription.payment_method}
              saved={savedPaymentMethods}
              isPending={isPaymentMethodsPending}
            />
          )}
        </div>

        {!subscription && <NoRenewalEmpty endDate={endDate} />}
      </CardContent>

      {subscription && (
        <CardFooter className="border-t bg-background [.border-t]:p-6">
          <div className="w-full">
            <AutoRenewSection
              subscription={subscription}
              renewalAmount={renewalAmount}
              paymentMethodState={paymentMethodState}
              onAcceptMandate={onAcceptMandate}
              onSetAutoRenew={onSetAutoRenew}
              isPending={isUpdatingRenewal}
              errorMessage={renewalError}
            />
          </div>
        </CardFooter>
      )}
    </Card>
  );
}

/**
 * The one badge on this card, and only when something is wrong.
 *
 * `active` deliberately renders nothing. A subscription that is simply working
 * is the state the rest of the card already describes, and a green "Active"
 * chip beside it is noise that makes the red one easier to miss.
 *
 * It sits beside the plan name rather than in a card header: the card no
 * longer has one, and a status is about the thing it is next to.
 */
function SubscriptionStatusBadge({ status }: { status: string | null }) {
  const t = useExtracted();

  const badge = (() => {
    switch (status) {
      case "past_due":
        return { variant: "destructive" as const, label: t("Payment failed") };
      case "suspended":
        return { variant: "destructive" as const, label: t("Suspended") };
      case "cancelled":
        return { variant: "outline" as const, label: t("Cancelled") };
      case "ended":
        return { variant: "outline" as const, label: t("Ended") };
      default:
        return null;
    }
  })();

  if (!badge) return null;

  return (
    <Badge variant={badge.variant} data-testid="subscription-status">
      {badge.label}
    </Badge>
  );
}

/**
 * The term, as a date and in plain language.
 *
 * Every branch names the day, and the second line - when there is one - says
 * what that date means rather than repeating it. A customer must never have to
 * work out when their server stops from an interval and a start date.
 */
function TermRow({
  subscription,
  endDate,
  periodEnd,
}: {
  subscription: Subscription | null;
  endDate: string | null;
  periodEnd: Date | null;
}) {
  const t = useExtracted();

  const term = (() => {
    if (!endDate || !periodEnd) return { title: t("No end date"), note: null };

    const withinTerm = periodEnd.getTime() > Date.now();

    if (!subscription) {
      return { title: t("Ends on {date}", { date: endDate }), note: null };
    }

    switch (subscription.status) {
      case "cancelled":
        return {
          title: withinTerm
            ? t("Runs until {date}, then ends", { date: endDate })
            : t("Ended on {date}", { date: endDate }),
          note: t("Cancelled. It will not be renewed."),
        };
      case "suspended":
        return {
          title: t("Ended on {date}", { date: endDate }),
          note: t("The server is suspended until this is paid."),
        };
      case "ended":
        return { title: t("Ended on {date}", { date: endDate }), note: null };
      default:
        return {
          title: subscription.auto_renew
            ? t("Renews automatically on {date}", { date: endDate })
            : t("Ends on {date}", { date: endDate }),
          note: subscription.auto_renew
            ? null
            : t("Nothing renews by itself unless you turn it on below."),
        };
    }
  })();

  return (
    <ItemRow
      data-testid="plan-term"
      icon={
        <LucideCalendarClock className="size-6 shrink-0" aria-hidden="true" />
      }
      rightSide={null}
    >
      <p className="truncate font-medium text-sm">{term.title}</p>
      {term.note && (
        <p className="text-muted-foreground text-sm leading-none">
          {term.note}
        </p>
      )}
    </ItemRow>
  );
}

/**
 * A server that is not on a subscription at all.
 *
 * The common case on every machine sold before the billing tables existed, and
 * therefore worth being honest and inviting about rather than blank: nothing
 * is broken, nothing renews by itself, and the way to keep the server is the
 * section directly below. Saying "you have no subscription" and stopping would
 * read as an error the customer has to fix and cannot.
 */
function NoRenewalEmpty({ endDate }: { endDate: string | null }) {
  const t = useExtracted();

  return (
    <Empty className="border" data-testid="no-subscription">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <LucideRefreshCw aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{t("Automatic renewal is not set up")}</EmptyTitle>
        <EmptyDescription>
          {endDate
            ? t(
                "This server is paid for one term at a time, so nothing is charged without you. It keeps running until {date} — extend it before then and it carries on.",
                { date: endDate },
              )
            : t(
                "This server is paid for one term at a time, so nothing is charged without you. Extend it below to keep it running.",
              )}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <a
          href={`#${CHANGE_PLAN_ANCHOR}`}
          className={buttonVariants({ variant: "default" })}
          data-testid="no-subscription-extend"
        >
          <LucideArrowDown aria-hidden="true" />
          {t("Extend or change your plan")}
        </a>
        <NextLink
          href={paths.app.account.settings.billing.getHref()}
          prefetch={false}
          className="text-muted-foreground text-sm underline underline-offset-4 hover:text-primary"
        >
          {t("Manage payment methods")}
        </NextLink>
      </EmptyContent>
    </Empty>
  );
}
