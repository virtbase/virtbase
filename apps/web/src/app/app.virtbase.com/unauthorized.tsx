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
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@virtbase/ui/empty";
import { useRouter } from "next/navigation";
import { useExtracted } from "next-intl";
import { authClient } from "@/lib/auth/client";
import ColoredLayout from "@/ui/layout/colored-layout";

export default function Unauthorized() {
  const t = useExtracted();
  const router = useRouter();

  return (
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
                401
              </EmptyTitle>
              <EmptyDescription className="text-lg">
                {t(
                  "You are not authorized to access this page. Your session may have expired, please sign in again.",
                )}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button
                onClick={() => {
                  void authClient.signOut({
                    fetchOptions: {
                      onSuccess: () => {
                        router.replace("/login");
                      },
                    },
                  });
                }}
              >
                {t("Sign out")}
              </Button>
            </EmptyContent>
          </Empty>
        </div>
        {/* Empty div to help center main content */}
        <div className="flex grow basis-0 flex-col justify-end" />
      </div>
    </ColoredLayout>
  );
}
