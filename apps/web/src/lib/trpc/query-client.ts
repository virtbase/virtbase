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
  defaultShouldDehydrateQuery,
  MutationCache,
  QueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import SuperJSON from "superjson";

declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: {
      /**
       * What to tell the customer when this mutation fails.
       *
       * Declaring it is how a mutation opts into the global failure toast in
       * `createQueryClient()`, and the string is the headline that toast shows.
       * Opt-in rather than opt-out on purpose: TanStack runs the cache-level
       * handler *in addition to* whatever the call site does, and a call site
       * can report a failure in three ways the cache cannot see - a per-call
       * `mutate(input, { onError })`, an `await mutateAsync()` inside a
       * `try/catch`, or an `onError` the hook itself already owns for an
       * optimistic rollback. Toasting by default would double up on every one
       * of those.
       *
       * So: a mutation whose failure nothing else reports declares
       * `errorMessage` and says nothing itself; a mutation whose call site
       * reports the failure leaves it off.
       */
      errorMessage?: string;
    };
  }
}

/**
 * The server's own account of a failure, when it is fit to show someone.
 *
 * A `TRPCError` message is not always prose. It is a bare tRPC code when the
 * router threw without one (`FORBIDDEN`), a sentinel the client is meant to
 * branch on rather than print (`ABUSE_LOCKED`, `STEP_UP_REQUIRED`), or a
 * serialised list of Zod issues when the input failed validation. None of
 * those belong in front of a customer, so they are dropped and the mutation's
 * own `errorMessage` stands alone.
 */
export function getMutationErrorDetail(error: Error): string | undefined {
  const message = error.message?.trim();

  if (!message || message.length > 200) {
    return undefined;
  }

  // `FORBIDDEN`, `TOO_MANY_REQUESTS`, `ABUSE_LOCKED`, ...
  if (/^[A-Z][A-Z0-9_]*$/.test(message)) {
    return undefined;
  }

  // A serialised Zod issue list.
  if (message.startsWith("[") || message.startsWith("{")) {
    return undefined;
  }

  return message;
}

export const createQueryClient = () =>
  new QueryClient({
    mutationCache: new MutationCache({
      onError: (error, _variables, _onMutateResult, mutation) => {
        const message = mutation.meta?.errorMessage;

        // Nothing declared: the call site reports this failure itself.
        if (!message) {
          return;
        }

        toast.error(message, { description: getMutationErrorDetail(error) });
      },
    }),
    defaultOptions: {
      mutations: {
        retry: false,
      },
      queries: {
        // With SSR, we usually want to set some default staleTime
        // above 0 to avoid refetching immediately on the client
        staleTime: 30 * 1000,
        retry: false,
      },
      dehydrate: {
        serializeData: SuperJSON.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
        shouldRedactErrors: () => {
          // We should not catch Next.js server errors
          // as that's how Next.js detects dynamic pages
          // so we cannot redact them.
          // Next.js also automatically redacts errors for us
          // with better digests.
          return false;
        },
      },
      hydrate: {
        deserializeData: SuperJSON.deserialize,
      },
    },
  });
