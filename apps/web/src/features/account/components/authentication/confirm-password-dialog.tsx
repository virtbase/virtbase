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

import { Button } from "@virtbase/ui/button";
import { Field, FieldGroup, FieldLabel } from "@virtbase/ui/field";
import { useMediaQuery } from "@virtbase/ui/hooks";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@virtbase/ui/input-group";
import { ResponsiveDialog } from "@virtbase/ui/responsive-dialog";
import { Spinner } from "@virtbase/ui/spinner";
import { useExtracted } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { ShowPasswordAddon } from "@/ui/input-group-addons";

export default function ConfirmPasswordDialog({
  onSubmit,
  invalid,
  ...props
}: Omit<
  React.ComponentProps<typeof ResponsiveDialog>,
  "title" | "description" | "footer"
> & {
  onSubmit: (password: string) => Promise<void> | void;
  invalid?: boolean;
}) {
  const t = useExtracted();

  const { isMobile } = useMediaQuery();

  const [password, setPassword] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) =>
    startTransition(async () => {
      e.preventDefault();
      await onSubmit(password);
    });

  // Reset the form when the dialog is closed
  useEffect(() => {
    setPassword("");
    setIsPasswordVisible(false);
  }, [props.open]);

  const action = t("Confirm Password");

  return (
    <ResponsiveDialog
      title={action}
      description={action}
      footer={
        <>
          <Button
            variant="outline"
            onClick={() => props.onOpenChange?.(false)}
            disabled={isPending}
          >
            {t("Cancel")}
          </Button>
          <Button
            type="submit"
            form="confirm-password-form"
            disabled={isPending}
          >
            {isPending && <Spinner />} {action}
          </Button>
        </>
      }
      {...props}
    >
      <form id="confirm-password-form" onSubmit={handleSubmit}>
        <FieldGroup>
          <Field data-invalid={invalid}>
            <FieldLabel htmlFor="password">{t("Password")}</FieldLabel>
            <InputGroup>
              <InputGroupInput
                type={!isPasswordVisible ? "password" : "text"}
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                maxLength={64}
                pattern="^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,}$"
                autoComplete="current-password"
                autoFocus={!isMobile}
                placeholder="********"
                disabled={isPending}
                aria-invalid={invalid}
              />
              <InputGroupAddon align="inline-end">
                <ShowPasswordAddon
                  isPasswordVisible={isPasswordVisible}
                  setIsPasswordVisible={setIsPasswordVisible}
                  disabled={isPending}
                />
              </InputGroupAddon>
            </InputGroup>
          </Field>
        </FieldGroup>
      </form>
    </ResponsiveDialog>
  );
}
