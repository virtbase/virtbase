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
import { LucideWebhook, LucideWebhookOff } from "@virtbase/ui/icons";
import { Spinner } from "@virtbase/ui/spinner";
import { useExtracted } from "next-intl";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";
import { setIntegrationEnabledAction } from "../../api/integrations/update-integration";

export function IntegrationEnableButton({
  integrationId,
  enabled,
  disabled,
}: {
  integrationId: string;
  enabled: boolean;
  disabled?: boolean;
}) {
  const t = useExtracted();

  const { execute, isPending } = useAction(setIntegrationEnabledAction, {
    onError: ({ error }) =>
      toast.error(error.serverError ?? t("Something went wrong.")),
  });

  const Icon = enabled ? LucideWebhookOff : LucideWebhook;

  return (
    <Button
      variant={enabled ? "outline" : "default"}
      disabled={disabled || isPending}
      onClick={() => execute({ integrationId, enabled: !enabled })}
    >
      {isPending ? (
        <Spinner className="size-4" />
      ) : (
        <Icon className="size-4" aria-hidden="true" />
      )}
      {enabled ? t("Disable") : t("Enable")}
    </Button>
  );
}
