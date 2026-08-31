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

import { Badge } from "@virtbase/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@virtbase/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@virtbase/ui/empty";
import {
  LucideCreditCard,
  LucideReceipt,
  LucideRefreshCw,
} from "@virtbase/ui/icons";
import { Separator } from "@virtbase/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@virtbase/ui/table";
import NextLink from "next/link";
import { useExtracted, useFormatter, useNow } from "next-intl";
import { paths } from "@/lib/paths";
import { CopyButton } from "@/ui/copy-button";
import type {
  SubscriptionDetail,
  SubscriptionPaymentRow,
  SubscriptionRenewalRow,
} from "../../api/subscriptions/get-subscription";
import {
  humaniseSubscriptionTerm,
  PAYMENT_STATUS_ICONS,
  RENEWAL_STATUS_ICONS,
  SUBSCRIPTION_STATUS_ICONS,
} from "./subscription-meta";

/**
 * Minor units to a formatted amount. The database stores cents everywhere.
 *
 * The currency comes out of the row rather than being hardcoded, and `Intl`
 * throws on a code it does not recognise — which would blank the one page
 * support opens when something is already wrong. A bad code degrades to
 * "3499 XYZ" instead.
 */
function useMoney() {
  const format = useFormatter();

  return (amount: number, currency: string) => {
    try {
      return format.number(amount / 100, { style: "currency", currency });
    } catch {
      return `${amount / 100} ${currency}`;
    }
  };
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/** An em dash, so an empty cell never reads as a rendering failure. */
function Nothing() {
  return <span className="text-muted-foreground">—</span>;
}

/**
 * The decline code, made the loudest thing in its row.
 *
 * This is the single string the whole page exists to show: it is what an
 * operator looks up, quotes back to the customer, or takes to the provider's
 * dashboard. Monospaced and selectable rather than prettified — the code is
 * stored verbatim precisely so that an unfamiliar one survives to be read, and
 * humanising it here would undo that on the way out.
 */
function FailureCode({ code }: { code: string | null }) {
  if (!code) return <Nothing />;

  return (
    <code className="select-all rounded bg-destructive/10 px-1.5 py-0.5 font-mono text-destructive text-xs">
      {code}
    </code>
  );
}

function RenewalHistory({ renewals }: { renewals: SubscriptionRenewalRow[] }) {
  const t = useExtracted();
  const format = useFormatter();
  const money = useMoney();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Renewal history")}</CardTitle>
        <CardDescription>
          {t(
            "Every period this subscription has tried to collect, newest first. The decline code is the provider's own, stored exactly as it was returned.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {renewals.length === 0 ? (
          // The common case on a fresh subscription: the first period was paid
          // at checkout and nothing has fallen due yet. Saying so is the whole
          // answer to a surprising number of tickets.
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <LucideRefreshCw aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>{t("No renewals yet")}</EmptyTitle>
              <EmptyDescription>
                {t(
                  "Nothing has fallen due on this subscription. A row appears here the moment a period is claimed for collection.",
                )}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <TableContainer className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Period")}</TableHead>
                  <TableHead>{t("Status")}</TableHead>
                  <TableHead className="text-right">{t("Amount")}</TableHead>
                  <TableHead className="text-right">{t("Attempt")}</TableHead>
                  <TableHead>{t("Decline code")}</TableHead>
                  <TableHead>{t("Next attempt")}</TableHead>
                  <TableHead>{t("Order")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {renewals.map((renewal) => {
                  const Icon = RENEWAL_STATUS_ICONS[renewal.status];

                  return (
                    <TableRow key={renewal.id}>
                      <TableCell className="whitespace-nowrap align-top">
                        <div className="flex flex-col">
                          <span suppressHydrationWarning>
                            {format.dateTime(renewal.periodStart, {
                              dateStyle: "short",
                            })}
                            {" → "}
                            {format.dateTime(renewal.periodEnd, {
                              dateStyle: "short",
                            })}
                          </span>
                          <span className="font-mono text-muted-foreground text-xs">
                            {renewal.id}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge
                          variant={
                            "failed" === renewal.status ||
                            "abandoned" === renewal.status
                              ? "destructive"
                              : "outline"
                          }
                        >
                          <Icon aria-hidden="true" />
                          {humaniseSubscriptionTerm(renewal.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right align-top tabular-nums">
                        {money(renewal.amount, renewal.currency)}
                      </TableCell>
                      <TableCell className="text-right align-top tabular-nums">
                        {renewal.attempt}
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="flex flex-col gap-1">
                          <FailureCode code={renewal.failureCode} />
                          {renewal.failureMessage ? (
                            // Provider-supplied text. Rendered as text, never
                            // as markup.
                            <span className="max-w-72 text-muted-foreground text-xs">
                              {renewal.failureMessage}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap align-top">
                        {renewal.nextAttemptAt ? (
                          <span suppressHydrationWarning>
                            {format.dateTime(renewal.nextAttemptAt, {
                              dateStyle: "short",
                              timeStyle: "short",
                            })}
                          </span>
                        ) : (
                          <Nothing />
                        )}
                      </TableCell>
                      <TableCell className="align-top">
                        {renewal.order ? (
                          <div className="flex flex-col">
                            <span className="font-mono text-xs">
                              {renewal.order.id}
                            </span>
                            <span className="text-muted-foreground text-xs">
                              {humaniseSubscriptionTerm(renewal.order.status)}
                              {" · "}
                              {money(
                                renewal.order.totalAmount,
                                renewal.order.currency,
                              )}
                            </span>
                          </div>
                        ) : (
                          <Nothing />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </CardContent>
    </Card>
  );
}

function PaymentsBehindRenewals({
  payments,
}: {
  payments: SubscriptionPaymentRow[];
}) {
  const t = useExtracted();
  const format = useFormatter();
  const money = useMoney();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Payments")}</CardTitle>
        <CardDescription>
          {t(
            "The charges behind those renewals, reached through the orders they produced. The transaction id is what to look up with the provider.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {payments.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <LucideReceipt aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>{t("No payments recorded")}</EmptyTitle>
              <EmptyDescription>
                {t(
                  "No renewal on this subscription has reached a charge yet, so there is nothing to look up with the provider.",
                )}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <TableContainer className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Provider")}</TableHead>
                  <TableHead>{t("Status")}</TableHead>
                  <TableHead className="text-right">{t("Amount")}</TableHead>
                  <TableHead>{t("Transaction id")}</TableHead>
                  <TableHead>{t("Created")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => {
                  const Icon = PAYMENT_STATUS_ICONS[payment.status];

                  return (
                    <TableRow key={payment.id}>
                      <TableCell className="align-top">
                        <div className="flex flex-col">
                          <span>{payment.provider}</span>
                          {payment.method ? (
                            <span className="text-muted-foreground text-xs">
                              {payment.method}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="flex flex-col gap-1">
                          <Badge
                            variant={
                              "failed" === payment.status
                                ? "destructive"
                                : "outline"
                            }
                          >
                            <Icon aria-hidden="true" />
                            {humaniseSubscriptionTerm(payment.status)}
                          </Badge>
                          {payment.failureReason ? (
                            <span className="max-w-64 text-muted-foreground text-xs">
                              {payment.failureReason}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right align-top tabular-nums">
                        <div className="flex flex-col">
                          <span>{money(payment.amount, payment.currency)}</span>
                          {payment.refundedAmount > 0 ? (
                            <span className="text-muted-foreground text-xs">
                              {t("{amount} refunded", {
                                amount: money(
                                  payment.refundedAmount,
                                  payment.currency,
                                ),
                              })}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="align-top">
                        {/* [!] The provider's transaction id. Legitimate here
                            and nowhere a customer can see. It names a charge
                            that already happened; it cannot make another. */}
                        <span className="flex items-center gap-1">
                          <code className="select-all font-mono text-xs">
                            {payment.externalId}
                          </code>
                          <CopyButton value={payment.externalId} />
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap align-top">
                        <span suppressHydrationWarning>
                          {format.dateTime(payment.createdAt, {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </CardContent>
    </Card>
  );
}

function PaymentMethods({
  methods,
}: {
  methods: SubscriptionDetail["paymentMethods"];
}) {
  const t = useExtracted();
  const format = useFormatter();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Payment methods on file")}</CardTitle>
        <CardDescription>
          {t(
            "Display material only. The credential token these point at is never shown.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {methods.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <LucideCreditCard aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>{t("Nothing on file")}</EmptyTitle>
              <EmptyDescription>
                {t(
                  "This customer has no stored credential, so an automatic renewal has nothing to charge.",
                )}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col gap-3">
            {methods.map((method) => (
              <li
                key={method.id}
                className="flex flex-wrap items-center gap-2 text-sm"
              >
                <span className="font-medium">
                  {method.brand ?? method.type}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {method.last4 ? `•••• ${method.last4}` : t("no last four")}
                </span>
                {method.expMonth && method.expYear ? (
                  <span className="text-muted-foreground tabular-nums">
                    {t("expires {month}/{year}", {
                      month: String(method.expMonth).padStart(2, "0"),
                      year: String(method.expYear),
                    })}
                  </span>
                ) : null}
                {method.named ? <Badge>{t("Named")}</Badge> : null}
                {method.isDefault ? (
                  <Badge variant="outline">{t("Default")}</Badge>
                ) : null}
                {method.detachedAt ? (
                  <Badge variant="secondary">{t("Detached")}</Badge>
                ) : null}
                {method.invalidAt ? (
                  <Badge variant="destructive" className="gap-1">
                    {t("Invalid since {date}", {
                      date: format.dateTime(method.invalidAt, {
                        dateStyle: "short",
                      }),
                    })}
                    {method.invalidReason ? ` · ${method.invalidReason}` : null}
                  </Badge>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function SubscriptionAside({
  subscription,
}: {
  subscription: SubscriptionDetail;
}) {
  const t = useExtracted();
  const format = useFormatter();
  const money = useMoney();
  const now = useNow({ updateInterval: 60_000 });

  const Status = SUBSCRIPTION_STATUS_ICONS[subscription.status];

  return (
    <aside className="lg:scrollbar-none flex flex-col gap-6 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-11rem)] lg:overflow-y-auto lg:border-s lg:ps-6">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge
          variant={
            "past_due" === subscription.status ||
            "suspended" === subscription.status
              ? "destructive"
              : "outline"
          }
        >
          <Status aria-hidden="true" />
          {humaniseSubscriptionTerm(subscription.status)}
        </Badge>
        <Badge variant={subscription.autoRenew ? "outline" : "secondary"}>
          {subscription.autoRenew ? t("Auto-renew on") : t("Auto-renew off")}
        </Badge>
        {subscription.mandateAcceptedAt ? null : (
          <Badge variant="secondary">{t("No mandate")}</Badge>
        )}
      </div>

      <Separator />

      <dl className="flex flex-col gap-5">
        <Row label={t("Customer")}>
          <NextLink
            className="underline decoration-dotted underline-offset-4"
            href={paths.admin.users.overview.getHref(subscription.customer.id)}
          >
            {subscription.customer.email}
          </NextLink>
        </Row>

        <Row label={t("Subject")}>
          {/* A subscription outlives its subject on purpose, so this is
              routinely a server that no longer exists. */}
          {subscription.subjectName ? (
            <span>{subscription.subjectName}</span>
          ) : (
            <span className="text-muted-foreground">
              {t("Gone — the subject no longer exists")}
            </span>
          )}
          <div className="font-mono text-muted-foreground text-xs">
            {subscription.subjectType} · {subscription.subjectId}
          </div>
        </Row>

        <Row label={t("Current period")}>
          <span suppressHydrationWarning>
            {format.dateTime(subscription.currentPeriodStart, {
              dateStyle: "short",
            })}
            {" → "}
            {format.dateTime(subscription.currentPeriodEnd, {
              dateStyle: "short",
            })}
          </span>
          <div
            className="text-muted-foreground text-xs"
            suppressHydrationWarning
          >
            {format.relativeTime(subscription.currentPeriodEnd, now)}
          </div>
        </Row>

        <Row label={t("Interval")}>
          {t("{months} months", {
            months: String(subscription.intervalMonths),
          })}
        </Row>

        <Row label={t("Agreed price")}>
          {subscription.agreedPrice ? (
            <div className="flex flex-col">
              <span>
                {t("{amount} on renewal", {
                  amount: money(
                    subscription.agreedPrice.renewalPrice,
                    subscription.currency,
                  ),
                })}
              </span>
              <span className="text-muted-foreground text-xs">
                {subscription.agreedPrice.planName ??
                  subscription.agreedPrice.id}
                {" · "}
                {t("{amount} at signup", {
                  amount: money(
                    subscription.agreedPrice.purchasePrice,
                    subscription.currency,
                  ),
                })}
              </span>
              {/* The distinction that stops an operator quoting the wrong
                  number after an upgrade. */}
              <span className="text-muted-foreground text-xs">
                {t(
                  "What was agreed at signup. A renewal is quoted from the price locked to the server.",
                )}
              </span>
            </div>
          ) : (
            <Nothing />
          )}
        </Row>

        <Row label={t("Mandate")}>
          {subscription.mandateAcceptedAt ? (
            <div className="flex flex-col">
              <span suppressHydrationWarning>
                {format.dateTime(subscription.mandateAcceptedAt, {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </span>
              <span className="text-muted-foreground text-xs">
                {t("wording {version}", {
                  version: subscription.mandateTextVersion ?? "—",
                })}
              </span>
            </div>
          ) : (
            <span className="text-muted-foreground">
              {t("No consent recorded to charge off-session.")}
            </span>
          )}
        </Row>

        {subscription.cancelledAt || subscription.cancelReason ? (
          <Row label={t("Cancelled")}>
            <div className="flex flex-col">
              {subscription.cancelledAt ? (
                <span suppressHydrationWarning>
                  {format.dateTime(subscription.cancelledAt, {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </span>
              ) : null}
              {subscription.cancelReason ? (
                <span className="font-mono text-muted-foreground text-xs">
                  {subscription.cancelReason}
                </span>
              ) : null}
            </div>
          </Row>
        ) : null}

        {subscription.endedAt ? (
          <Row label={t("Ended")}>
            <span suppressHydrationWarning>
              {format.dateTime(subscription.endedAt, {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </span>
          </Row>
        ) : null}

        <Row label={t("Opened")}>
          <span suppressHydrationWarning>
            {format.dateTime(subscription.createdAt, {
              dateStyle: "short",
              timeStyle: "short",
            })}
          </span>
        </Row>
      </dl>

      <Separator />

      {/* Said out loud, because a support tool that looks like it has buttons
          is a support tool somebody will go looking for buttons in. */}
      <p className="text-muted-foreground text-sm leading-6">
        {t(
          "This page is read-only. Retrying a collection, granting time or cancelling all happen elsewhere.",
        )}
      </p>
    </aside>
  );
}

export function SubscriptionDetailView({
  subscription,
}: {
  subscription: SubscriptionDetail;
}) {
  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-w-0 flex-col gap-6">
        <RenewalHistory renewals={subscription.renewals} />
        <PaymentsBehindRenewals payments={subscription.payments} />
        <PaymentMethods methods={subscription.paymentMethods} />
      </div>
      <SubscriptionAside subscription={subscription} />
    </div>
  );
}
