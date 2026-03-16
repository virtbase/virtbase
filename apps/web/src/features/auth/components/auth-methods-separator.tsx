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

import { useExtracted } from "next-intl";

export function AuthMethodsSeparator() {
  const t = useExtracted();

  return (
    <div className="my-3 flex shrink items-center justify-center gap-2">
      <div className="grow basis-0 border-border border-b" />
      <span className="font-medium text-muted-foreground text-xs uppercase leading-none">
        {t("or")}
      </span>
      <div className="grow basis-0 border-border border-b" />
    </div>
  );
}
