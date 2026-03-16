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

import type { UserWithRole } from "better-auth/plugins";

/**
 * Short-hand for checking if a user has a specific role
 */
const hasRole = <T extends string>(
  user: Pick<UserWithRole, "role">,
  role: T,
): user is { role: T } => {
  return "role" in user && user.role === role;
};

/**
 * Short-hand for checking if a user is an admin
 * (user.role is ADMIN)
 */
const isAdmin = (user: Pick<UserWithRole, "role">) => {
  return hasRole(user, "ADMIN");
};

/**
 * Short-hand for checking if a user is a customer
 * (user.role is CUSTOMER)
 */
const isCustomer = (user: Pick<UserWithRole, "role">) => {
  return hasRole(user, "CUSTOMER");
};

export { hasRole, isAdmin, isCustomer };
