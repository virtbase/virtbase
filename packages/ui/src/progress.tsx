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

"use client";

import { cn } from "@virtbase/ui";
import { motion } from "motion/react";
import { Progress as ProgressPrimitive } from "radix-ui";
import type * as React from "react";

const MotionIndicator = motion.create(ProgressPrimitive.Indicator);

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-primary/20",
        className,
      )}
      {...props}
    >
      <MotionIndicator
        data-slot="progress-indicator"
        className="h-full w-full flex-1 bg-primary"
        initial={{ x: "-100%" }}
        animate={{ x: `${(value || 0) - 100}%` }}
        transition={{ type: "spring", stiffness: 100, damping: 20 }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
