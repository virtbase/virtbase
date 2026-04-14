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

"use client";

import { Button } from "@virtbase/ui/button";
import { LucidePlus } from "@virtbase/ui/icons";
import dynamic from "next/dynamic";
import { useExtracted } from "next-intl";
import { useState } from "react";
import type { getLinkableDatacenters } from "../../api/datacenters/get-linkable-datacenters";
import type { getLinkableProxmoxNodeGroups } from "../../api/proxmox-node-groups/get-linkable-proxmox-node-groups";

const CreateNodeDialog = dynamic(() => import("./create-node-dialog"), {
  ssr: false,
});

export function CreateNodeButton({
  promises,
}: {
  promises: [
    ReturnType<typeof getLinkableDatacenters>,
    ReturnType<typeof getLinkableProxmoxNodeGroups>,
  ];
}) {
  const t = useExtracted();

  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <LucidePlus aria-hidden="true" />
        {t("Create Proxmox Node")}
      </Button>
      {open && (
        <CreateNodeDialog
          promises={promises}
          open={open}
          onOpenChange={setOpen}
        />
      )}
    </>
  );
}
