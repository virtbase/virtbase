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

import { and, eq, gt } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { dataExports } from "@virtbase/db/schema";
import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth/server";

/**
 * Serves a finished data export.
 *
 * A route handler rather than a tRPC procedure because the artifact is
 * megabytes of binary: the invoice download endpoint base64s a single PDF
 * through JSON, which is fine for 50KB and wasteful at fifty times that.
 *
 * The bytes are already encrypted with a passphrase the customer holds, so
 * this endpoint is not the only thing standing between an attacker and the
 * data - but it still checks ownership, status and expiry, because handing out
 * even an encrypted dossier to the wrong session is not something to be
 * relaxed about.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;

  const row = await db
    .select({
      id: dataExports.id,
      artifact: dataExports.artifact,
      byteSize: dataExports.byteSize,
    })
    .from(dataExports)
    .where(
      and(
        eq(dataExports.id, id),
        // [!] Authorization: only the owner, only once it is built, only before
        // it expires. A single `where` so none of the three can be forgotten.
        eq(dataExports.userId, session.user.id),
        eq(dataExports.status, "ready"),
        gt(dataExports.expiresAt, new Date()),
      ),
    )
    .limit(1)
    .then(([found]) => found);

  if (!row?.artifact) {
    // Deliberately indistinguishable from "not yours" and "expired". Which of
    // the three it is would tell an attacker whether the id exists.
    return new Response("Not found", { status: 404 });
  }

  // Recorded, not spent. A download interrupted halfway should not destroy the
  // only copy of an archive that took a hundred provider calls to assemble;
  // expiry is what bounds its life.
  await db
    .update(dataExports)
    .set({ downloadedAt: new Date() })
    .where(eq(dataExports.id, row.id));

  // A view over the same memory rather than a copy - the artifact is
  // megabytes, and a serverless function has little enough of it. The cast
  // narrows `ArrayBufferLike` to `ArrayBuffer`, which `BodyInit` insists on;
  // a Node `Buffer` is never backed by a `SharedArrayBuffer`, and the offset
  // and length are what make this correct for a pooled one.
  const body = new Uint8Array(
    row.artifact.buffer as ArrayBuffer,
    row.artifact.byteOffset,
    row.artifact.byteLength,
  );

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": `${row.artifact.byteLength}`,
      "Content-Disposition": `attachment; filename="virtbase-data-export.pdf"`,
      // Never let a shared cache anywhere near this.
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}
