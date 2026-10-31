/*
 * Copyright (C) 2026 BeastHost UG (haftungsbeschränkt)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { abuseRouter } from "./router/abuse.ts";
import { authRouter } from "./router/auth.ts";
import { checkoutRouter } from "./router/checkout.ts";
import { invoicesRouter } from "./router/invoices.ts";
import { isoRouter } from "./router/iso/index.ts";
import { paymentMethodsRouter } from "./router/payment-methods.ts";
import { privacyRouter } from "./router/privacy.ts";
import { publicRouter } from "./router/public.ts";
import { serversRouter } from "./router/servers/index.ts";
import { sshKeysRouter } from "./router/ssh-keys.ts";
import { stepUpRouter } from "./router/step-up.ts";
import { subscriptionsRouter } from "./router/subscriptions.ts";
import { createTRPCRouter } from "./trpc.ts";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  abuse: abuseRouter,
  stepUp: stepUpRouter,
  privacy: privacyRouter,
  sshKeys: sshKeysRouter,
  invoices: invoicesRouter,
  iso: isoRouter,
  paymentMethods: paymentMethodsRouter,
  subscriptions: subscriptionsRouter,
  servers: serversRouter,
  checkout: checkoutRouter,
  public: publicRouter,
});

export type AppRouter = typeof appRouter;
