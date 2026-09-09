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

import { Suspense } from "react";
import { ServerNavView } from "./server-nav-view";

/**
 * The server tab bar, resolved from the route rather than from a client hook.
 *
 * Reading the id with `await params` instead of `useParams()` is what lets this
 * subtree be prerendered. A build-time fallback shell has no id, so a client
 * hook could only block the whole route; awaiting it suspends just this one
 * component, and the shell ships with the nav already drawn by
 * `ServerNavFallback`.
 */
async function ResolvedServerNav({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <ServerNavView serverId={id} />;
}

/** The nav as it appears before the id is known - complete, but inert. */
function ServerNavFallback() {
  return <ServerNavView serverId={null} />;
}

export function ServerNav({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<ServerNavFallback />}>
      <ResolvedServerNav params={params} />
    </Suspense>
  );
}
