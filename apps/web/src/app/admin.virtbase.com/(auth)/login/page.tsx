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

import type { Metadata } from "next";
import { generateMetadata as generateAuthMetadata } from "@/app/app.virtbase.com/(auth)/login/page";

export async function generateMetadata(): Promise<Metadata> {
  const meta = await generateAuthMetadata();

  return {
    ...meta,
    robots: {
      index: false,
      follow: false,
    },
  };
}

export { default } from "@/app/app.virtbase.com/(auth)/login/page";
