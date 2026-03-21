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

import { constructMetadata } from "@virtbase/utils";
import dynamic from "next/dynamic";

const ServerGraphs = dynamic(
  () => import("@/features/servers/components/server-graphs"),
);

// TODO: Intl
export const metadata = constructMetadata({
  title: "Overview",
  noIndex: true,
});

export default function Page() {
  return (
    <div className="grid flex-1 auto-rows-max gap-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_250px] xl:grid-cols-4">
        <div className="grid auto-rows-max items-start gap-4 lg:col-span-2">
          {/* TODO: Add ServerDetails */}
          {/* <ServerDetails /> */}
        </div>
        <div className="grid auto-rows-max items-start gap-4 lg:col-span-2">
          {/* TODO: Add ServerStatsWrapper */}
          {/* <ServerStatsWrapper /> */}
        </div>
      </div>
      <ServerGraphs />
    </div>
  );
}
