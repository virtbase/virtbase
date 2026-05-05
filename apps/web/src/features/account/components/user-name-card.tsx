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
import { authClient } from "@/lib/auth/client";

export function UserNameCard() {
  const t = useExtracted();

  const { data, isPending } = authClient.useSession();

  const [value, setValue] = useState("");
  const [isUpdating, startTransition] = useTransition();

  const updateName = async (name: string) => {
    startTransition(async () => {
      await authClient.updateUser({
        name,
      });
    });
  };

  useEffect(() => {
    if (data?.user && !isPending) {
      setValue(data.user.name);
    }
  }, [data?.user, isPending]);

  return (
    <form
      id="update-name-form"
      onSubmit={(e) => {
        e.preventDefault();
        void updateName(value);
      }}
    >
      <Card className="overflow-hidden pb-0">
        <CardHeader>
          <CardTitle>{t("Display Name")}</CardTitle>
          <CardDescription>
            {t(
              "Please enter your full name, or a display name you are comfortable with.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data?.user && !isPending ? (
            <Input
              className="max-w-md"
              autoFocus={false}
              autoComplete="name"
              minLength={1}
              maxLength={32}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={isPending || isUpdating}
            />
          ) : (
            <Skeleton className="h-9 w-full max-w-md" />
          )}
        </CardContent>
        <CardFooter className="border-t bg-background [.border-t]:p-6">
          <div className="flex w-full flex-col items-center justify-center gap-4 lg:flex-row lg:justify-between">
            <p className="text-center text-muted-foreground text-sm">
              {t("Please use 32 characters at maximum.")}
            </p>
            <Button
              size="sm"
              type="submit"
              form="update-name-form"
              disabled={isUpdating}
            >
              {isUpdating && <Spinner />} {t("Save")}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </form>
  );
}
