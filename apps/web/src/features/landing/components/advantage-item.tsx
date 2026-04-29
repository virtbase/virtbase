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
import { Button } from "@virtbase/ui/button";
import type { LucideIcon } from "@virtbase/ui/icons";
import { useExtracted } from "next-intl";
import type React from "react";
import { IntlLink } from "@/i18n/navigation.public";

interface AdvantageItemProps extends React.ComponentProps<"div"> {
  title: string;
  description: string;
  icon: LucideIcon;
  href?: string;
}

export function AdvantageItem({
  title,
  description,
  icon: Icon,
  href,
  className,
  ...props
}: AdvantageItemProps) {
  const t = useExtracted();

  return (
    <div
      className={cn(
        "flex flex-col items-start gap-2 bg-background p-8 text-left lg:px-9 lg:py-10",
        className,
      )}
      {...props}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <h3 className="font-medium">{title}</h3>
      <div className="max-w-xs text-pretty text-muted-foreground sm:max-w-none [&_a]:font-medium [&_a]:text-foreground/80 [&_a]:underline [&_a]:decoration-dotted [&_a]:underline-offset-2 [&_a]:hover:text-foreground">
        <p>{description}</p>
      </div>
      {href && (
        <Button variant="outline" size="sm" asChild>
          <IntlLink href={href} prefetch={false} className="mt-3 w-fit">
            {t("Learn more")}
          </IntlLink>
        </Button>
      )}
    </div>
  );
}
