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

import { Skeleton } from "@virtbase/ui/skeleton";

export function IntegrationsHubSkeleton() {
  return (
    <div className="flex flex-col gap-12">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="flex flex-col gap-4">
          <Skeleton className="h-4 w-16" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: index % 2 === 0 ? 3 : 2 }).map((_, index) => (
              <Skeleton key={index} className="h-42 w-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
