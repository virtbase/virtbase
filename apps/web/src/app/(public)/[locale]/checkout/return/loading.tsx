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

import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
} from "@virtbase/ui/empty";
import { Skeleton } from "@virtbase/ui/skeleton";

export default function Loading() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Skeleton className="size-10" />
        </EmptyMedia>
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-12 w-96" />
        <Skeleton className="h-12 w-72" />
      </EmptyHeader>
      <EmptyContent>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-32" />
        </div>
      </EmptyContent>
      <EmptyContent>
        <Skeleton className="h-4 w-32" />
      </EmptyContent>
    </Empty>
  );
}
