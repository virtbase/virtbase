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

import { apiKey } from "@better-auth/api-key";
import { passkey } from "@better-auth/passkey";
import { APP_DOMAIN, APP_NAME } from "@virtbase/utils";
import type { BetterAuthPlugin } from "better-auth";
import { admin, createAccessControl } from "better-auth/plugins";
import {
  adminAc,
  defaultStatements,
  userAc,
} from "better-auth/plugins/admin/access";

const accessControl = createAccessControl(defaultStatements);

const customerRole = accessControl.newRole(userAc.statements);
const adminRole = accessControl.newRole(adminAc.statements);

export const plugins = [
  admin({
    defaultRole: "CUSTOMER",
    adminRoles: ["ADMIN"],
    ac: accessControl,
    roles: {
      ADMIN: adminRole,
      CUSTOMER: customerRole,
    },
  }),
  apiKey({
    enableMetadata: false,
    enableSessionForAPIKeys: false,
    rateLimit: {
      // Handled by QStash Ratelimit in our API
      enabled: false,
    },
    references: "user",
    schema: {
      apikey: {
        modelName: "apiKey",
      },
    },
  }),
  passkey({
    rpName: APP_NAME,
    origin: APP_DOMAIN,
  }),
] satisfies BetterAuthPlugin[];
