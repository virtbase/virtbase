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
import { Skeleton } from "@virtbase/ui/skeleton";
import { headers } from "next/headers";
import { useExtracted } from "next-intl";
import { cache, Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { auth } from "@/lib/auth/server";
import { GenericError } from "@/ui/generic-error";
import { UserSessionsList } from "./user-sessions-list";

const getSessionsList = cache((headers: Headers) => {
  return Promise.all([
    auth.api.getSession({ headers }).then((data) => data?.session ?? null),
    auth.api.listSessions({ headers }).then((sessions) =>
      // Don't show sessions that are impersonated
      sessions.filter(
        (session) =>
          !(session as unknown as { impersonatedBy: string | null })
            .impersonatedBy,
      ),
    ),
  ]);
});

export function UserSessionsCard() {
  const t = useExtracted();

  const headersPromise = headers();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("Active Sessions")}</CardTitle>
        <CardDescription>
          {t(
            "Sessions show currently logged in devices. They can be revoked at any time.",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ErrorBoundary fallback={<GenericError className="border" />}>
          <Suspense fallback={<Skeleton className="-m-px h-72 w-full" />}>
            <UserSessionsList
              promises={headersPromise.then((heads) => getSessionsList(heads))}
            />
          </Suspense>
        </ErrorBoundary>
      </CardContent>
    </Card>
  );
}
