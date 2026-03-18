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

import { Separator } from "@virtbase/ui/separator";
import { SidebarTrigger } from "@virtbase/ui/sidebar";

export default function DashboardLayout({
  children,
  leftSide,
  rightSide,
}: {
  children: React.ReactNode;
  leftSide?: React.ReactNode;
  rightSide?: React.ReactNode;
}) {
  return (
    <div className="@container px-4 pb-6 md:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-6xl space-y-4">
        <header className="flex min-h-20 shrink-0 flex-wrap items-center gap-3 border-b py-4 transition-all ease-linear">
          {/* Left side */}
          <div className="flex flex-1 items-center gap-2">
            <SidebarTrigger className="-ms-1" />
            {leftSide && (
              <Separator
                orientation="vertical"
                className="me-2 data-[orientation=vertical]:h-4"
              />
            )}
            {leftSide}
          </div>
          {/* Right side */}
          {rightSide}
        </header>
        {children}
      </div>
    </div>
  );
}
