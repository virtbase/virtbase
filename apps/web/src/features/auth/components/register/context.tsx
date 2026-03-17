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

import type React from "react";
import type { PropsWithChildren } from "react";
import { createContext, useContext, useState } from "react";

interface RegisterContextType {
  email: string;
  name: string;
  password: string;
  step: "signup" | "verify";
  setEmail: (email: string) => void;
  setName: (name: string) => void;
  setPassword: (password: string) => void;
  setStep: (step: "signup" | "verify") => void;
  lockEmail?: boolean;
}

const RegisterContext = createContext<RegisterContextType | undefined>(
  undefined,
);

export const RegisterProvider: React.FC<
  PropsWithChildren<{ email?: string; name?: string; lockEmail?: boolean }>
> = ({ email: emailProp, name: nameProp, lockEmail, children }) => {
  const [name, setName] = useState(nameProp ?? "");
  const [email, setEmail] = useState(emailProp ?? "");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"signup" | "verify">("signup");

  return (
    <RegisterContext.Provider
      value={{
        email,
        name,
        password,
        step,
        setEmail,
        setName,
        setPassword,
        setStep,
        lockEmail,
      }}
    >
      {children}
    </RegisterContext.Provider>
  );
};

export const useRegisterContext = () => {
  const context = useContext(RegisterContext);

  if (context === undefined) {
    throw new Error(
      "useRegisterContext must be used within a RegisterProvider",
    );
  }

  return context;
};
