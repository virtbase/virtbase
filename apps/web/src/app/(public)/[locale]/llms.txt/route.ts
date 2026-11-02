/*
 * Copyright (C) 2026 BeastHost UG (haftungsbeschränkt)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { hasLocale } from "next-intl";
import { llmsTxtResponse } from "@/features/markdown/llms-txt.ts";
import { locales } from "@/i18n/config.ts";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

/** `llms.txt` for one locale, at `/<locale>/llms.txt`. */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/[locale]/llms.txt">,
) {
  const { locale } = await params;
  if (!hasLocale(locales, locale)) {
    return new Response("Not found\n", { status: 404 });
  }
  return llmsTxtResponse(locale);
}
