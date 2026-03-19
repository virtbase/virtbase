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

import type { RefObject } from "react";
import { useCallback, useEffect, useState } from "react";

export function useScroll(
  threshold: number,
  { container }: { container?: RefObject<HTMLElement | null> } = {},
) {
  const [scrolled, setScrolled] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: don't need update entry on every render
  const onScroll = useCallback(() => {
    setScrolled(
      (container?.current ? container.current.scrollTop : window.scrollY) >
        threshold,
    );
  }, [threshold]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: don't need update entry on every render
  useEffect(() => {
    const element = container?.current ?? window;
    element.addEventListener("scroll", onScroll);
    return () => element.removeEventListener("scroll", onScroll);
  }, [onScroll]);

  // also check on first load
  useEffect(() => {
    onScroll();
  }, [onScroll]);

  return scrolled;
}
