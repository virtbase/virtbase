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

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@virtbase/ui/card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@virtbase/ui/input-group";
import { Skeleton } from "@virtbase/ui/skeleton";
import { APP_NAME } from "@virtbase/utils";
import { useExtracted } from "next-intl";
import { authClient } from "@/lib/auth/client";
import { CopyButton } from "@/ui/copy-button";

export function UserIdCard() {
  const t = useExtracted();

  const { data, isPending } = authClient.useSession();

  return (
    <Card className="overflow-hidden pb-0">
      <CardHeader>
        <CardTitle>{t("Your User ID")}</CardTitle>
        <CardDescription>
          {t("This your unique account identifier on {appName}.", {
            appName: APP_NAME,
          })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data?.user && !isPending ? (
          <InputGroup className="max-w-md">
            <InputGroupInput value={data.user.id} readOnly />
            <InputGroupAddon align="inline-end">
              <CopyButton value={data.user.id} />
            </InputGroupAddon>
          </InputGroup>
        ) : (
          <Skeleton className="h-9 w-full max-w-md" />
        )}
      </CardContent>
      <CardFooter className="border-t bg-background [.border-t]:p-6">
        <p className="text-center text-muted-foreground text-sm">
          {t("This may be used to identify your account in the API.")}
        </p>
      </CardFooter>
    </Card>
  );
}
