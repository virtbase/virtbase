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

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@virtbase/ui/card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@virtbase/ui/input-group";
import { APP_NAME } from "@virtbase/utils";
import { useParams } from "next/navigation";
import { useExtracted } from "next-intl";
import { CopyButton } from "@/ui/copy-button";

export function ServerIdCard() {
  const t = useExtracted();
  const serverId = useParams<{ id: string }>().id;

  return (
    <Card className="overflow-hidden pb-0">
      <CardHeader>
        <CardTitle>{t("Server ID")}</CardTitle>
        <CardDescription>
          {t("This is the unique identifier of this server.")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <InputGroup className="max-w-md">
          <InputGroupInput value={serverId} readOnly />
          <InputGroupAddon align="inline-end">
            <CopyButton value={serverId} />
          </InputGroupAddon>
        </InputGroup>
      </CardContent>
      <CardFooter className="border-t bg-background [.border-t]:p-6">
        <p className="text-center text-muted-foreground text-sm">
          {t("{appName} support may use this to identify your server.", {
            appName: APP_NAME,
          })}
        </p>
      </CardFooter>
    </Card>
  );
}
