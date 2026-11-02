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

import { cn } from "@virtbase/ui";
import { Avatar, AvatarFallback, AvatarImage } from "@virtbase/ui/avatar";
import type { Author } from "@/features/authors/authors.ts";

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** An author's picture, or their initials until they have one. */
export function AuthorAvatar({
  author,
  className,
}: {
  author: Author;
  className?: string;
}) {
  return (
    <Avatar className={cn("border border-border", className)}>
      {author.data.avatar && (
        <AvatarImage src={author.data.avatar} alt={author.data.name} />
      )}
      <AvatarFallback className="text-xs">
        {initials(author.data.name)}
      </AvatarFallback>
    </Avatar>
  );
}
