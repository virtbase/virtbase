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
import { AdvancedTpmSelector } from "./advanced-tpm-selector";

export function AdvancedTpmCard() {
  const t = useExtracted();

  return (
    <Card className="overflow-hidden pb-0">
      <CardHeader>
        <CardTitle>{t("TPM")}</CardTitle>
        <CardDescription>
          {t("Enable or disable the TPM module for your server.")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AdvancedTpmSelector />
      </CardContent>
      <CardFooter className="border-t bg-background [.border-t]:p-6">
        <p className="text-center text-muted-foreground text-sm">
          {t(
            "Most Linux installations don't require TPM, whereas Windows requires TPM v2.0.",
          )}
        </p>
      </CardFooter>
    </Card>
  );
}
