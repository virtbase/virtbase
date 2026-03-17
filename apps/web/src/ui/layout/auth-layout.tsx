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

import { ClientOnly } from "@virtbase/ui/client-only";
import { APP_NAME, PUBLIC_DOMAIN } from "@virtbase/utils";
import { useExtracted } from "next-intl";
import type { PropsWithChildren } from "react";
import { Suspense } from "react";

export const AuthLayout = ({
  children,
  showTerms = false,
}: PropsWithChildren<{ showTerms?: boolean }>) => {
  const t = useExtracted();

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-between">
      {/* Empty div to help center main content */}
      <div className="grow basis-0">
        <div className="h-24" />
      </div>

      <ClientOnly className="relative flex w-full flex-col items-center justify-center px-4">
        <Suspense>{children}</Suspense>
      </ClientOnly>

      <div className="flex grow basis-0 flex-col justify-end">
        {showTerms && (
          <p
            data-testid="terms"
            className="px-20 py-8 text-center font-medium text-muted-foreground text-xs md:px-0"
          >
            {t.rich(
              "By continuing, you agree to {appName}'s <terms>Terms of Service</terms> and <privacy>Privacy Policy</privacy>",
              {
                appName: APP_NAME,
                terms: (chunks) => (
                  <a
                    href={`${PUBLIC_DOMAIN}/legal/terms`}
                    className="font-semibold text-foreground/80 transition-colors hover:text-foreground"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {chunks}
                  </a>
                ),
                privacy: (chunks) => (
                  <a
                    href={`${PUBLIC_DOMAIN}/legal/privacy`}
                    className="font-semibold text-foreground/80 transition-colors hover:text-foreground"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {chunks}
                  </a>
                ),
              },
            )}
          </p>
        )}
      </div>
    </div>
  );
};
