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

import { AnimatedSizeContainer } from "@virtbase/ui/animated-size-container";
import { AuthMethodsSeparator } from "../auth-methods-separator";
import { SignUpEmail } from "./signup-email";
import { SignUpOAuth } from "./signup-oauth";

export const SignUpForm = ({
  methods = ["email", "google", "github", "discord"],
}: {
  methods?: ("email" | "google" | "github" | "discord")[];
}) => {
  return (
    <AnimatedSizeContainer height>
      <div className="flex flex-col gap-3 p-1">
        {methods.includes("email") && <SignUpEmail />}
        {methods.length && <AuthMethodsSeparator />}
        <SignUpOAuth methods={methods} />
      </div>
    </AnimatedSizeContainer>
  );
};
