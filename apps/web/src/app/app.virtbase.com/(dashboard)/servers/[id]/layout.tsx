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

import { ServerNav } from "@/features/servers/components/server-nav";
import { ServerStatusBar } from "@/features/servers/components/server-status-bar";
import DashboardLayout from "@/ui/layout/dashboard-layout";

export default function ServersLayout({
  children,
}: LayoutProps<"/app.virtbase.com/servers/[id]">) {
  return (
    <DashboardLayout
    //leftSide={<ServerLabel />}
    //rightSide={<ServerActionsRow />}
    >
      <div className="space-y-4 overflow-clip">
        <ServerNav />
        <ServerStatusBar />
        {children}
      </div>
    </DashboardLayout>
  );
}
