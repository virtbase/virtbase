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

import ColoredLayout from "@/ui/layout/colored-layout";
import { DefaultJsonLd } from "@/ui/seo/default-json-ld";

export default function Layout({
  children,
}: LayoutProps<"/app.virtbase.com/[locale]">) {
  return (
    <ColoredLayout>
      {children}
      <DefaultJsonLd />
    </ColoredLayout>
  );
}
