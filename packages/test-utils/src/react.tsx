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

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";
import type { RenderOptions, RenderResult } from "@testing-library/react";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { ThemeProvider } from "next-themes";
import type { ReactElement, ReactNode } from "react";

export interface RenderWithProvidersOptions
  extends Omit<RenderOptions, "wrapper"> {
  locale?: string;
  /**
   * Messages for the `next-intl` provider. Components written with
   * `useExtracted()` pass the English source string as the key, so an empty
   * catalogue renders that source text - which is what a test wants to assert
   * on. Supply a catalogue only when testing a translation specifically.
   */
  messages?: Record<string, unknown>;
  queryClient?: QueryClient;
}

/**
 * A `QueryClient` that fails fast instead of retrying.
 *
 * The production client retries, which in a test turns one broken query into a
 * timeout several seconds later with no useful message.
 */
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
      mutations: { retry: false },
    },
  });
}

/**
 * Render a component inside the providers the app actually mounts it under.
 *
 * Almost every component in `apps/web` reaches for at least one of these - a
 * translator, the query client, or the theme - and rendering one bare throws
 * before a single assertion runs. This is the wrapper that makes them testable.
 */
export function renderWithProviders(
  ui: ReactElement,
  {
    locale = "en",
    messages = {},
    queryClient = createTestQueryClient(),
    ...options
  }: RenderWithProvidersOptions = {},
): RenderResult & { queryClient: QueryClient } {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider locale={locale} messages={messages}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
            {children}
          </ThemeProvider>
        </QueryClientProvider>
      </NextIntlClientProvider>
    );
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...options }),
    queryClient,
  };
}

/**
 * Teach bun's `expect` about the jest-dom matchers registered in `preload.ts`.
 *
 * The augmentation lives in this file rather than a standalone `.d.ts` so that
 * it travels with the import: any test file that pulls in `renderWithProviders`
 * gets the matcher types, without every consuming package having to widen its
 * `tsconfig` `include`.
 */
declare module "bun:test" {
  interface Matchers<T>
    extends Omit<
      TestingLibraryMatchers<ReturnType<typeof expect.stringContaining>, T>,
      "toBeEmpty"
    > {}
}

export * from "@testing-library/react";
export { default as userEvent } from "@testing-library/user-event";
