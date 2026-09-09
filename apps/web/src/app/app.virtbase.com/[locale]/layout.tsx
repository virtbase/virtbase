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

import { locales } from "@/i18n/config";
import ConsoleLayout from "@/ui/layout/console-layout";

export {
  defaultMetadata as metadata,
  defaultViewport as viewport,
} from "@/ui/document";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function Layout({
  children,
}: LayoutProps<"/app.virtbase.com/[locale]">) {
  return <ConsoleLayout>{children}</ConsoleLayout>;
}
