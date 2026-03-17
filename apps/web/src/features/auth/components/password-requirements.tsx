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

import { cn } from "@virtbase/ui";
import { CircleCheck } from "@virtbase/ui/icons";
import { useExtracted } from "next-intl";
import { memo } from "react";

const useRequirements = () => {
  const t = useExtracted();

  return [
    {
      name: t("Number"),
      check: (p: string) => /\d/.test(p),
    },
    {
      name: t("Uppercase letter"),
      check: (p: string) => /[A-Z]/.test(p),
    },
    {
      name: t("Lowercase letter"),
      check: (p: string) => /[a-z]/.test(p),
    },
    {
      name: t("8 characters"),
      check: (p: string) => p.length >= 8,
    },
  ] as const;
};

/**
 * Component to display the password requirements and whether they are each met for a password field.
 */
export const PasswordRequirements = memo(function PasswordRequirements({
  field,
  invalid,
  className,
}: {
  field: { value?: string };
  invalid?: boolean;
  className?: string;
}) {
  const requirements = useRequirements();
  const password = field.value;

  return (
    <ul className={cn("mt-2 flex flex-wrap items-center gap-3", className)}>
      {requirements.map(({ name, check }) => {
        const checked = password?.length && check(password);

        return (
          <li
            key={name}
            className={cn(
              "flex items-center gap-1 text-muted-foreground text-xs transition-colors",
              checked ? "text-green-600" : invalid && "text-destructive",
            )}
          >
            <CircleCheck
              aria-hidden="true"
              className={cn(
                "size-2.5 transition-opacity",
                checked
                  ? "direction-[alternate] animation-duration-[150ms] repeat-2 animate-scale-in [--from-scale:1] [--to-scale:1.2] [animation-timing-function:ease-in-out]"
                  : invalid
                    ? "text-destructive"
                    : "text-neutral-200",
              )}
            />
            <span>{name}</span>
          </li>
        );
      })}
    </ul>
  );
});
