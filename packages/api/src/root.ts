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

import { authRouter } from "./router/auth";
import { checkoutRouter } from "./router/checkout";
import { invoicesRouter } from "./router/invoices";
import { serversRouter } from "./router/servers";
import { sshKeysRouter } from "./router/ssh-keys";
import { createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  sshKeys: sshKeysRouter,
  invoices: invoicesRouter,
  servers: serversRouter,
  checkout: checkoutRouter,
});

export type AppRouter = typeof appRouter;
