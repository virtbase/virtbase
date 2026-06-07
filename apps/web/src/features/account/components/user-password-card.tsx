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
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@virtbase/ui/card";
import { Field, FieldGroup, FieldLabel } from "@virtbase/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@virtbase/ui/input-group";
import { Spinner } from "@virtbase/ui/spinner";
import { useExtracted } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth/client";
import { ShowPasswordAddon } from "@/ui/input-group-addons/show-password-addon";

export function UserPasswordCard() {
  const t = useExtracted();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isCurrentPasswordVisible, setIsCurrentPasswordVisible] =
    useState(false);
  const [isNewPasswordVisible, setIsNewPasswordVisible] = useState(false);

  const [isUpdating, startTransition] = useTransition();

  const resetForm = () => {
    setCurrentPassword("");
    setNewPassword("");
    setIsCurrentPasswordVisible(false);
    setIsNewPasswordVisible(false);
  };

  const changePassword = async (
    currentPassword: string,
    newPassword: string,
  ) => {
    startTransition(async () => {
      await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
        fetchOptions: {
          onSuccess: () => {
            resetForm();

            toast.success(t("Password updated successfully."));
          },
          onError: ({ error }) => {
            toast.error(error.message);
          },
        },
      });
    });
  };

  // Reset the form when the component unmounts
  useEffect(() => {
    return () => {
      resetForm();
    };
  }, []);

  return (
    <form
      id="update-password-form"
      onSubmit={(e) => {
        e.preventDefault();
        void changePassword(currentPassword, newPassword);
      }}
    >
      <Card className="overflow-hidden pb-0">
        <CardHeader>
          <CardTitle>{t("Change Password")}</CardTitle>
          <CardDescription>
            {t("Please enter your current password and a new password.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="md:flex-row">
            <Field>
              <FieldLabel className="text-muted-foreground">
                {t("Current Password")}
              </FieldLabel>
              <InputGroup>
                <InputGroupInput
                  autoFocus={false}
                  autoComplete="current-password"
                  minLength={8}
                  maxLength={64}
                  pattern="^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,}$"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  disabled={isUpdating}
                  type={!isCurrentPasswordVisible ? "password" : "text"}
                  placeholder="********"
                />
                <InputGroupAddon align="inline-end">
                  <ShowPasswordAddon
                    isPasswordVisible={isCurrentPasswordVisible}
                    setIsPasswordVisible={setIsCurrentPasswordVisible}
                    tabIndex={-1}
                  />
                </InputGroupAddon>
              </InputGroup>
            </Field>
            <Field>
              <FieldLabel className="text-muted-foreground">
                {t("New Password")}
              </FieldLabel>
              <InputGroup>
                <InputGroupInput
                  autoFocus={false}
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={64}
                  pattern="^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,}$"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={isUpdating}
                  type={!isNewPasswordVisible ? "password" : "text"}
                  placeholder="********"
                />
                <InputGroupAddon align="inline-end">
                  <ShowPasswordAddon
                    isPasswordVisible={isNewPasswordVisible}
                    setIsPasswordVisible={setIsNewPasswordVisible}
                    tabIndex={-1}
                  />
                </InputGroupAddon>
              </InputGroup>
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter className="border-t bg-background [.border-t]:p-6">
          <div className="flex w-full flex-col items-center justify-center gap-4 lg:flex-row lg:justify-between">
            <p className="text-center text-muted-foreground text-sm">
              {t(
                "Please use at least 8 characters, one uppercase letter, one lowercase letter and one number.",
              )}
            </p>
            <Button
              size="sm"
              type="submit"
              form="update-password-form"
              disabled={isUpdating}
            >
              {isUpdating && <Spinner />} {t("Save")}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </form>
  );
}
