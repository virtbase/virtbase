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

"use server";

import { TRPCError } from "@trpc/server";
import { eq } from "@virtbase/db";
import { db } from "@virtbase/db/client";
import { cloudInitSnippets } from "@virtbase/db/schema";
import { validateSnippetContent } from "@virtbase/utils";
import {
  CreateCloudInitSnippetInputSchema,
  DeleteCloudInitSnippetInputSchema,
  UpdateCloudInitSnippetInputSchema,
} from "@virtbase/validators/admin";
import { revalidatePath, revalidateTag } from "next/cache";
import { actionClient } from "../../lib/action-client";

/**
 * Parses the body exactly as the renderer will.
 *
 * Validation happens here rather than on the provisioning path on purpose: a
 * snippet that cannot parse must not be storable, because by the time a
 * workflow reads it there is nobody around to fix it.
 */
const assertParses = (content: string, kind: "cloud-config" | "shell") => {
  const error = validateSnippetContent(content, kind);

  if (error) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        error.line && error.column
          ? `Line ${error.line}, column ${error.column}: ${error.message}`
          : error.message,
    });
  }
};

const revalidate = () => {
  revalidateTag("cloud-init-snippets", "max");
  revalidatePath("/admin.virtbase.com");
};

export const createSnippetAction = actionClient
  .inputSchema(CreateCloudInitSnippetInputSchema)
  .action(async ({ parsedInput }) => {
    assertParses(parsedInput.content, parsedInput.kind);

    let id: string;
    try {
      // Returned so the caller can send the operator straight to the editor,
      // which is where the body is actually written.
      const [row] = await db
        .insert(cloudInitSnippets)
        .values(parsedInput)
        .returning({ id: cloudInitSnippets.id });

      if (!row) throw new Error("insert returned no row");
      id = row.id;
    } catch {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Failed to create the snippet. Is the slug already taken?",
      });
    }

    revalidate();

    return { id };
  });

export const updateSnippetAction = actionClient
  .inputSchema(UpdateCloudInitSnippetInputSchema)
  .action(async ({ parsedInput }) => {
    assertParses(parsedInput.content, parsedInput.kind);

    const { id, ...values } = parsedInput;

    try {
      await db
        .update(cloudInitSnippets)
        .set(values)
        .where(eq(cloudInitSnippets.id, id));
    } catch {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Failed to update the snippet. Is the slug already taken?",
      });
    }

    revalidate();
  });

export const deleteSnippetAction = actionClient
  .inputSchema(DeleteCloudInitSnippetInputSchema)
  .action(async ({ parsedInput }) => {
    await db
      .delete(cloudInitSnippets)
      .where(eq(cloudInitSnippets.id, parsedInput.id));

    revalidate();
  });
