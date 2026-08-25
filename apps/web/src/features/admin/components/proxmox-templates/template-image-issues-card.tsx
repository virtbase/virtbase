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

import { cn } from "@virtbase/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@virtbase/ui/card";
import {
  LucideCircleAlert,
  LucideCircleHelp,
  LucideCloudDownload,
} from "@virtbase/ui/icons/index";
import { getExtracted } from "next-intl/server";
import { ItemRow } from "@/features/account/components/item-row";

type NodeImage = {
  proxmoxNodeId: string;
  hostname: string;
  downloadedAt: Date | null;
  failedAt: Date | null;
  lastError: string | null;
  upid: string | null;
};

/**
 * Says what is wrong with a template's image, and nothing when nothing is.
 *
 * Deliberately not a list of every node: that grows with the fleet and would
 * push the settings off the page to tell an operator something they already
 * expect. A node whose image is ready is not news. Only the ones blocking the
 * template from being offered are worth the space.
 */
export async function TemplateImageIssuesCard({
  nodes,
}: {
  nodes: NodeImage[];
}) {
  const t = await getExtracted();

  const failed = nodes.filter((node) => node.failedAt);
  const downloading = nodes.filter((node) => !node.downloadedAt && node.upid);
  const missing = nodes.filter(
    (node) => !node.downloadedAt && !node.failedAt && !node.upid,
  );

  if (failed.length === 0 && downloading.length === 0 && missing.length === 0) {
    return null;
  }

  // One distinct error is worth quoting; several are almost always the same
  // cause, and the node list is the wrong place to read a stack of them.
  const errors = [...new Set(failed.map((node) => node.lastError))].filter(
    Boolean,
  );

  return (
    <Card className="gap-0 overflow-hidden pb-0">
      <CardHeader className="pb-4">
        <CardTitle>{t("Image availability")}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {failed.length > 0 && (
          <ItemRow
            className="border-x-0 border-b-0 p-6"
            icon={
              <LucideCircleAlert
                aria-hidden="true"
                className={cn("size-5", "text-destructive")}
              />
            }
            rightSide={null}
          >
            <p className="font-medium">
              {t("Download failed on {count} of {total} nodes", {
                count: String(failed.length),
                total: String(nodes.length),
              })}
            </p>
            <p className="text-muted-foreground text-sm">
              {errors[0] ?? t("The node did not say why.")}
            </p>
          </ItemRow>
        )}

        {missing.length > 0 && (
          <ItemRow
            className="border-x-0 border-b-0 p-6"
            icon={
              <LucideCircleHelp
                aria-hidden="true"
                className="size-5 text-yellow-600"
              />
            }
            rightSide={null}
          >
            <p className="font-medium">
              {t("Not downloaded on {count} of {total} nodes", {
                count: String(missing.length),
                total: String(nodes.length),
              })}
            </p>
            <p className="text-muted-foreground text-sm">
              {t(
                "The hourly refresh will fetch it, or you can start the download now.",
              )}
            </p>
          </ItemRow>
        )}

        {downloading.length > 0 && (
          <ItemRow
            className="border-x-0 border-b-0 p-6"
            icon={
              <LucideCloudDownload
                aria-hidden="true"
                className="size-5 text-muted-foreground"
              />
            }
            rightSide={null}
          >
            <p className="font-medium">
              {t("Downloading on {count} of {total} nodes", {
                count: String(downloading.length),
                total: String(nodes.length),
              })}
            </p>
            <p className="text-muted-foreground text-sm">
              {t("Reload later to see where it got to.")}
            </p>
          </ItemRow>
        )}
      </CardContent>
    </Card>
  );
}
