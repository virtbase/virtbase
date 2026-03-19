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

import { Grid } from "@virtbase/ui/grid";
import { RootProvider } from "fumadocs-ui/provider/next";
import { FakeSearchButton } from "@/ui/fumadocs/fake-search-button";
import HelpSearch from "@/ui/fumadocs/help-search";

export default function HelpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RootProvider
      search={{
        enabled: true,
        SearchDialog: HelpSearch,
        preload: false,
      }}
      theme={{
        enabled: false,
      }}
    >
      <div className="relative -mt-14 overflow-hidden">
        <Grid
          cellSize={80}
          className="mask-[radial-gradient(70%_50%_at_50%_60%,black_30%,transparent)] mx-auto max-w-7xl max-sm:opacity-50"
        />
        <div className="relative mx-auto mt-6 w-full max-w-5xl px-3 pt-24 pb-12 lg:px-4 xl:px-0">
          <FakeSearchButton className="bg-background" />
        </div>
      </div>
      {children}
    </RootProvider>
  );
}
