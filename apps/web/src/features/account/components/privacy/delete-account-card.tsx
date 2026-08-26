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
import { Alert, AlertDescription } from "@virtbase/ui/alert";
import { Button } from "@virtbase/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@virtbase/ui/card";
import { Field, FieldLabel } from "@virtbase/ui/field";
import {
  LucideAlertOctagon,
  LucideFileText,
  LucideServer,
  LucideTimer,
} from "@virtbase/ui/icons";
import { Input } from "@virtbase/ui/input";
import { ResponsiveDialog } from "@virtbase/ui/responsive-dialog";
import { Skeleton } from "@virtbase/ui/skeleton";
import { Spinner } from "@virtbase/ui/spinner";
import {
  ACCOUNT_DELETION_GRACE_PERIOD_DAYS,
  INVOICE_RETENTION_YEARS,
} from "@virtbase/utils";
import { useExtracted, useFormatter } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { ItemRow } from "@/features/account/components/item-row";
import { StepUpDialog } from "@/features/account/components/step-up-dialog";
import {
  useCancelDeletion,
  useDeletionStatus,
  useRequestDeletion,
} from "@/features/account/hooks/privacy/deletion";

/** Typed in full to confirm. A checkbox is too easy to click by accident. */
const CONFIRMATION_PHRASE = "DELETE";

export function DeleteAccountCard() {
  const t = useExtracted();
  const format = useFormatter();

  const { data: status, isPending: isLoading } = useDeletionStatus();
  const requestDeletion = useRequestDeletion();
  const cancelDeletion = useCancelDeletion();

  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isStepUpOpen, setIsStepUpOpen] = useState(false);
  const [typed, setTyped] = useState("");

  const request = async () => {
    try {
      await requestDeletion.mutateAsync();
      setIsConfirmOpen(false);
      setIsStepUpOpen(false);
      setTyped("");
      toast.success(t("Check your email to confirm."));
    } catch (error) {
      const message = error instanceof Error ? error.message : "";

      if (message.includes("STEP_UP_REQUIRED")) {
        setIsConfirmOpen(false);
        setIsStepUpOpen(true);
        return;
      }
      if (message.includes("DELETION_BLOCKED")) {
        toast.error(t("Settle your open invoices first."));
        return;
      }
      toast.error(message || t("Something went wrong."));
    }
  };

  const isScheduled = Boolean(status?.scheduled_at);
  const isInProgress = Boolean(status?.in_progress);

  return (
    <>
      <Card
        className={cn(
          "overflow-hidden pb-0 transition-colors",
          !isLoading &&
            (isScheduled || isInProgress) &&
            "border-destructive/40",
        )}
      >
        <CardHeader>
          <CardTitle>{t("Delete Your Account")}</CardTitle>
          <CardDescription>
            {t(
              "Permanently closes your account and destroys every server on it.",
            )}
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : isInProgress ? (
            <Alert variant="destructive" className="text-destructive">
              <LucideAlertOctagon />
              <AlertDescription className="text-destructive">
                {t(
                  "Your account is being deleted right now. This can no longer be stopped.",
                )}
              </AlertDescription>
            </Alert>
          ) : isScheduled ? (
            <Alert variant="destructive" className="text-destructive">
              <LucideAlertOctagon />
              <AlertDescription className="text-destructive">
                {t(
                  "Everything is deleted on {date}. You can still stop this.",
                  {
                    date: format.dateTime(status?.scheduled_at ?? new Date(), {
                      dateStyle: "long",
                    }),
                  },
                )}
              </AlertDescription>
            </Alert>
          ) : status?.blocked ? (
            <Alert variant="destructive" className="text-destructive">
              <LucideAlertOctagon />
              <AlertDescription className="text-destructive">
                {status.blockers.unpaidInvoices > 0
                  ? t(
                      "You have {count} unpaid invoice(s). Please settle them before deleting your account.",
                      { count: `${status.blockers.unpaidInvoices}` },
                    )
                  : t(
                      "An order is still being processed. This usually takes a few minutes.",
                    )}
              </AlertDescription>
            </Alert>
          ) : null}

          {!isLoading && !isInProgress && (
            <div>
              <ItemRow
                icon={<LucideServer className="size-6 shrink-0" />}
                rightSide={null}
              >
                <p className="font-medium text-sm">{t("Your servers")}</p>
                <p className="text-muted-foreground text-sm leading-none">
                  {t(
                    "{count} server(s) will be destroyed, with all their data.",
                    {
                      count: `${status?.servers ?? 0}`,
                    },
                  )}
                </p>
              </ItemRow>
              <ItemRow
                icon={<LucideFileText className="size-6 shrink-0" />}
                rightSide={null}
              >
                <p className="font-medium text-sm">{t("Your invoices")}</p>
                <p className="text-muted-foreground text-sm leading-none">
                  {t(
                    "Kept for {years} years, as German tax law requires. Nothing else is.",
                    { years: `${INVOICE_RETENTION_YEARS}` },
                  )}
                </p>
              </ItemRow>
              <ItemRow
                icon={<LucideTimer className="size-6 shrink-0" />}
                rightSide={null}
              >
                <p className="font-medium text-sm">{t("Your grace period")}</p>
                <p className="text-muted-foreground text-sm leading-none">
                  {t(
                    "{days} days to change your mind after confirming by email.",
                    { days: `${ACCOUNT_DELETION_GRACE_PERIOD_DAYS}` },
                  )}
                </p>
              </ItemRow>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex-wrap justify-between gap-4 border-t bg-background [.border-t]:p-6">
          <p className="text-muted-foreground text-sm">
            {isScheduled
              ? t("Signing in will not stop this on its own.")
              : t(
                  "We email you a link first. Nothing is deleted until you use it.",
                )}
          </p>
          {isScheduled ? (
            <Button
              size="sm"
              onClick={() =>
                cancelDeletion
                  .mutateAsync()
                  .then(() => toast.success(t("Your account will be kept.")))
                  .catch(() => toast.error(t("Something went wrong.")))
              }
              disabled={cancelDeletion.isPending}
            >
              {cancelDeletion.isPending ? <Spinner /> : t("Keep My Account")}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setIsConfirmOpen(true)}
              disabled={status?.blocked || isInProgress}
            >
              {t("Delete My Account")}
            </Button>
          )}
        </CardFooter>
      </Card>

      <ResponsiveDialog
        open={isConfirmOpen}
        onOpenChange={setIsConfirmOpen}
        title={t("Delete Your Account")}
        description={t("Delete Your Account")}
        footer={
          <>
            <Button variant="outline" onClick={() => setIsConfirmOpen(false)}>
              {t("Cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={request}
              disabled={
                typed !== CONFIRMATION_PHRASE || requestDeletion.isPending
              }
            >
              {requestDeletion.isPending && <Spinner />}
              {t("Email Me The Link")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-balance text-center text-muted-foreground text-sm">
            {t(
              "We will email you a link to confirm. Nothing is deleted until you use it.",
            )}
          </p>
          <Field>
            <FieldLabel htmlFor="delete-confirmation">
              {t("Type {phrase} to continue", { phrase: CONFIRMATION_PHRASE })}
            </FieldLabel>
            <Input
              id="delete-confirmation"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoFocus={false}
            />
          </Field>
        </div>
      </ResponsiveDialog>

      <StepUpDialog
        open={isStepUpOpen}
        onOpenChange={setIsStepUpOpen}
        onSatisfied={request}
      />
    </>
  );
}
