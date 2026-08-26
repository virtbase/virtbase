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
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
  LucideDownload,
  LucideFileArchive,
  LucideKeyRound,
} from "@virtbase/ui/icons";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@virtbase/ui/input-group";
import { Skeleton } from "@virtbase/ui/skeleton";
import { Spinner } from "@virtbase/ui/spinner";
import { formatBytes } from "@virtbase/utils";
import { useExtracted, useFormatter, useNow } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { ItemRow } from "@/features/account/components/item-row";
import { StepUpDialog } from "@/features/account/components/step-up-dialog";
import {
  useLatestDataExport,
  useRequestDataExport,
} from "@/features/account/hooks/privacy/data-export";
import { CopyButton } from "@/ui/copy-button";

export function DataExportCard() {
  const t = useExtracted();
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });

  const { data, isPending: isLoading } = useLatestDataExport();
  const requestExport = useRequestDataExport();

  const [isStepUpOpen, setIsStepUpOpen] = useState(false);
  /**
   * Held here and nowhere else, because there is nowhere else it could live.
   * It is not stored against the export, not in the email, and not
   * recoverable - a customer who loses it requests a new one.
   */
  const [passphrase, setPassphrase] = useState<string | null>(null);

  const current = data?.export ?? null;
  const isBuilding =
    current?.status === "pending" || current?.status === "building";

  /**
   * [!] Built here rather than in a helper that takes `t`.
   *
   * Message extraction only sees literals at a `useExtracted()` call site and
   * cannot follow a translator passed as an argument - so a `statusLabel(status,
   * t)` helper compiles, extracts nothing, and fails at runtime with
   * MISSING_MESSAGE. Same constraint the integration `localize()` hook is built
   * around.
   */
  const statusLabels: Record<string, string> = {
    pending: t("Preparing your export"),
    building: t("Preparing your export"),
    ready: t("Your export is ready"),
    failed: t("Your export could not be built"),
    expired: t("Your export has expired"),
  };

  const request = async () => {
    try {
      const result = await requestExport.mutateAsync();
      setPassphrase(result.passphrase);
      setIsStepUpOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";

      if (message.includes("STEP_UP_REQUIRED")) {
        setIsStepUpOpen(true);
        return;
      }
      if (message.includes("EXPORT_ALREADY_REQUESTED")) {
        toast.error(
          t(
            "You already requested an export today. Please try again tomorrow.",
          ),
        );
        return;
      }
      toast.error(message || t("Something went wrong."));
    }
  };

  return (
    <>
      <Card className="overflow-hidden pb-0">
        <CardHeader>
          <CardTitle>{t("Download Your Data")}</CardTitle>
          <CardDescription>
            {t(
              "Request a copy of everything stored about your account, including a PDF of every invoice.",
            )}
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          {passphrase && (
            <div className="flex flex-col gap-2">
              <p className="font-medium text-sm">
                {t("Save this passphrase now")}
              </p>
              <InputGroup className="max-w-md">
                <InputGroupInput
                  name="export-passphrase"
                  value={passphrase}
                  readOnly
                />
                <InputGroupAddon align="inline-end">
                  <CopyButton
                    value={passphrase}
                    successMessage={t("Passphrase copied to clipboard!")}
                  />
                </InputGroupAddon>
              </InputGroup>
              <p className="text-muted-foreground text-sm">
                {t(
                  "It opens your export. We never send it by email and cannot recover it.",
                )}
              </p>
            </div>
          )}

          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : current ? (
            <ItemRow
              icon={
                isBuilding ? (
                  <Spinner className="size-6 shrink-0" />
                ) : (
                  <LucideFileArchive className="size-6 shrink-0" />
                )
              }
              rightSide={
                current.status === "ready" ? (
                  <Button asChild variant="outline" size="sm">
                    <a href={`/api/privacy/exports/${current.id}`} download>
                      <LucideDownload />
                      {t("Download")}
                    </a>
                  </Button>
                ) : null
              }
            >
              <p className="font-medium text-sm">
                {statusLabels[current.status]}
              </p>
              <p className="text-muted-foreground text-sm leading-none">
                {current.status === "ready" && current.byte_size
                  ? t("{size}, available until {date}", {
                      size: formatBytes(current.byte_size, {
                        formatter: format,
                      }),
                      date: format.dateTime(current.expires_at, {
                        dateStyle: "long",
                      }),
                    })
                  : current.status === "failed"
                    ? t("Please try again, or contact support.")
                    : t("Requested {date}", {
                        date: format.relativeTime(current.created_at, now),
                      })}
              </p>
            </ItemRow>
          ) : (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <LucideFileArchive aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>{t("No exports")}</EmptyTitle>
                <EmptyDescription>
                  {t("You have not requested an export of your data yet.")}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>

        <CardFooter className="flex-wrap justify-between gap-4 border-t bg-background [.border-t]:p-6">
          <p className="text-muted-foreground text-sm">
            <LucideKeyRound className="mr-1.5 inline size-3.5 align-[-2px]" />
            {t("Your export is encrypted with a passphrase shown only once.")}
          </p>
          <Button
            onClick={request}
            disabled={requestExport.isPending || isBuilding}
            size="sm"
          >
            {requestExport.isPending || isBuilding ? (
              <Spinner />
            ) : (
              t("Request Export")
            )}
          </Button>
        </CardFooter>
      </Card>

      <StepUpDialog
        open={isStepUpOpen}
        onOpenChange={setIsStepUpOpen}
        onSatisfied={request}
      />
    </>
  );
}
