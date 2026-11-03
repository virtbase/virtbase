/*
 * Copyright (C) 2026 BeastHost UG (haftungsbeschränkt)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import type { ReactNode } from "react";

/**
 * `<Ui>Create Backup</Ui>`: something the reader finds on screen - a button, a
 * tab, a field, a menu entry or a status - spelled exactly as it appears there.
 * Drawn like a quiet button so it stands out from emphasis.
 */
export function Ui({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-md border border-border bg-muted/60 px-1.5 py-px font-medium text-[0.92em] text-foreground [box-decoration-break:clone]">
      {children}
    </span>
  );
}

/**
 * `<Msg>Could not create the backup.</Msg>`: text the product shows or sends -
 * an error, a confirmation, an email subject - quoted as it reads. `<q>` takes
 * the quotation marks of the page's language.
 */
export function Msg({ children }: { children: ReactNode }) {
  return <q className="font-medium text-foreground">{children}</q>;
}
