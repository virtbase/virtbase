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
  CardHeader,
  CardTitle,
} from "@virtbase/ui/card";
import { headers } from "next/headers";
import { useExtracted } from "next-intl";
import { cache } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { auth } from "@/lib/auth/server";
import { UserProvidersList } from "./user-providers-list";

const getProvidersList = cache((headers: Headers) => {
  return Promise.all([
    auth.api.getSession({ headers }).then((data) => data?.user ?? null),
    auth.api.listUserAccounts({ headers }),
  ]);
});

export function UserProvidersCard() {
  const t = useExtracted();

  const headersPromise = headers();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("Authentication Methods")}</CardTitle>
        <CardDescription>
          {t(
            "Configure how you can sign in to your account. Link your accounts for a seamless, secure authentication experience.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/** TODO: Add generic error fallback */}
        <ErrorBoundary fallback={null}>
          <UserProvidersList
            promise={headersPromise.then((headers) =>
              getProvidersList(headers),
            )}
          />
        </ErrorBoundary>
      </CardContent>
    </Card>
  );
}
