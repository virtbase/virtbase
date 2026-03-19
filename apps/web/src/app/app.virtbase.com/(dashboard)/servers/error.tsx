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

import * as Sentry from "@sentry/nextjs";
import { Button } from "@virtbase/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@virtbase/ui/empty";
import { LucideServerCrash } from "@virtbase/ui/icons";
import { useExtracted } from "next-intl";
import { useEffect } from "react";

export default function ServerError({
  reset,
  error,
}: {
  reset: () => void;
  error: Error & { digest?: string };
}) {
  const t = useExtracted();

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <LucideServerCrash aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{t("An error occurred")}</EmptyTitle>
        <EmptyDescription>
          {t("An unexpected error occurred while loading the server details.")}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={() => reset()}>{t("Try again")}</Button>
      </EmptyContent>
    </Empty>
  );
}
