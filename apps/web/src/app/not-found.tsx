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
import { ClientOnly } from "@virtbase/ui/client-only";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@virtbase/ui/empty";
import NextLink from "next/link";
import { authClient } from "@/lib/auth/client";
import Document from "@/ui/document";
import ColoredLayout from "@/ui/layout/colored-layout";

// TODO: Correct localization when rootParams is available
export default function NotFound() {
  return (
    <Document locale="en">
      <ColoredLayout>
        <div className="flex min-h-screen w-full flex-col items-center justify-between">
          {/* Empty div to help center main content */}
          <div className="grow basis-0">
            <div className="h-24" />
          </div>
          <div className="relative flex w-full flex-col items-center justify-center px-4">
            <Empty>
              <EmptyHeader>
                <EmptyTitle className="font-bold font-mono text-6xl">
                  404
                </EmptyTitle>
                <EmptyDescription className="text-lg">
                  The requested page was not found.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button asChild>
                  <NextLink href="/" prefetch={false}>
                    Go to home
                  </NextLink>
                </Button>
              </EmptyContent>
            </Empty>
          </div>
          {/* Empty div to help center main content */}
          <div className="flex grow basis-0 flex-col justify-end">
            <UserIndicator />
          </div>
        </div>
      </ColoredLayout>
    </Document>
  );
}

function UserIndicator() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending || !session) {
    return null;
  }

  return (
    <ClientOnly>
      <p className="px-20 py-8 text-center font-medium text-muted-foreground text-xs md:px-0">
        Logged in as{" "}
        <span className="font-semibold text-foreground/80">
          {session.user.name}
        </span>
      </p>
    </ClientOnly>
  );
}
