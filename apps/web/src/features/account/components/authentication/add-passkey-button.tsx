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
import { Spinner } from "@virtbase/ui/spinner";
import { useRouter } from "next/navigation";
import { useExtracted } from "next-intl";
import { useTransition } from "react";
import { authClient } from "@/lib/auth/client";

export function AddPasskeyButton() {
  const t = useExtracted();
  const router = useRouter();

  const [isPending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      onClick={() => {
        startTransition(async () => {
          const result = await authClient.passkey.addPasskey();
          if (!result.error) {
            router.refresh();
          }
        });
      }}
      data-testid="add-passkey-button"
      disabled={isPending}
    >
      {isPending ? <Spinner /> : t("Add Passkey")}
    </Button>
  );
}
