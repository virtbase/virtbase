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

import { useAction } from "next-safe-action/hooks";
import { createUserExportAction } from "../../api/users/create-user-export";

export function useExportUser() {
  const action = useAction(createUserExportAction, {
    onSuccess: ({ data: blob, input }) => {
      const anchor = document.createElement("a");

      anchor.style = "display: none";
      anchor.ariaHidden = "true";

      const url = window.URL.createObjectURL(blob);
      anchor.href = url;
      anchor.download = `${input.user_id}.pdf`;

      document.body.appendChild(anchor);
      anchor.click();

      window.URL.revokeObjectURL(url);
      document.body.removeChild(anchor);

      action.reset();
    },
  });

  return action;
}
