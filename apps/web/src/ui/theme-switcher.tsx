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

import {
  LucideMonitorCog,
  LucideMoonStar,
  LucideSun,
} from "@virtbase/ui/icons/index";
import { Skeleton } from "@virtbase/ui/skeleton";
import { useTheme } from "@virtbase/ui/theme-provider";
import { ToggleGroup, ToggleGroupItem } from "@virtbase/ui/toggle-group";
import { useExtracted } from "next-intl";
import { useEffect, useState } from "react";

export function ThemeSwitcher() {
  const t = useExtracted();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <Skeleton aria-hidden="true" className="h-8 w-29" />;
  }

  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={theme ?? "system"}
      onValueChange={setTheme}
    >
      <ToggleGroupItem value="system" variant="outline">
        <span className="sr-only">{t("System theme")}</span>
        <LucideMonitorCog
          aria-hidden="true"
          className="text-muted-foreground"
        />
      </ToggleGroupItem>
      <ToggleGroupItem value="light" variant="outline">
        <span className="sr-only">{t("Light theme")}</span>
        <LucideSun aria-hidden="true" className="text-muted-foreground" />
      </ToggleGroupItem>
      <ToggleGroupItem value="dark" variant="outline">
        <span className="sr-only">{t("Dark theme")}</span>
        <LucideMoonStar aria-hidden="true" className="text-muted-foreground" />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
