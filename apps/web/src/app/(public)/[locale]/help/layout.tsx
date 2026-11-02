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

import { RootProvider } from "fumadocs-ui/provider/next";
import { getLocale } from "next-intl/server";
import { getPopularSearchResults } from "@/features/help/search.ts";
import type { HelpSearchProps } from "@/ui/fumadocs/help-search.tsx";
import HelpSearch from "@/ui/fumadocs/help-search.tsx";

export default async function HelpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const options: Partial<HelpSearchProps> = {
    popular: await getPopularSearchResults(await getLocale()),
  };

  return (
    <RootProvider
      search={{
        enabled: true,
        SearchDialog: HelpSearch,
        options,
        preload: false,
      }}
      theme={{
        enabled: false,
      }}
    >
      {children}
    </RootProvider>
  );
}
