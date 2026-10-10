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

export function OrderSummarySkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: 7 }).map((_, index) => (
            <Skeleton key={index} className="h-5 w-48" />
          ))}
        </div>
        <div className="mt-1 border-t pt-4">
          <Skeleton className="h-6 w-32" />
        </div>
      </div>
    </div>
  );
}
