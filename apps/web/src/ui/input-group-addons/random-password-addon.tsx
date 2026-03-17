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

import { LucideDices } from "@virtbase/ui/icons";
import { InputGroupButton } from "@virtbase/ui/input-group";
import { generatePassword } from "@virtbase/utils";
import { useExtracted } from "next-intl";

export function RandomPasswordAddon({
  onClick,
  ...props
}: Omit<
  React.ComponentProps<typeof InputGroupButton>,
  "aria-label" | "title" | "onClick"
> & {
  onClick: (password: string) => void;
}) {
  const t = useExtracted();
  const label = t("Generate random password");

  return (
    <InputGroupButton
      variant="ghost"
      size="icon-xs"
      aria-label={label}
      title={label}
      onClick={() => {
        onClick(generatePassword(12));
      }}
      {...props}
    >
      <LucideDices aria-hidden="true" />
    </InputGroupButton>
  );
}
