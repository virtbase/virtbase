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

import { AnimatePresence, domAnimation, LazyMotion } from "motion/react";
import * as m from "motion/react-m";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

export const ClientOnly = ({
  children,
  fallback,
  fadeInDuration = 0.5,
  className,
}: {
  children: ReactNode;
  fallback?: ReactNode;
  fadeInDuration?: number;
  className?: string;
}) => {
  const [clientReady, setClientReady] = useState<boolean>(false);

  useEffect(() => {
    setClientReady(true);
  }, []);

  const Comp = fadeInDuration ? m.div : "div";

  return (
    <LazyMotion features={domAnimation}>
      <AnimatePresence>
        {clientReady ? (
          <Comp
            data-testid="client-only"
            {...(fadeInDuration
              ? {
                  initial: { opacity: 0 },
                  animate: { opacity: 1 },
                  transition: { duration: fadeInDuration },
                }
              : {})}
            className={className}
          >
            {children}
          </Comp>
        ) : (
          fallback || null
        )}
      </AnimatePresence>
    </LazyMotion>
  );
};
