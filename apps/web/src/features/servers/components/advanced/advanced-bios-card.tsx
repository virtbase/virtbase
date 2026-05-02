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

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@virtbase/ui/card";
import { useExtracted } from "next-intl";
import { AdvancedBiosSelector } from "./advanced-bios-selector";

export function AdvancedBiosCard() {
  const t = useExtracted();

  return (
    <Card className="overflow-hidden pb-0">
      <CardHeader>
        <CardTitle>{t("BIOS")}</CardTitle>
        <CardDescription>
          {t("Select the BIOS type for your server.")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AdvancedBiosSelector />
      </CardContent>
      <CardFooter className="border-t bg-background [.border-t]:p-6">
        <p className="text-center text-muted-foreground text-sm">
          {t(
            "UEFI BIOS is recommended for Windows installations. Use the legacy BIOS for older Linux installations.",
          )}
        </p>
      </CardFooter>
    </Card>
  );
}
