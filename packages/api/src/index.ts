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

import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";

import type { AppRouter } from "./root";

type RouterInputs = inferRouterInputs<AppRouter>;

type RouterOutputs = inferRouterOutputs<AppRouter>;

export { TRPCError } from "@trpc/server";
export {
  createOpenApiFetchHandler,
  generateOpenApiDocument,
} from "trpc-to-openapi";
export { type AppRouter, appRouter } from "./root";
export { createTRPCContext } from "./trpc";
export type { RouterInputs, RouterOutputs };
