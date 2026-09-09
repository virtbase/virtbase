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

import { connection } from "next/server";
import { DataExportCard } from "@/features/account/components/privacy/data-export-card";
import { DeleteAccountCard } from "@/features/account/components/privacy/delete-account-card";

export default async function Page() {
  // The only request-time page in the account tree, and only because
  // `DataExportCard` reads `useNow()` to age the export it shows. On the server
  // that is `new Date()`, which a prerender cannot bake in. Scoped to this page
  // rather than the account layout, so the siblings that do not prefetch keep
  // their shells - the ones that do are request-time for their own reasons.
  //
  // Nothing is lost visually: the card's data comes from a client query and it
  // renders its own skeleton until that resolves, so the first paint is the
  // same either way.
  await connection();

  return (
    <>
      <DataExportCard />
      <DeleteAccountCard />
    </>
  );
}
