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

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@virtbase/ui/card";
import { Skeleton } from "@virtbase/ui/skeleton";
import { headers } from "next/headers";
import { useExtracted } from "next-intl";
import { cache, Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { auth } from "@/lib/auth/server";
import { AddPasskeyButton } from "./add-passkey-button";
import { UserPasskeysList } from "./user-passkeys-list";

const getPasskeysList = cache((headers: Headers) => {
  return auth.api.listPasskeys({ headers });
});

export function UserPasskeysCard() {
  const t = useExtracted();

  const headersPromise = headers();

  return (
    <Card
      id="passkeys"
      className="overflow-hidden pb-0"
      data-testid="passkeys-card"
    >
      <CardHeader>
        <CardTitle className="text-lg">{t("Passkeys")}</CardTitle>
        <CardDescription>
          {t(
            "Passkeys are a highly secure alternative to passwords. Register a new passkey or use an existing one.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/** TODO: Add generic error fallback */}
        <ErrorBoundary fallback={null}>
          <Suspense fallback={<Skeleton className="-m-px h-48 w-full" />}>
            <UserPasskeysList
              promise={headersPromise.then((headers) =>
                getPasskeysList(headers),
              )}
            />
          </Suspense>
        </ErrorBoundary>
      </CardContent>
      <CardFooter className="border-t bg-background [.border-t]:p-6">
        <div className="flex w-full flex-col items-center justify-center gap-4 md:flex-row md:justify-between">
          <p
            className="text-center text-muted-foreground text-sm"
            data-testid="passkeys-card-hint"
          >
            {t("Multiple passkeys can be used for authentication.")}
          </p>
          <AddPasskeyButton />
        </div>
      </CardFooter>
    </Card>
  );
}
