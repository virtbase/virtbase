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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@virtbase/ui/empty";
import {
  LucideDownload,
  LucideFile,
  LucideFileCheck,
} from "@virtbase/ui/icons";
import { Separator } from "@virtbase/ui/separator";
import { Spinner } from "@virtbase/ui/spinner";
import { useExtracted, useFormatter } from "next-intl";
import { ItemRow } from "@/features/account/components/item-row";
import { useDownloadInvoice } from "../hooks/use-download-invoice";
import { useLatestInvoices } from "../hooks/use-latest-invoices";

export function LatestInvoicesList() {
  const t = useExtracted();
  const formatter = useFormatter();

  const {
    data: { invoices },
  } = useLatestInvoices();

  const { mutate: downloadInvoice, isPending: isDownloadingInvoice } =
    useDownloadInvoice();

  if (!invoices.length) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LucideFileCheck className="size-5" aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{t("No invoices")}</EmptyTitle>
          <EmptyDescription>
            {t("No invoices have been issued yet.")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return invoices.map((invoice) => (
    <ItemRow
      key={invoice.id}
      icon={<LucideFile className="size-6 shrink-0" />}
      rightSide={
        <Button
          variant="outline"
          size="sm"
          disabled={isDownloadingInvoice}
          onClick={() => downloadInvoice({ id: invoice.id })}
        >
          {isDownloadingInvoice ? (
            <Spinner />
          ) : (
            <LucideDownload aria-hidden="true" />
          )}
          <span className="max-md:sr-only">{t("Download")}</span>
        </Button>
      }
    >
      <p className="font-medium text-sm">{invoice.number}</p>
      <div className="flex gap-1">
        <p className="text-muted-foreground text-sm leading-none">
          {formatter.dateTime(invoice.created_at)}
        </p>
        <Separator
          orientation="vertical"
          className="data-[orientation=vertical]:h-4"
        />
        <p className="text-muted-foreground text-sm leading-none">
          {formatter.number(invoice.total / 100, {
            style: "currency",
            currency: "EUR",
          })}
        </p>
      </div>
    </ItemRow>
  ));
}
