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

import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  createTRPCClient,
  httpBatchStreamLink,
  loggerLink,
  retryLink,
} from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import type { AppRouter } from "@virtbase/api";
import { APP_DOMAIN } from "@virtbase/utils";
import { useRouter } from "next/navigation";
import { useState } from "react";
import SuperJSON from "superjson";
import { env } from "@/env";
import { createQueryClient } from "./query-client";

let clientQueryClientSingleton: QueryClient | undefined;
const getQueryClient = () => {
  if (typeof window === "undefined") {
    // Server: always make a new query client
    return createQueryClient();
  } else {
    // Browser: use singleton pattern to keep the same query client
    clientQueryClientSingleton ??= createQueryClient();
    return clientQueryClientSingleton;
  }
};

export const { useTRPC, TRPCProvider } = createTRPCContext<AppRouter>();

export function TRPCReactProvider(props: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  const router = useRouter();

  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [
        retryLink({
          retry: (otps) => {
            if (otps.error.data && otps.error.data.code === "UNAUTHORIZED") {
              router.replace(
                `${APP_DOMAIN}/login?next=${encodeURIComponent(window.location.pathname)}`,
              );
              return false;
            }

            if (
              otps.error.data &&
              otps.error.data.code === "INTERNAL_SERVER_ERROR"
            ) {
              return false;
            }

            if (otps.op.type !== "query") {
              return false;
            }

            return otps.attempts <= 3;
          },
          // Double every attempt, with max of 30 seconds (starting at 1 second)
          retryDelayMs: (attemptIndex) =>
            Math.min(1000 * 2 ** attemptIndex, 30000),
        }),
        loggerLink({
          enabled: (op) =>
            env.NODE_ENV === "development" ||
            (op.direction === "down" && op.result instanceof Error),
        }),
        httpBatchStreamLink({
          transformer: SuperJSON,
          url: `${getBaseUrl()}/api/trpc`,
          headers() {
            const headers = new Headers();
            headers.set("x-trpc-source", "nextjs-react");
            return headers;
          },
        }),
      ],
    }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {props.children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}

const getBaseUrl = () => {
  if (typeof window !== "undefined") return window.location.origin;
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  // eslint-disable-next-line no-restricted-properties
  return `http://localhost:${process.env.PORT ?? 3000}`;
};
