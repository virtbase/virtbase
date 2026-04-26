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

import { Button } from "@virtbase/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@virtbase/ui/card";
import { LucideBook } from "@virtbase/ui/icons";
import { Skeleton } from "@virtbase/ui/skeleton";
import { PUBLIC_DOMAIN } from "@virtbase/utils";
import { headers } from "next/headers";
import { useExtracted } from "next-intl";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { auth } from "@/lib/auth/server";
import { HydrateClient } from "@/lib/trpc/server";
import { GenericError } from "@/ui/generic-error";
import { ApiKeysList } from "./api-keys-list";
import { CreateApiKeyButton } from "./create-api-key-button";

export function APIKeysCard() {
  const t = useExtracted();

  const headersPromise = headers();

  return (
    <Card className="overflow-hidden pb-0">
      <CardHeader>
        <CardTitle className="text-lg">{t("API Keys")}</CardTitle>
        <CardDescription>
          {t("Create and manage API keys for use with the public API.")}
        </CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" asChild>
            <a
              href={`${PUBLIC_DOMAIN}/api/docs`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <LucideBook
                aria-hidden="true"
                className="text-muted-foreground"
              />
              {t("API Documentation")}
            </a>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <HydrateClient>
          <ErrorBoundary fallback={<GenericError className="border" />}>
            <Suspense fallback={<Skeleton className="-m-px h-72 w-full" />}>
              <ApiKeysList
                promise={headersPromise.then((headers) =>
                  auth.api
                    .listApiKeys({ headers })
                    .then((data) => data.apiKeys),
                )}
              />
            </Suspense>
          </ErrorBoundary>
        </HydrateClient>
      </CardContent>
      <CardFooter className="border-t bg-background [.border-t]:p-6">
        <div className="flex w-full flex-col items-center justify-center gap-4 lg:flex-row lg:justify-between">
          <p className="text-center text-muted-foreground text-sm">
            {t("Multiple API keys can be used for authentication.")}
          </p>
          <CreateApiKeyButton />
        </div>
      </CardFooter>
    </Card>
  );
}
