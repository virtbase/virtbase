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
import type { motion } from "motion/react";
import { domAnimation, LazyMotion } from "motion/react";
import * as m from "motion/react-m";
import type {
  ComponentPropsWithoutRef,
  ForwardRefExoticComponent,
  PropsWithChildren,
  RefAttributes,
} from "react";
import { forwardRef, useRef } from "react";
import { useResizeObserver } from "./hooks/use-resize-observer";

type AnimatedSizeContainerProps = PropsWithChildren<{
  width?: boolean;
  height?: boolean;
}> &
  Omit<ComponentPropsWithoutRef<typeof motion.div>, "animate" | "children">;

/**
 * A container with animated width and height (each optional) based on children dimensions
 */
const AnimatedSizeContainer: ForwardRefExoticComponent<
  AnimatedSizeContainerProps & RefAttributes<HTMLDivElement>
> = forwardRef<HTMLDivElement, AnimatedSizeContainerProps>(
  (
    {
      width = false,
      height = false,
      className,
      transition,
      children,
      ...rest
    }: AnimatedSizeContainerProps,
    forwardedRef,
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const resizeObserverEntry = useResizeObserver(containerRef);

    return (
      <LazyMotion features={domAnimation}>
        <m.div
          ref={forwardedRef}
          className={cn("overflow-hidden", className)}
          animate={{
            width: width
              ? (resizeObserverEntry?.contentRect?.width ?? "auto")
              : "auto",
            height: height
              ? (resizeObserverEntry?.contentRect?.height ?? "auto")
              : "auto",
          }}
          transition={transition ?? { type: "spring", duration: 0.3 }}
          {...rest}
        >
          <div
            ref={containerRef}
            className={cn(height && "h-max", width && "w-max")}
          >
            {children}
          </div>
        </m.div>
      </LazyMotion>
    );
  },
);

AnimatedSizeContainer.displayName = "AnimatedSizeContainer";

export { AnimatedSizeContainer };
