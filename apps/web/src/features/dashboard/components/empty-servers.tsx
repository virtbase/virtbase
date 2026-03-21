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

import { Button } from "@virtbase/ui/button";
import { LucidePlay } from "@virtbase/ui/icons";
import { PUBLIC_DOMAIN } from "@virtbase/utils";
import NextLink from "next/link";
import { useExtracted } from "next-intl";
import { AnimatedEmptyState } from "@/ui/animated-empty-state";
import { OperatingSystemIcon } from "@/ui/operating-system-icon";

export function EmptyServers() {
  const t = useExtracted();

  return (
    <AnimatedEmptyState
      title={t("No servers found")}
      description={t(
        "No servers have been rented yet. New servers will be displayed here.",
      )}
      addButton={
        <Button variant="default" size="sm" asChild>
          <NextLink href={PUBLIC_DOMAIN} prefetch={false}>
            {t("Rent a server")}
          </NextLink>
        </Button>
      }
      cardCount={4}
      cardContent={(index) => (
        <>
          <OperatingSystemIcon
            className="size-6 shrink-0"
            icon={`/assets/static/distros/${["debian", "ubuntu", "fedora", "almalinux"][index % 4]}.svg`}
          />
          <div className="h-2.5 w-24 min-w-0 rounded-sm bg-muted" />
          <div className="hidden grow items-center justify-end gap-1.5 sm:flex">
            <LucidePlay className="size-3.5 text-muted-foreground" />
          </div>
        </>
      )}
    />
  );
}
