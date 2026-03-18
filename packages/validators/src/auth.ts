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

import * as z from "zod/v4-mini";

export const PasswordSchema = z
  .string()
  .check(
    z.minLength(8),
    z.maxLength(1000),
    z.regex(/^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,}$/),
  );

export const EmailSchema = z.string().check(z.email(), z.toLowerCase());

export const NameSchema = z.string().check(z.minLength(1), z.maxLength(32));

export const ResetPasswordSchema = z
  .object({
    token: z.string().check(z.minLength(1)),
    password: PasswordSchema,
    confirmPassword: PasswordSchema,
  })
  .check(
    z.refine((data) => data.password === data.confirmPassword, {
      path: ["confirmPassword"],
    }),
  );

export const SignUpSchema = z.object({
  email: EmailSchema,
  name: NameSchema,
  password: PasswordSchema,
  locale: z.optional(z.string()),
});
