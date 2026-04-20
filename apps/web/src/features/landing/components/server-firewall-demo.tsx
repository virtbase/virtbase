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

import { Button } from "@virtbase/ui/button";
import { Card, CardContent } from "@virtbase/ui/card";
import { Field, FieldGroup } from "@virtbase/ui/field";
import {
  ChevronDownIcon,
  ChevronsUpDown,
  LucideArrowRightCircle,
  LucideXCircle,
} from "@virtbase/ui/icons";
import { Input } from "@virtbase/ui/input";
import { Label } from "@virtbase/ui/label";
import { useExtracted } from "next-intl";

export default function ServerFirewallDemo(
  props: React.ComponentProps<typeof Card>,
) {
  const t = useExtracted();

  return (
    <Card {...props}>
      <CardContent>
        <FieldGroup>
          <div className="grid gap-4 md:grid-cols-2">
            <Field>
              <Label htmlFor="direction">{t("Direction")}</Label>
              <Button
                id="direction"
                variant="outline"
                className="flex w-fit items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <LucideArrowRightCircle
                    aria-hidden="true"
                    className="text-muted-foreground"
                  />
                  <span className="truncate">{t("Incoming")}</span>
                </div>
                <ChevronDownIcon className="size-4 opacity-50" />
              </Button>
            </Field>
            <Field>
              <Label htmlFor="action">{t("Action")}</Label>
              <Button
                id="action"
                variant="outline"
                className="flex w-fit items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <LucideXCircle
                    aria-hidden="true"
                    className="text-muted-foreground"
                  />
                  <span className="truncate">{t("Reject")}</span>
                </div>
                <ChevronDownIcon className="size-4 opacity-50" />
              </Button>
            </Field>
          </div>
          <Field>
            <Label htmlFor="proto">{t("Protocol")}</Label>
            <Button
              variant="outline"
              className="justify-between !dark:bg-input"
              id="proto"
            >
              <div className="flex items-center gap-2">tcp</div>
              <ChevronsUpDown className="opacity-50" />
            </Button>
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field>
              <Label htmlFor="sport">{t("Source port")}</Label>
              <Input
                id="sport"
                type="text"
                inputMode="numeric"
                placeholder="0-65535"
              />
            </Field>
            <Field>
              <Label htmlFor="dport">{t("Destination port")}</Label>
              <Input
                id="dport"
                type="text"
                inputMode="numeric"
                placeholder="0-65535"
              />
            </Field>
          </div>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}
