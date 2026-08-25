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

import { renderTemplateVendorData } from "@virtbase/api/cloud-init";
import { db } from "@virtbase/db/client";
import { Badge } from "@virtbase/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@virtbase/ui/card";
import { getExtracted } from "next-intl/server";

/**
 * The exact cloud-init vendor data this template will hand a guest.
 *
 * Rendered through the same function the workflow uses, so what is shown here
 * is not an approximation of the document - it is the document.
 */
export async function VendorDataPreview({
  proxmoxTemplateId,
}: {
  proxmoxTemplateId: string;
}) {
  const t = await getExtracted();

  const { content, applied, conflicts, errors } =
    await renderTemplateVendorData({ db, proxmoxTemplateId });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{t("Cloud-init vendor data")}</CardTitle>
        <div className="flex flex-wrap gap-1.5">
          {applied.length === 0 ? (
            <span className="text-muted-foreground text-xs">
              {t("No snippets match this template.")}
            </span>
          ) : (
            applied.map((slug) => (
              <Badge key={slug} variant="outline">
                {slug}
              </Badge>
            ))
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {errors.length > 0 && (
          <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3">
            <p className="mb-1 font-medium text-destructive text-sm">
              {t("Skipped snippets")}
            </p>
            <ul className="list-inside list-disc text-destructive text-sm">
              {errors.map((error) => (
                <li key={error.slug}>
                  {error.slug}: {error.message}
                  {error.line ? ` (line ${error.line})` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}

        {conflicts.length > 0 && (
          <div className="rounded-md border border-amber-500/50 bg-amber-500/5 p-3">
            <p className="mb-1 font-medium text-sm">{t("Overridden keys")}</p>
            <ul className="list-inside list-disc text-sm">
              {conflicts.map((conflict) => (
                <li key={`${conflict.path}-${conflict.nextSlug}`}>
                  {conflict.nextSlug} set {conflict.path} to {conflict.next},
                  replacing {conflict.previous} from {conflict.previousSlug}
                </li>
              ))}
            </ul>
          </div>
        )}

        {content ? (
          <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 font-mono text-xs">
            {content}
          </pre>
        ) : (
          <p className="text-muted-foreground text-sm">
            {t("Nothing would be uploaded for this template.")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
