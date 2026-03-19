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

import type { Session } from "@virtbase/auth";

export const mockSession = {
  session: {
    id: "sess_0000000000000000000000000",
    createdAt: new Date(),
    updatedAt: new Date(),
    userId: "usr_0000000000000000000000000",
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
    token: "__mock_token__",
  },
  user: {
    id: "usr_0000000000000000000000000",
    email: "test@example.com",
    emailVerified: true,
    name: "Mock User",
    role: "CUSTOMER",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
} satisfies Session;
