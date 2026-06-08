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
import { Input } from "@virtbase/ui/input";
import { Skeleton } from "@virtbase/ui/skeleton";
import { Spinner } from "@virtbase/ui/spinner";
import { useExtracted } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth/client";
import { paths } from "@/lib/paths";

export function UserEmailCard() {
  const t = useExtracted();

  const { data, isPending } = authClient.useSession();

  const [value, setValue] = useState("");
  const [isUpdating, startTransition] = useTransition();

  const updateEmail = async (newEmail: string) => {
    startTransition(async () => {
      await authClient.changeEmail({
        newEmail,
        callbackURL: paths.app.account.settings.getHref(),
        fetchOptions: {
          onSuccess: () => {
            toast.success(
              t(
                "A confirmation email has been sent to your new email address.",
              ),
            );
          },
          onError: ({ error }) => {
            toast.error(error.message);
          },
        },
      });
    });
  };

  useEffect(() => {
    if (data?.user && !isPending) {
      setValue(data.user.email);
    }
  }, [data?.user, isPending]);

  return (
    <form
      id="update-email-form"
      onSubmit={(e) => {
        e.preventDefault();
        void updateEmail(value);
      }}
    >
      <Card id="email" className="overflow-hidden pb-0">
        <CardHeader>
          <CardTitle>{t("Change Email")}</CardTitle>
          <CardDescription>
            {t("Please enter your new email address.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data?.user && !isPending ? (
            <Input
              name="user-email"
              className="max-w-md"
              autoFocus={false}
              autoComplete="email"
              type="email"
              required
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={isPending || isUpdating}
              placeholder="janic@virtbase.com"
              title={t("Email")}
            />
          ) : (
            <Skeleton className="h-9 w-full max-w-md" />
          )}
        </CardContent>
        <CardFooter className="border-t bg-background [.border-t]:p-6">
          <div className="flex w-full flex-col items-center justify-center gap-4 lg:flex-row lg:justify-between">
            <p className="text-center text-muted-foreground text-sm">
              {t("Please enter a valid email address.")}
            </p>
            <Button
              size="sm"
              type="submit"
              form="update-email-form"
              disabled={isUpdating || !value}
            >
              {isUpdating && <Spinner />} {t("Save")}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </form>
  );
}
