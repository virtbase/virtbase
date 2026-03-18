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

import { cn } from "@virtbase/ui";
import { Badge } from "@virtbase/ui/badge";
import { Button } from "@virtbase/ui/button";
import {
  Discord,
  GithubCustom,
  Google,
  LucideMail,
  LucideRotateCcwKey,
} from "@virtbase/ui/icons";
import { Skeleton } from "@virtbase/ui/skeleton";
import { Spinner } from "@virtbase/ui/spinner";
import type { Account, User } from "better-auth/types";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useExtracted } from "next-intl";
import { Suspense, use, useTransition } from "react";
import { authClient } from "@/lib/auth/client";
import { paths } from "@/lib/paths";

const providers = [
  {
    icon: Google,
    provider: "google",
    name: "Google",
  },
  {
    icon: GithubCustom,
    provider: "github",
    name: "GitHub",
  },
  {
    icon: Discord,
    provider: "discord",
    name: "Discord",
  },
] as const;

export function UserProvidersList({
  promise,
}: {
  promise: Promise<[User | null, Account[]]>;
}) {
  const t = useExtracted();

  const manageLabel = t("Manage");

  return (
    <>
      <ItemRow
        icon={LucideMail}
        action={
          <Button size="sm" variant="outline" asChild>
            <NextLink
              href={`${paths.app.account.settings.getHref()}#email`}
              prefetch={false}
            >
              {manageLabel}
            </NextLink>
          </Button>
        }
      >
        <p className="font-medium text-sm">{t("Email")}</p>
        <Suspense fallback={<Skeleton className="h-5 w-32" />}>
          <EmailValue promise={promise} />
        </Suspense>
      </ItemRow>
      <ItemRow
        icon={LucideRotateCcwKey}
        action={
          <Button size="sm" variant="outline" asChild>
            <a href="#passkeys">{manageLabel}</a>
          </Button>
        }
      >
        <p className="font-medium text-sm">{t("Passkeys")}</p>
        <p className="text-muted-foreground text-sm leading-none">
          {t("Passwordless authentication with passkeys")}
        </p>
      </ItemRow>
      {providers.map((provider) => (
        <ProviderRow key={provider.provider} promise={promise} {...provider} />
      ))}
    </>
  );
}

function ItemRow({
  action,
  children,
  className,
  icon: Icon,
  ...props
}: React.ComponentProps<"div"> & {
  action: React.ReactNode;
  icon: React.ElementType;
}) {
  return (
    <div
      className={cn(
        "-m-px overflow-hidden border bg-background p-6 first:rounded-t-md last:rounded-b-md",
        className,
      )}
      {...props}
    >
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div className="grid size-10 place-items-center rounded-full bg-muted p-2">
            <Icon className="size-6 shrink-0" />
          </div>
          <div className="flex flex-col gap-1">{children}</div>
        </div>
        {action}
      </div>
    </div>
  );
}

function EmailValue({
  promise,
}: {
  promise: Promise<[User | null, Account[]]>;
}) {
  const [user] = use(promise);

  return (
    <p className="text-muted-foreground text-sm leading-none">{user?.email}</p>
  );
}

function ProviderRow({
  promise,
  provider,
  name,
  icon,
}: {
  icon: React.ElementType;
  name: string;
  provider: string;
  promise: Promise<[User | null, Account[]]>;
}) {
  return (
    <ItemRow
      icon={icon}
      action={
        <Suspense fallback={<Skeleton className="h-8 w-20" />}>
          <ProviderAction provider={provider} promise={promise} />
        </Suspense>
      }
    >
      <p className="font-medium text-sm">{name}</p>
      <Suspense fallback={<Skeleton className="h-5 w-40" />}>
        <ProviderStatus name={name} provider={provider} promise={promise} />
      </Suspense>
    </ItemRow>
  );
}

function ProviderStatus({
  name,
  provider,
  promise,
}: {
  name: string;
  provider: string;
  promise: Promise<[User | null, Account[]]>;
}) {
  const [, accounts] = use(promise);

  const t = useExtracted();

  const existingAccount = accounts?.find((acc) => acc.providerId === provider);

  return existingAccount ? (
    <Badge>{t("Linked")}</Badge>
  ) : (
    <span className="text-muted-foreground text-sm leading-none">
      {t("Link your {name} account", { name })}
    </span>
  );
}

function ProviderAction({
  provider,
  promise,
}: {
  provider: string;
  promise: Promise<[User | null, Account[]]>;
}) {
  const [, accounts] = use(promise);

  const t = useExtracted();
  const router = useRouter();

  const [isPending, startTransition] = useTransition();

  const existingAccount = accounts?.find((acc) => acc.providerId === provider);

  const linkAccount = (provider: string) =>
    startTransition(async () => {
      await authClient.linkSocial({
        provider,
        requestSignUp: false,
        callbackURL: paths.app.account.settings.authentication.getHref(),
        errorCallbackURL: paths.app.account.settings.authentication.getHref(),
        fetchOptions: {
          onSuccess: () => {
            router.refresh();
          },
        },
      });
    });

  const unlinkAccount = (accountId: string) =>
    startTransition(async () => {
      await authClient.unlinkAccount({
        providerId: provider,
        accountId,
        fetchOptions: {
          onSuccess: () => {
            router.refresh();
          },
        },
      });
    });

  return !existingAccount ? (
    <Button
      size="sm"
      variant="default"
      onClick={() => linkAccount(provider)}
      disabled={isPending}
    >
      {isPending ? <Spinner /> : t("Link")}
    </Button>
  ) : (
    <Button
      size="sm"
      variant="outline"
      onClick={() => unlinkAccount(existingAccount.accountId)}
      disabled={isPending}
    >
      {isPending ? <Spinner /> : t("Unlink")}
    </Button>
  );
}
