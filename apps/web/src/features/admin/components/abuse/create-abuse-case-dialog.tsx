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
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@virtbase/ui/field";
import { Input } from "@virtbase/ui/input";
import { ResponsiveDialog } from "@virtbase/ui/responsive-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@virtbase/ui/select";
import { Spinner } from "@virtbase/ui/spinner";
import { Switch } from "@virtbase/ui/switch";
import { Textarea } from "@virtbase/ui/textarea";
import { useRouter } from "next/navigation";
import { useExtracted } from "next-intl";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { toast } from "sonner";
import { paths } from "@/lib/paths";
import { createAbuseCaseAction } from "../../api/abuse/manage-abuse-cases";

const CATEGORIES = [
  "spam",
  "phishing",
  "malware",
  "port_scan",
  "ddos",
  "copyright",
  "compromised",
  "other",
] as const;

const SEVERITIES = ["low", "medium", "high", "critical"] as const;

export function CreateAbuseCaseDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useExtracted();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [category, setCategory] =
    useState<(typeof CATEGORIES)[number]>("other");
  const [severity, setSeverity] =
    useState<(typeof SEVERITIES)[number]>("medium");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [notify, setNotify] = useState(true);

  // No success toast: the dialog closes and the case page opens.
  const create = useAction(createAbuseCaseAction, {
    onSuccess: ({ data }) => {
      onOpenChange(false);
      if (data?.id) router.push(paths.admin.abuseCase.getHref(data.id));
    },
    onError: ({ error }) =>
      toast.error(error.serverError ?? t("Something went wrong.")),
  });

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("Open case")}
      description={t("Files a case by hand, the way a report would.")}
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t("Cancel")}
          </Button>
          <Button
            type="button"
            disabled={create.isPending}
            onClick={() =>
              create.execute({
                email,
                category,
                severity,
                title,
                summary,
                notifyCustomer: notify,
                responseHours: 24,
              })
            }
          >
            {create.isPending && <Spinner />} {t("Open case")}
          </Button>
        </>
      }
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="case-email">{t("Customer")}</FieldLabel>
          <Input
            id="case-email"
            type="email"
            value={email}
            autoComplete="off"
            placeholder="customer@example.com"
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="case-title">{t("Title")}</FieldLabel>
          <Input
            id="case-title"
            value={title}
            autoComplete="off"
            placeholder={t("Outbound spam from 203.0.113.5")}
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>

        <Field>
          <FieldLabel htmlFor="case-category">{t("Category")}</FieldLabel>
          <Select
            value={category}
            onValueChange={(value) =>
              setCategory(value as (typeof CATEGORIES)[number])
            }
          >
            <SelectTrigger id="case-category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((value) => (
                <SelectItem key={value} value={value}>
                  {value.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor="case-severity">{t("Severity")}</FieldLabel>
          <Select
            value={severity}
            onValueChange={(value) =>
              setSeverity(value as (typeof SEVERITIES)[number])
            }
          >
            <SelectTrigger id="case-severity">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEVERITIES.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <FieldLabel htmlFor="case-summary">{t("What happened")}</FieldLabel>
          <Textarea
            id="case-summary"
            rows={5}
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
          />
          <FieldDescription>
            {t("Shown to the customer. Leave out the reporter's identity.")}
          </FieldDescription>
        </Field>

        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor="case-notify">{t("Notify now")}</FieldLabel>
            <FieldDescription>
              {t("Emails the customer and starts a 24 hour deadline.")}
            </FieldDescription>
          </FieldContent>
          <Switch
            id="case-notify"
            checked={notify}
            onCheckedChange={setNotify}
          />
        </Field>
      </FieldGroup>
    </ResponsiveDialog>
  );
}
