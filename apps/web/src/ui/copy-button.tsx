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
import type { LucideIcon } from "@virtbase/ui/icons";
import { CheckIcon, CopyIcon } from "@virtbase/ui/icons";
import { useExtracted } from "next-intl";
import { toast } from "sonner";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";

export function CopyButton({
  value,
  className,
  icon,
  successMessage,
}: {
  value: string;
  className?: string;
  icon?: LucideIcon;
  successMessage?: string;
}) {
  const t = useExtracted();

  const [copied, copyToClipboard] = useCopyToClipboard();
  const Comp = icon || CopyIcon;
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        toast.promise(copyToClipboard(value), {
          success: successMessage || t("Copied to clipboard!"),
        });
      }}
      className={cn(
        "group relative rounded-full bg-transparent p-1.5 transition-all duration-75 hover:bg-muted active:bg-muted",
        className,
      )}
      type="button"
    >
      <span className="sr-only">{t("Copy")}</span>
      {copied ? (
        <CheckIcon className="h-3.5 w-3.5" />
      ) : (
        <Comp className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
