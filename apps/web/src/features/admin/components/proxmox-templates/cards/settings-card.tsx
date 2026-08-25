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
import { Spinner } from "@virtbase/ui/spinner";
import { useExtracted } from "next-intl";

interface SettingsCardProps {
  id: string;
  title: string;
  description: string;
  /** The one line of guidance, shown beside the save button. */
  hint?: string;
  isPending?: boolean;
  disabled?: boolean;
  onSubmit: () => void;
  children: React.ReactNode;
}

/**
 * One editable concern, saved on its own.
 *
 * The same shape the account settings use: header explains the section, footer
 * carries the single line of guidance next to the button, and nothing is
 * annotated field by field.
 */
export function SettingsCard({
  id,
  title,
  description,
  hint,
  isPending = false,
  disabled = false,
  onSubmit,
  children,
}: SettingsCardProps) {
  const t = useExtracted();

  return (
    <form
      id={id}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <Card className="overflow-hidden pb-0">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
        <CardFooter className="border-t bg-background [.border-t]:p-6">
          <div className="flex w-full flex-col items-center justify-center gap-4 lg:flex-row lg:justify-between">
            <p className="text-center text-muted-foreground text-sm">
              {hint ?? ""}
            </p>
            <Button
              size="sm"
              type="submit"
              form={id}
              disabled={isPending || disabled}
            >
              {isPending && <Spinner />} {t("Save")}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </form>
  );
}
