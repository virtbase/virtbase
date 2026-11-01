/*
 * Copyright (C) 2026 BeastHost UG (haftungsbeschränkt)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

"use client";

import { Button } from "@virtbase/ui/button";
import dynamic from "next/dynamic";
import type React from "react";
import { useServerActionState } from "../../hooks/use-server-action-state.ts";

const FirewallRuleDialog = dynamic(() => import("./firewall-rule-dialog.tsx"), {
  ssr: false,
});

export function CreateFirewallRuleButton({
  disabled,
  onClick,
  size = "icon",
  variant = "outline",
  children,
  ...props
}: React.ComponentProps<typeof Button>) {
  const { action, setAction } = useServerActionState();

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={(event) => {
          setAction("create-firewall-rule");
          onClick?.(event);
        }}
        disabled={action === "create-firewall-rule" || disabled}
        {...props}
      >
        {children}
      </Button>
      {action === "create-firewall-rule" && (
        <FirewallRuleDialog
          onOpenChange={(open) =>
            setAction(open ? "create-firewall-rule" : null)
          }
          open
          mode="create"
        />
      )}
    </>
  );
}
