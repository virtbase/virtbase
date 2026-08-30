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

import { useQueryErrorResetBoundary } from "@tanstack/react-query";
import { Button } from "@virtbase/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@virtbase/ui/empty";
import { LucideAlertTriangle } from "@virtbase/ui/icons/index";
import { useRouter } from "next/navigation";
import { useExtracted } from "next-intl";
import { useContext, useTransition } from "react";
import { ErrorBoundaryContext } from "react-error-boundary";

interface GenericErrorProps extends React.ComponentProps<typeof Empty> {
  /**
   * What "Try again" should do. Usually a query's `refetch`.
   *
   * Optional because the component is also used as an error boundary's
   * fallback, where the boundary itself supplies the way back.
   */
  reset?: () => void;
  /**
   * Filled in by `react-error-boundary` when this is passed as
   * `FallbackComponent`. `error` is accepted only so the component satisfies
   * `FallbackProps`; what it says is deliberately not shown.
   */
  error?: unknown;
  resetErrorBoundary?: (...args: unknown[]) => void;
}

/**
 * Picks which of the three ways back "Try again" should take.
 *
 * Pulled out of the component so the choice can be tested without a DOM: the
 * app's component harness cannot render anything that calls `useExtracted`
 * (`bun test` runs `NODE_ENV=test`, which resolves `use-intl` to its
 * production build, where the hook throws instead of falling back to the
 * source string).
 */
export function resolveRetry({
  reset,
  resetBoundary,
  resetQueryErrors,
  refresh,
  startTransition,
}: {
  reset?: () => void;
  resetBoundary?: (...args: unknown[]) => void;
  resetQueryErrors: () => void;
  refresh: () => void;
  startTransition: (callback: () => void) => void;
}) {
  // The caller named the thing to retry - usually a query's `refetch` - and
  // owns it. No boundary is involved, so nothing else has to be cleared.
  if (reset) {
    return reset;
  }

  if (resetBoundary) {
    // All three, in one transition, because the boundaries this falls back for
    // are fed two different ways and neither step alone recovers both:
    //
    // - `resetBoundary()` on its own re-renders the subtree, which is enough
    //   for a `useSuspenseQuery` - but a child that reads server data with
    //   `use(promise)` gets handed the very same rejected promise and throws
    //   again.
    // - `refresh()` on its own re-runs the server component but leaves
    //   `didCatch` set, so the fallback stays mounted and the new payload is
    //   never rendered. That is why "Try again" did nothing before.
    //
    // Batching them means React renders the subtree once the fresh payload has
    // arrived, rather than against the stale one.
    return () =>
      startTransition(() => {
        // A query that threw to an error boundary is pinned to its error state
        // with `retryOnMount: false` until the reset boundary is cleared.
        resetQueryErrors();
        refresh();
        resetBoundary();
      });
  }

  // No boundary and nothing named: this is server-rendered data, and a refresh
  // is the only thing that can fetch it again.
  return refresh;
}

export function GenericError({
  reset,
  error: _error,
  resetErrorBoundary,
  ...props
}: GenericErrorProps) {
  const t = useExtracted();
  const router = useRouter();
  const queryErrorResetBoundary = useQueryErrorResetBoundary();
  const [, startTransition] = useTransition();

  // The fallback is rendered *inside* the boundary's own context, so the way
  // back is in reach even at the `fallback={<GenericError />}` call sites that
  // pass no props at all - which is most of them.
  const boundary = useContext(ErrorBoundaryContext);
  const resetBoundary =
    resetErrorBoundary ??
    (boundary?.didCatch ? boundary.resetErrorBoundary : undefined);

  const retry = resolveRetry({
    reset,
    resetBoundary,
    resetQueryErrors: () => queryErrorResetBoundary.reset(),
    refresh: () => router.refresh(),
    startTransition,
  });

  return (
    <Empty {...props}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <LucideAlertTriangle aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{t("An error occurred")}</EmptyTitle>
        <EmptyDescription>
          {t("An unexpected error occurred while loading the data.")}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={retry}>{t("Try again")}</Button>
      </EmptyContent>
    </Empty>
  );
}
