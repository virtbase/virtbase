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

import { LucideEye, LucideEyeOff } from "@virtbase/ui/icons";
import { InputGroupButton } from "@virtbase/ui/input-group";
import { useExtracted } from "next-intl";
import type { Dispatch, SetStateAction } from "react";

interface ShowPasswordAddonProps
  extends Omit<
    React.ComponentProps<typeof InputGroupButton>,
    "aria-label" | "title" | "onClick"
  > {
  isPasswordVisible: boolean;
  setIsPasswordVisible: Dispatch<SetStateAction<boolean>>;
}

export function ShowPasswordAddon({
  isPasswordVisible,
  setIsPasswordVisible,
  ...props
}: ShowPasswordAddonProps) {
  const t = useExtracted();

  const showPasswordLabel = t("Show password");
  const hidePasswordLabel = t("Hide password");

  const label = isPasswordVisible ? hidePasswordLabel : showPasswordLabel;

  return (
    <InputGroupButton
      variant="ghost"
      size="icon-xs"
      aria-label={label}
      title={label}
      onClick={() => setIsPasswordVisible((prev) => !prev)}
      {...props}
    >
      {isPasswordVisible ? (
        <LucideEye aria-hidden="true" />
      ) : (
        <LucideEyeOff aria-hidden="true" />
      )}
    </InputGroupButton>
  );
}
