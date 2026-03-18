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
import { useExtracted } from "next-intl";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { defaultGetSSHKeysListQuery } from "@/features/account/hooks/ssh-keys/ssh-keys-list";
import { HydrateClient, prefetch, trpc } from "@/lib/trpc/server";
import { CreateSSHKeyButton } from "./create-ssh-key-button";
import { SSHKeysList } from "./ssh-keys-list";

export function SSHKeysCard() {
  const t = useExtracted();

  void prefetch(trpc.sshKeys.list.queryOptions(defaultGetSSHKeysListQuery));

  return (
    <Card className="overflow-hidden pb-0">
      <CardHeader>
        <CardTitle className="text-lg">{t("SSH Keys")}</CardTitle>
        <CardDescription>
          {t("Create and manage SSH keys for use during installation.")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <HydrateClient>
          {/** TODO: Add generic error fallback */}
          <ErrorBoundary fallback={null}>
            <Suspense fallback={<Skeleton className="-m-px h-72 w-full" />}>
              <SSHKeysList />
            </Suspense>
          </ErrorBoundary>
        </HydrateClient>
      </CardContent>
      <CardFooter className="border-t bg-background [.border-t]:p-6">
        <div className="flex w-full flex-col items-center justify-center gap-4 lg:flex-row lg:justify-between">
          <p className="text-center text-muted-foreground text-sm">
            {t.rich(
              "Multiple SSH keys in <openssh>OpenSSH format</openssh> are supported.",
              {
                openssh: (chunks) => (
                  <a
                    href="https://datatracker.ietf.org/doc/html/rfc4253"
                    className="text-foreground underline decoration-dotted transition-colors hover:text-foreground/80"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {chunks}
                  </a>
                ),
              },
            )}
          </p>
          <CreateSSHKeyButton />
        </div>
      </CardFooter>
    </Card>
  );
}
