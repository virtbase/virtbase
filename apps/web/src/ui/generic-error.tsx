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
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@virtbase/ui/empty";
import { LucideAlertTriangle } from "@virtbase/ui/icons/index";
import { useRouter } from "next/navigation";
import { useExtracted } from "next-intl";

interface GenericErrorProps extends React.ComponentProps<typeof Empty> {
  reset?: () => void;
}

export function GenericError({ reset, ...props }: GenericErrorProps) {
  const t = useExtracted();
  const router = useRouter();

  const resetFn = reset ?? router.refresh;

  return (
    <Empty {...props}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <LucideAlertTriangle aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{t("An error occurred")}</EmptyTitle>
        <EmptyDescription>
          {t("An unexpected error occurred while loading the data.")}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={() => resetFn()}>{t("Try again")}</Button>
      </EmptyContent>
    </Empty>
  );
}
