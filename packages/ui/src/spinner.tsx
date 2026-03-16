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

import { cn } from "@virtbase/ui";

function Spinner({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("size-4", className)}
      role="status"
      aria-label="Loading"
      {...props}
    >
      <div
        style={{
          position: "relative",
          top: "50%",
          left: "50%",
        }}
        className={cn("loading-spinner", "size-4", className)}
      >
        {[...Array(12)].map((_, idx) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: idx is unique
            key={idx}
            style={{
              animationDelay: `${-1.2 + 0.1 * idx}s`,
              background: "gray",
              position: "absolute",
              borderRadius: "1rem",
              width: "30%",
              height: "8%",
              left: "-10%",
              top: "-4%",
              transform: `rotate(${30 * idx}deg) translate(120%)`,
            }}
            className="animate-spinner"
          />
        ))}
      </div>
    </div>
  );
}

export { Spinner };
