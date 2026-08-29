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

import * as z from "zod";
import type { AbuseClassification } from "./classify";

const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;

/**
 * The addresses the model named that are really in the message.
 *
 * A language model asked for an IP will produce one whether or not it is
 * there. Requiring the value to appear verbatim in the source text turns the
 * model into a highlighter rather than a source of facts - it can only ever
 * point at something the reporter wrote.
 *
 * Defanged notations (`1.2.3[.]4`, `1.2.3(.)4`) are normalised first, because
 * security teams write them that way on purpose.
 */
export const verifiedAddresses = (
  classification: AbuseClassification,
  sourceText: string,
): string[] => {
  const defanged = sourceText
    .replace(/\[\.\]/g, ".")
    .replace(/\(\.\)/g, ".")
    .replace(/\s+dot\s+/gi, ".");

  const present = new Set(defanged.match(IPV4) ?? []);

  return [
    ...new Set(
      classification.addresses
        .map((address) => address.trim())
        .filter((address) => present.has(address))
        .filter((address) => z.ipv4().safeParse(address).success),
    ),
  ];
};
