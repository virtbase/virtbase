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
import { LucideAlertTriangle } from "@virtbase/ui/icons/index";
import { useExtracted } from "next-intl";
import React from "react";

export function GenericErrorInline({ className, ...props }: React.ComponentProps<"div">) {
  const t = useExtracted();

  return (
    <div className={cn("flex h-8 items-center gap-2 text-destructive", className)} {...props}>
      <LucideAlertTriangle className="size-4 shrink-0" aria-hidden="true" />
      <span className="text-sm">{t("An error occurred")}</span>
    </div>
  );
}