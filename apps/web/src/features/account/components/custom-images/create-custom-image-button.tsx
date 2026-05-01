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
import dynamic from "next/dynamic";
import { useExtracted } from "next-intl";
import { useState } from "react";

const CreateCustomImageDialog = dynamic(
  () => import("./create-custom-image-dialog"),
  {
    ssr: false,
  },
);

export function CreateCustomImageButton() {
  const t = useExtracted();

  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} disabled={open}>
        {t("Create Custom Image")}
      </Button>
      {open && <CreateCustomImageDialog open={open} onOpenChange={setOpen} />}
    </>
  );
}
