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
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@virtbase/ui/empty";
import { LucideSearchX } from "@virtbase/ui/icons";
import NextLink from "next/link";
import { useExtracted } from "next-intl";
import { paths } from "@/lib/paths";

export default function ServerNotFound() {
  const t = useExtracted();

  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <LucideSearchX aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{t("Server not found")}</EmptyTitle>
        <EmptyDescription>
          {t("The server you are looking for does not exist.")}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild>
          <NextLink href={paths.app.servers.getHref()} prefetch={false}>
            {t("Go to servers")}
          </NextLink>
        </Button>
      </EmptyContent>
    </Empty>
  );
}
